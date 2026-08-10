import { cardContext, fileContext, type ActionContext } from '../../data/action_context'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../../data/action_types'
import type { ActionRunEvent } from '../../data/action_run_types'
import {
    type AgentConversation,
    type AgentConversationError,
    type MarkdownFile,
    type Card,
    type ProjectReference,
    type ProjectSnapshot,
    type StorageService,
} from '../../data/data_types'
import { actionService } from '../actions/action_service'
import { actionRunRegistry } from '../actions/action_run_registry'
import { agentAcknowledgementService } from './agent_acknowledgement_service'
import { listAgentConversationReferences, loadAgentConversation } from './agent_conversation_service'
import { runElectronAction } from '../actions/electron_action_runner'
import { mapWithConcurrency } from '../concurrency'
import { type RequiredDataServiceDependencies } from '../data/data_service_context'
import { telemetryService } from '../telemetry/telemetry_service'
import { dialogService } from '../dialog_service'
import { parseConversationActivityReference } from '../../../../shared/activity_paths.mjs'
import { repairProjectActivities } from './activity_repair'

const AGENT_CONVERSATION_LOAD_CONCURRENCY = 8
const ON_STATE_ACTION_ERROR_PATH_PREFIX = 'onState'

interface ResolvedAgentConversations {
    conversationsByCardInternalId: Map<string, AgentConversation[]>
    errorsByCardPath: Map<string, AgentConversationError[]>
}

interface AgentConversationLoadTask {
    cardInternalId: string
    cardPath: string
    reference: string
}

type AgentConversationLoadResult =
    | { cardInternalId: string; cardPath: string; conversation: AgentConversation; error: null }
    | { cardInternalId: string; cardPath: string; conversation: null; error: AgentConversationError }

export interface AgentIntegrationDeps {
    beginAgentConversationLoad(): number
    deferAutomaticCommit(): () => void
    flushActivityRepairs(): Promise<void>
    isCurrentAgentConversationLoad(agentConversationLoadToken: number): boolean
    isCurrentLoad(project: ProjectReference, projectLoadToken: number): boolean
    project(): ProjectReference | null
    refreshSnapshot(workingFolder: string): void
    requireDependencies(): RequiredDataServiceDependencies
    requireFile(path: string): MarkdownFile
    scheduleActivityRepair(file: MarkdownFile): void
    setAgentLogReferences(cardPath: string, references: string[]): void
    snapshot(): ProjectSnapshot | null
    conversationChanged(cardPath: string): void
}

function isOnStateActionError(error: AgentConversationError) {
    return error.path.startsWith(`${ON_STATE_ACTION_ERROR_PATH_PREFIX}:`)
}

function mergeAgentConversations(existing: AgentConversation[], loaded: AgentConversation[]) {
    const conversationsById = new Map(existing.map((conversation) => [conversation.id, conversation]))
    loaded.forEach((conversation) => conversationsById.set(conversation.id, conversation))

    return [...conversationsById.values()]
}

function cardsForAgentConversationLoading(snapshot: ProjectSnapshot) {
    return snapshot.activeCards
}

async function loadAgentConversationReference(
    task: AgentConversationLoadTask,
    project: ProjectReference,
    storage: StorageService,
    conversationsByReference: Map<string, AgentConversation>,
    knownActivityPaths: Set<string>,
): Promise<AgentConversationLoadResult> {
    try {
        const { activityPath } = parseConversationActivityReference(task.reference)
        const repairedConversation = conversationsByReference.get(task.reference)
        if (knownActivityPaths.has(activityPath) && !repairedConversation) {
            throw new Error(`Activity conversation not found: ${task.reference}`)
        }
        const conversation = repairedConversation ?? await loadAgentConversation(storage, project, task.reference)
        if (conversation.cardInternalId !== task.cardInternalId) {
            throw new Error(`Agent conversation belongs to ${conversation.cardInternalId}, not ${task.cardInternalId}`)
        }

        return { cardInternalId: task.cardInternalId, cardPath: task.cardPath, conversation, error: null }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Agent conversation failed to load'
        telemetryService.captureError(error)

        return {
            cardInternalId: task.cardInternalId,
            cardPath: task.cardPath,
            conversation: null,
            error: { message, path: task.reference },
        }
    }
}

async function resolveAgentConversations(
    cards: ProjectSnapshot['activeCards'],
    project: ProjectReference,
    storage: StorageService,
    conversationsByReference: Map<string, AgentConversation>,
    knownActivityPaths: Set<string>,
): Promise<ResolvedAgentConversations> {
    const conversationsByCardInternalId = new Map<string, AgentConversation[]>()
    const errorsByCardPath = new Map<string, AgentConversationError[]>()
    const tasks = cards.flatMap((card) => {
        const cardInternalId = card.header.internalId
        if (!cardInternalId) throw new Error(`Cannot load card conversations without an internal ID: ${card.path}`)

        return card.header.agentLogReferences.map((reference) => ({
            cardInternalId,
            cardPath: card.path,
            reference,
        }))
    })
    const results = await mapWithConcurrency(tasks, AGENT_CONVERSATION_LOAD_CONCURRENCY, async (task) => (
        loadAgentConversationReference(task, project, storage, conversationsByReference, knownActivityPaths)
    ))

    for (const result of results) {
        if (result.error) {
            errorsByCardPath.set(result.cardPath, [...(errorsByCardPath.get(result.cardPath) ?? []), result.error])
            continue
        }

        const conversations = conversationsByCardInternalId.get(result.cardInternalId) ?? []
        conversationsByCardInternalId.set(result.cardInternalId, [...conversations, result.conversation])
    }

    return { conversationsByCardInternalId, errorsByCardPath }
}

export class AgentIntegration {
    private activityRepairComplete = false
    private activityRepairReady: Promise<void> = Promise.resolve()
    private completeActivityRepair: (() => void) | null = null
    private agentConversationLoadToken: number | null = null
    private completedConversationLoads: Set<string> = new Set()
    private conversationsByCardInternalId: Map<string, AgentConversation[]> = new Map()
    private conversationLoadGeneration = 0
    private conversationLoadsInFlight: Map<string, Promise<void>> = new Map()
    private currentProjectLoadToken: number | null = null
    private readonly dependencies: AgentIntegrationDeps
    private errorsByCardPath: Map<string, AgentConversationError[]> = new Map()
    private projectConversations: AgentConversation[] = []
    private projectConversationReferences: string[] = []
    private reportedLoadErrorKeys: Set<string> = new Set()
    private repairedConversationsByReference: Map<string, AgentConversation> = new Map()
    private repairedActivityPaths: Set<string> = new Set()
    private readonly addAgentLogReference: (cardPath: string, reference: string) => string | null
    private scheduledRunCleanup: (() => void) | null = null

    constructor(
        dependencies: AgentIntegrationDeps,
        addAgentLogReference: (cardPath: string, reference: string) => string | null,
    ) {
        this.dependencies = dependencies
        this.addAgentLogReference = addAgentLogReference
    }

    reset() {
        this.stopScheduledRunWatch()
        this.resetLoadedConversations()
    }

    resetLoadedConversations() {
        this.completeActivityRepair?.()
        this.dependencies.beginAgentConversationLoad()
        this.agentConversationLoadToken = null
        this.activityRepairComplete = false
        this.activityRepairReady = Promise.resolve()
        this.completeActivityRepair = null
        this.completedConversationLoads.clear()
        this.conversationsByCardInternalId = new Map()
        this.conversationLoadGeneration += 1
        this.conversationLoadsInFlight.clear()
        this.currentProjectLoadToken = null
        this.errorsByCardPath = new Map()
        this.projectConversations = []
        this.projectConversationReferences = []
        this.repairedConversationsByReference = new Map()
        this.repairedActivityPaths = new Set()
        this.reportedLoadErrorKeys.clear()
        agentAcknowledgementService.reset()
    }

    /** Resolves the loaded record matching a conversation, so view changes update the canonical instance. */
    findStoredConversation(conversation: AgentConversation) {
        if (!conversation.cardInternalId) return null

        return (this.conversationsByCardInternalId.get(conversation.cardInternalId) ?? [])
            .find(({ id }) => id === conversation.id) ?? null
    }

    startScheduledRunWatch() {
        this.stopScheduledRunWatch()
        this.scheduledRunCleanup = actionRunRegistry.subscribeActiveRunEvents((event) => {
            try {
                this.handleActionRunEvent(event)
            } catch (error) {
                telemetryService.captureError(error)
            }
        })
    }

    stopScheduledRunWatch() {
        if (!this.scheduledRunCleanup) return

        this.scheduledRunCleanup()
        this.scheduledRunCleanup = null
    }

    async continueAgentConversation(cardPath: string, sourcePath: string) {
        const { config } = this.dependencies.requireDependencies()
        const snapshot = this.dependencies.snapshot()
        const card = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
            .find((candidate) => candidate.path === cardPath)
        if (!card) throw new Error(`Cannot continue agent for unknown card: ${cardPath}`)
        if (!card.header.internalId) throw new Error(`Cannot continue agent for card without an internal ID: ${cardPath}`)
        const conversation = (this.conversationsByCardInternalId.get(card.header.internalId) ?? [])
            .find(({ path }) => path === sourcePath)
        if (!conversation) throw new Error(`Unknown agent conversation: ${sourcePath}`)
        const action = conversation.actionId
            ? actionService.getActions().find(({ id }) => id === conversation.actionId)
            : BUILTIN_CUSTOM_PROMPT
        if (!action) throw new Error(`Unknown originating action: ${conversation.actionId}`)

        return runElectronAction(action, fileContext(card, config.cardTypes), { continueFrom: sourcePath })
    }

    private saveAgentConversationReference(cardPath: string, reference: string) {
        return this.addAgentLogReference(cardPath, reference)
    }

    private linkAgentConversationReference(cardPath: string, reference: string) {
        const cardInternalId = this.saveAgentConversationReference(cardPath, reference)
        if (!cardInternalId) throw new Error(`Cannot link a card conversation without an internal ID: ${cardPath}`)
        void this.loadLinkedAgentConversation(cardInternalId, cardPath, reference)
    }

    private async loadLinkedAgentConversation(cardInternalId: string, cardPath: string, reference: string) {
        const project = this.dependencies.project()
        if (!project) return
        const { storage } = this.dependencies.requireDependencies()
        const result = await loadAgentConversationReference(
            { cardInternalId, cardPath, reference },
            project,
            storage,
            this.repairedConversationsByReference,
            this.repairedActivityPaths,
        )
        if (result.error) {
            const errors = [...(this.errorsByCardPath.get(cardPath) ?? []), result.error]
            this.errorsByCardPath.set(cardPath, errors)
            this.reportNewAgentLoadErrors(new Map([[cardPath, [result.error]]]))
            this.dependencies.conversationChanged(cardPath)
            return
        }

        this.upsertAgentConversation(cardInternalId, result.conversation)
    }

    async loadAgentConversationsInBackground(snapshot: ProjectSnapshot, project: ProjectReference, projectLoadToken: number) {
        this.prepareProjectConversationLoad(projectLoadToken)
        try {
            await this.repairProjectActivity(snapshot, project, projectLoadToken)
        } catch (error) {
            dialogService.warning('Activity files could not be repaired and agent conversations were skipped.', { title: 'Activity repair failed' })
            telemetryService.captureError(error)
            return
        } finally {
            this.completeActivityRepair?.()
            this.completeActivityRepair = null
        }
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return
        const cards = cardsForAgentConversationLoading(snapshot)

        const results = await Promise.allSettled([
            this.ensureProjectAgentConversationsLoaded(project, projectLoadToken),
            this.ensureCardGroupLoaded(cards, project, projectLoadToken),
        ])
        for (const result of results) {
            if (result.status !== 'rejected') continue

            dialogService.warning('Agent conversations could not be loaded and were skipped.', { title: 'Some agent conversations were not loaded' })
            telemetryService.captureError(result.reason)
        }
    }

    async ensureAgentConversationsForCard(cardInternalId: string) {
        const project = this.dependencies.project()
        if (!project) throw new Error('Cannot load card conversations before a project is open')
        const projectLoadToken = this.requireProjectLoadToken()
        const identity = AgentIntegration.cardLoadIdentity(cardInternalId)
        const existingLoad = this.conversationLoadsInFlight.get(identity)
        if (existingLoad) {
            await existingLoad

            return this.getAgentConversations(cardInternalId)
        }
        if (this.completedConversationLoads.has(identity)) return this.getAgentConversations(cardInternalId)

        const snapshot = this.dependencies.snapshot()
        const activeCard = snapshot?.activeCards.find(({ header }) => header.internalId === cardInternalId)
        if (activeCard) return this.getAgentConversations(cardInternalId)

        const card = snapshot?.backgroundCards.find(({ header }) => header.internalId === cardInternalId)
        if (!card) throw new Error(`Cannot load conversations for unknown card: ${cardInternalId}`)

        await this.ensureCardGroupLoaded([card], project, projectLoadToken)

        return this.getAgentConversations(cardInternalId)
    }

    async listProjectAgentConversations() {
        const project = this.dependencies.project()
        if (!project) throw new Error('Cannot list project conversations before a project is open')
        const projectLoadToken = this.requireProjectLoadToken()
        await this.ensureProjectAgentConversationsLoaded(project, projectLoadToken)

        return this.projectConversations
    }

    private static cardLoadIdentity(cardInternalId: string) {
        return `card:${cardInternalId}`
    }

    prepareProjectConversationLoad(projectLoadToken: number) {
        if (this.currentProjectLoadToken === projectLoadToken) return

        this.completeActivityRepair?.()
        this.agentConversationLoadToken = this.dependencies.beginAgentConversationLoad()
        this.activityRepairReady = new Promise((resolve) => {
            this.completeActivityRepair = resolve
        })
        this.completedConversationLoads.clear()
        this.conversationLoadGeneration += 1
        this.conversationLoadsInFlight.clear()
        this.currentProjectLoadToken = projectLoadToken
    }

    private requireProjectLoadToken() {
        if (this.currentProjectLoadToken === null) throw new Error('Agent conversation loading has not started for the current project')

        return this.currentProjectLoadToken
    }

    private async ensureProjectAgentConversationsLoaded(project: ProjectReference, projectLoadToken: number) {
        await this.activityRepairReady
        const identity = 'project'
        if (this.completedConversationLoads.has(identity)) return
        const existingLoad = this.conversationLoadsInFlight.get(identity)
        if (existingLoad) return existingLoad

        const load = async () => {
            const { storage } = this.dependencies.requireDependencies()
            const references = this.activityRepairComplete
                ? this.projectConversationReferences
                : await listAgentConversationReferences(storage, project, this.dependencies.requireDependencies().config.projectFolder)
            const conversations = await mapWithConcurrency(references, AGENT_CONVERSATION_LOAD_CONCURRENCY, async (reference) => (
                this.repairedConversationsByReference.get(reference) ?? loadAgentConversation(storage, project, reference)
            ))
            if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

            this.projectConversations = conversations.filter(({ cardInternalId }) => cardInternalId === null)
        }

        return this.trackConversationLoad([identity], project, projectLoadToken, load)
    }

    private async ensureCardGroupLoaded(
        cards: ProjectSnapshot['activeCards'],
        project: ProjectReference,
        projectLoadToken: number,
    ) {
        const loads = new Set<Promise<void>>()
        const cardsToLoad = cards.filter((card) => {
            const cardInternalId = card.header.internalId
            if (!cardInternalId) throw new Error(`Cannot load card conversations without an internal ID: ${card.path}`)
            const identity = AgentIntegration.cardLoadIdentity(cardInternalId)
            if (this.completedConversationLoads.has(identity)) return false
            const existingLoad = this.conversationLoadsInFlight.get(identity)
            if (!existingLoad) return true

            loads.add(existingLoad)
            return false
        })
        if (cardsToLoad.length > 0) {
            const identities = cardsToLoad.map(({ header }) => AgentIntegration.cardLoadIdentity(header.internalId as string))
            const load = () => this.resolveAndAttachAgentConversations(cardsToLoad, project, projectLoadToken)
            loads.add(this.trackConversationLoad(identities, project, projectLoadToken, load))
        }

        await Promise.all(loads)
    }

    private trackConversationLoad(
        identities: string[],
        project: ProjectReference,
        projectLoadToken: number,
        load: () => Promise<void>,
    ) {
        const generation = this.conversationLoadGeneration
        const loadPromise = load()
        const trackedPromise = loadPromise.then(() => {
            if (generation !== this.conversationLoadGeneration) return
            if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

            identities.forEach((identity) => this.completedConversationLoads.add(identity))
        }).finally(() => {
            identities.forEach((identity) => {
                if (this.conversationLoadsInFlight.get(identity) === trackedPromise) {
                    this.conversationLoadsInFlight.delete(identity)
                }
            })
        })
        identities.forEach((identity) => this.conversationLoadsInFlight.set(identity, trackedPromise))

        return trackedPromise
    }

    getAgentConversations(cardInternalId: string) {
        return this.conversationsByCardInternalId.get(cardInternalId) ?? []
    }

    attachAgentConversations(cards: Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>) {
        return {
            activeCards: cards.activeCards.map((card) => this.attachCardAgentConversations(card)),
            backgroundCards: cards.backgroundCards.map((card) => this.attachCardAgentConversations(card)),
        }
    }

    private attachCardAgentConversations(card: Card) {
        card.agentConversationErrors = this.errorsByCardPath.get(card.path) ?? []
        card.agentConversations = card.header.internalId
            ? this.conversationsByCardInternalId.get(card.header.internalId) ?? []
            : []

        return card
    }

    /** Applies a persisted conversation returned by an atomic backend update. */
    updateAgentConversation(conversation: AgentConversation) {
        if (!conversation.cardInternalId) return

        this.upsertAgentConversation(conversation.cardInternalId, conversation)
    }

    triggerStateActions(cardPath: string, state: string) {
        const { config } = this.dependencies.requireDependencies()
        const card = this.dependencies.snapshot()?.activeCards.find((currentCard) => currentCard.path === cardPath)
        if (!card) return

        const context = cardContext(card, config.cardTypes)
        const actions = actionService.getActionsForStateTrigger(state, context)
        for (const action of actions) {
            void this.runStateAction(action, context, cardPath)
        }
    }

    private async resolveAndAttachAgentConversations(
        cards: ProjectSnapshot['activeCards'],
        project: ProjectReference,
        projectLoadToken: number,
    ) {
        const { config, storage } = this.dependencies.requireDependencies()
        const resolved = await resolveAgentConversations(
            cards,
            project,
            storage,
            this.repairedConversationsByReference,
            this.repairedActivityPaths,
        )
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

        for (const [cardInternalId, conversations] of resolved.conversationsByCardInternalId) {
            const existing = this.conversationsByCardInternalId.get(cardInternalId) ?? []
            this.conversationsByCardInternalId.set(cardInternalId, mergeAgentConversations(existing, conversations))
        }
        this.replaceResolvedAgentErrors(cards, resolved.errorsByCardPath)
        this.reportNewAgentLoadErrors(resolved.errorsByCardPath)
        this.dependencies.refreshSnapshot(config.workingFolder)
        cards.forEach(({ path }) => this.dependencies.conversationChanged(path))
        for (const [cardInternalId, conversations] of resolved.conversationsByCardInternalId) {
            const actionIds = conversations.flatMap(({ actionId }) => actionId ? [actionId] : [])
            agentAcknowledgementService.announceConversationsChanged(cardInternalId, actionIds)
        }
    }

    private shouldApplyProjectLoad(project: ProjectReference, projectLoadToken: number) {
        return this.currentProjectLoadToken === projectLoadToken
            && this.agentConversationLoadToken !== null
            && this.dependencies.isCurrentAgentConversationLoad(this.agentConversationLoadToken)
            && this.dependencies.isCurrentLoad(project, projectLoadToken)
    }

    private async repairProjectActivity(
        snapshot: ProjectSnapshot,
        project: ProjectReference,
        projectLoadToken: number,
    ) {
        const { config, storage } = this.dependencies.requireDependencies()
        if (!storage.loadTextFile) return
        const cards = [...snapshot.activeCards, ...snapshot.backgroundCards]
        const repair = await repairProjectActivities(
            cards,
            project,
            config.projectFolder,
            snapshot.repositoryFiles,
            storage,
        )
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

        this.projectConversationReferences = repair.projectConversationReferences
        this.repairedConversationsByReference = repair.conversationsByReference
        this.repairedActivityPaths = repair.knownActivityPaths
        this.activityRepairComplete = true
        const changedCards = cards.filter((card) => {
            const references = repair.referencesByCardPath.get(card.path) as string[]

            return references.length !== card.header.agentLogReferences.length
                || references.some((reference, index) => reference !== card.header.agentLogReferences[index])
        })
        if (repair.repairedFiles.length === 0 && changedCards.length === 0) return

        const releaseAutomaticCommit = this.dependencies.deferAutomaticCommit()
        try {
            repair.repairedFiles.forEach((file) => this.dependencies.scheduleActivityRepair(file))
            changedCards.forEach((card) => {
                this.dependencies.setAgentLogReferences(
                    card.path,
                    repair.referencesByCardPath.get(card.path) as string[],
                )
            })
            await this.dependencies.flushActivityRepairs()
        } catch (error) {
            dialogService.error(error, {
                fallbackMessage: 'Activity repairs could not be saved. Changes remain pending for retry.',
                title: 'Activity repair save failed',
            })
            telemetryService.captureError(error)
        } finally {
            releaseAutomaticCommit()
        }
    }

    private replaceResolvedAgentErrors(cards: ProjectSnapshot['activeCards'], resolvedErrors: Map<string, AgentConversationError[]>) {
        const errors = new Map(this.errorsByCardPath)
        for (const { path: cardPath } of cards) {
            const loadedErrors = resolvedErrors.get(cardPath) ?? []
            const existingErrors = errors.get(cardPath) ?? []
            const onStateErrors = existingErrors.filter(isOnStateActionError)
            const nextErrors = [...loadedErrors, ...onStateErrors]
            if (nextErrors.length === 0) {
                errors.delete(cardPath)
                continue
            }

            errors.set(cardPath, nextErrors)
        }

        this.errorsByCardPath = errors
    }

    private reportNewAgentLoadErrors(errorsByCardPath: Map<string, AgentConversationError[]>) {
        const newErrors: AgentConversationError[] = []
        for (const [cardPath, errors] of errorsByCardPath) {
            for (const error of errors) {
                const key = `${cardPath}:${error.path}:${error.message}`
                if (this.reportedLoadErrorKeys.has(key)) continue

                this.reportedLoadErrorKeys.add(key)
                newErrors.push(error)
            }
        }
        if (newErrors.length === 0) return

        const paths = newErrors.map(({ path }) => path).join(', ')
        dialogService.warning(`Some agent conversations could not be loaded and were skipped: ${paths}`, {title: 'Some agent conversations were not loaded'})
    }

    private async runStateAction(action: ActionDefinition, context: ActionContext, cardPath: string) {
        try {
            const result = await runElectronAction(action, context, {}, undefined, false)
            if (result.status === 'completed') return

            const failedLog = result.logs.find((log) => log.status === 'failed')
            this.recordCardAgentError(cardPath, action.id, failedLog?.message ?? `${action.label} failed`)
        } catch (error) {
            this.recordCardAgentError(cardPath, action.id, error instanceof Error ? error.message : `${action.label} failed`)
        }
    }

    private recordCardAgentError(cardPath: string, actionName: string, message: string) {
        const path = `${ON_STATE_ACTION_ERROR_PATH_PREFIX}:${actionName}`
        const { config } = this.dependencies.requireDependencies()
        this.errorsByCardPath.set(cardPath, [...(this.errorsByCardPath.get(cardPath) ?? []), { message, path }])
        this.dependencies.refreshSnapshot(config.workingFolder)
        this.dependencies.conversationChanged(cardPath)
    }

    private handleActionRunEvent(event: ActionRunEvent) {
        if (
            event.type === 'update'
            && event.update.kind === 'agentStarted'
            && event.context.kind === 'card'
            && event.context.file
        ) {
            this.saveAgentConversationReference(event.context.file, event.update.conversation.path)
        }
        if (event.type === 'action') this.linkActionConversation(event)
    }

    private linkActionConversation(event: ActionRunEvent) {
        if (event.type !== 'action' || event.status === 'running' || !event.context.file || !event.reference) return

        this.linkAgentConversationReference(event.context.file, event.reference)
    }

    private upsertAgentConversation(cardInternalId: string, conversation: AgentConversation) {
        const { config } = this.dependencies.requireDependencies()
        const conversations = this.conversationsByCardInternalId.get(cardInternalId) ?? []
        const nextConversations = conversations.some((current) => current.id === conversation.id)
            ? conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...conversations, conversation]
        this.conversationsByCardInternalId.set(cardInternalId, nextConversations)
        this.dependencies.refreshSnapshot(config.workingFolder)
        const card = this.dependencies.snapshot()?.activeCards.find(({ header }) => header.internalId === cardInternalId)
            ?? this.dependencies.snapshot()?.backgroundCards.find(({ header }) => header.internalId === cardInternalId)
        if (card) this.dependencies.conversationChanged(card.path)
        const actionIds = conversation.actionId ? [conversation.actionId] : []
        agentAcknowledgementService.announceConversationsChanged(cardInternalId, actionIds)
    }

}
