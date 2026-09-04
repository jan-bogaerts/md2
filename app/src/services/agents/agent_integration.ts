import { cardContext, type ActionContext } from '../../data/action_context'
import { type ActionDefinition } from '../../data/action_types'
import type { ActionRunEvent } from '../../data/action_run_types'
import {
    type AgentConversation,
    type AgentConversationError,
    type Card,
    type ProjectReference,
    type ProjectSnapshot,
    type StorageService,
} from '../../data/data_types'
import { actionService } from '../actions/action_service'
import { actionRunRegistry } from '../actions/action_run_registry'
import { agentAcknowledgementService } from './agent_acknowledgement_service'
import { listAgentConversationReferences, loadActivityConversations, loadAgentConversation } from './agent_conversation_service'
import { runElectronAction } from '../actions/electron_action_runner'
import { mapWithConcurrency } from '../concurrency'
import { type RequiredDataServiceDependencies } from '../data/data_service_context'
import { telemetryService } from '../telemetry/telemetry_service'
import { dialogService } from '../dialog_service'
import { parseConversationActivityReference } from '../../../../shared/activity_paths.mjs'

const AGENT_CONVERSATION_LOAD_CONCURRENCY = 8
const MAX_REPORTED_LOAD_ERROR_KEYS = 200

interface ResolvedAgentConversations {
    conversations: AgentConversation[]
    errors: AgentConversationError[]
    /** Activity files that loaded without failing, so an empty card is distinguishable from a failed one. */
    loadedActivityCount: number
}

export interface AgentIntegrationDeps {
    conversationsChanged(cardPath: string): void
    findCardByInternalId(cardInternalId: string): Card | null
    isCurrentLoad(project: ProjectReference, projectLoadToken: number): boolean
    project(): ProjectReference | null
    requireDependencies(): RequiredDataServiceDependencies
    snapshot(): ProjectSnapshot | null
}

function isOnStateActionError(error: AgentConversationError) {
    return error.kind === 'onStateAction'
}

/** Keeps already-stored conversations when a load returns an older copy of the same record. */
function preferExistingConversations(existing: AgentConversation[], loaded: AgentConversation[]) {
    const conversationsById = new Map(loaded.map((conversation) => [conversation.id, conversation]))
    existing.forEach((conversation) => conversationsById.set(conversation.id, conversation))

    return [...conversationsById.values()]
}

async function resolveCardConversations(
    card: Card,
    project: ProjectReference,
    storage: StorageService,
): Promise<ResolvedAgentConversations> {
    const activityPaths = [...new Set(card.header.agentLogReferences)]
    const results = await mapWithConcurrency(activityPaths, AGENT_CONVERSATION_LOAD_CONCURRENCY, async (activityPath) => {
        try {
            const conversations = await loadActivityConversations(storage, project, activityPath)

            return { conversations, error: null }
        } catch (error) {
            telemetryService.captureError(error)
            const message = error instanceof Error ? error.message : 'Agent conversation failed to load'

            return { conversations: null, error: { message, path: activityPath } }
        }
    })

    return {
        conversations: results.flatMap(({ conversations }) => conversations ?? []),
        errors: results.flatMap(({ error }) => error ? [error] : []),
        loadedActivityCount: results.filter(({ error }) => !error).length,
    }
}

export class AgentIntegration {
    private readonly cardLoadsInFlight: Map<string, Promise<void>> = new Map()
    private readonly conversationsByCardInternalId: Map<string, AgentConversation[]> = new Map()
    private conversationLoadGeneration = 0
    private currentProjectLoadToken: number | null = null
    private readonly dependencies: AgentIntegrationDeps
    private readonly errorsByCardInternalId: Map<string, AgentConversationError[]> = new Map()
    private readonly loadedCardInternalIds: Set<string> = new Set()
    private projectConversations: AgentConversation[] = []
    private projectLoad: Promise<void> | null = null
    private projectLoadCompleted = false
    private readonly reportedLoadErrorKeys: Set<string> = new Set()
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
        this.cardLoadsInFlight.clear()
        this.conversationsByCardInternalId.clear()
        this.conversationLoadGeneration += 1
        this.currentProjectLoadToken = null
        this.errorsByCardInternalId.clear()
        this.loadedCardInternalIds.clear()
        this.projectConversations = []
        this.projectLoad = null
        this.projectLoadCompleted = false
        this.reportedLoadErrorKeys.clear()
        agentAcknowledgementService.reset()
        agentAcknowledgementService.announceConversationsChanged(null, [])
    }

    /** Resolves the loaded record matching a conversation, so view changes update the canonical instance. */
    findStoredConversation(conversation: AgentConversation) {
        for (const conversations of this.conversationsByCardInternalId.values()) {
            const stored = conversations.find(({ path }) => path === conversation.path)
            if (stored) return stored
        }

        return this.projectConversations.find(({ path }) => path === conversation.path) ?? null
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

    private stopScheduledRunWatch() {
        if (!this.scheduledRunCleanup) return

        this.scheduledRunCleanup()
        this.scheduledRunCleanup = null
    }

    private linkCardActivityFile(cardPath: string, reference: string) {
        const { activityPath } = parseConversationActivityReference(reference)

        return this.addAgentLogReference(cardPath, activityPath)
    }

    async ensureAgentConversationsForCard(cardInternalId: string) {
        const project = this.dependencies.project()
        if (!project) throw new Error('Cannot load card conversations before a project is open')
        const projectLoadToken = this.requireProjectLoadToken()
        if (!this.loadedCardInternalIds.has(cardInternalId)) {
            const existingLoad = this.cardLoadsInFlight.get(cardInternalId)
            if (existingLoad) await existingLoad
            else await this.loadCardConversations(cardInternalId, project, projectLoadToken)
        }

        return this.getAgentConversations(cardInternalId)
    }

    /** Loads persisted conversations for dashboard cards without blocking project opening. */
    async hydrateActiveCardConversations() {
        const snapshot = this.dependencies.snapshot()
        if (!snapshot) throw new Error('Cannot hydrate active card conversations before a project snapshot exists')

        await Promise.all(snapshot.activeCards.map(({ header }) => {
            if (!header.internalId) throw new Error('Cannot hydrate conversations for an active card without an internal ID')

            return this.ensureAgentConversationsForCard(header.internalId)
        }))
    }

    async listProjectAgentConversations() {
        const project = this.dependencies.project()
        if (!project) throw new Error('Cannot list project conversations before a project is open')
        const projectLoadToken = this.requireProjectLoadToken()
        await this.ensureProjectAgentConversationsLoaded(project, projectLoadToken)

        return this.projectConversations
    }

    /** Stable project-origin conversation array replaced only when project conversation data changes. */
    getProjectAgentConversationsSnapshot() {
        return this.projectConversations
    }

    prepareProjectConversationLoad(projectLoadToken: number) {
        if (this.currentProjectLoadToken === projectLoadToken) return

        this.cardLoadsInFlight.clear()
        this.conversationLoadGeneration += 1
        this.currentProjectLoadToken = projectLoadToken
        this.loadedCardInternalIds.clear()
        this.projectLoad = null
        this.projectLoadCompleted = false
    }

    private requireProjectLoadToken() {
        if (this.currentProjectLoadToken === null) throw new Error('Agent conversation loading has not started for the current project')

        return this.currentProjectLoadToken
    }

    private ensureProjectAgentConversationsLoaded(project: ProjectReference, projectLoadToken: number) {
        if (this.projectLoadCompleted) return Promise.resolve()
        if (this.projectLoad) return this.projectLoad

        const generation = this.conversationLoadGeneration
        const tracked: Promise<void> = this.loadProjectConversations(project, projectLoadToken, generation).then(() => {
            if (this.canApplyLoad(generation, project, projectLoadToken)) this.projectLoadCompleted = true
        }).finally(() => {
            if (this.projectLoad === tracked) this.projectLoad = null
        })
        this.projectLoad = tracked

        return tracked
    }

    private async loadProjectConversations(project: ProjectReference, projectLoadToken: number, generation: number) {
        const { config, storage } = this.dependencies.requireDependencies()
        const references = await listAgentConversationReferences(storage, project, config.projectFolder)
        const conversations = await mapWithConcurrency(references, AGENT_CONVERSATION_LOAD_CONCURRENCY, async (reference) => (
            loadAgentConversation(storage, project, reference)
        ))
        if (!this.canApplyLoad(generation, project, projectLoadToken)) return

        const loadedProjectConversations = conversations.filter(({ cardInternalId }) => cardInternalId === null)
        this.projectConversations = preferExistingConversations(this.projectConversations, loadedProjectConversations)
        agentAcknowledgementService.announceConversationsChanged(null, [])
    }

    private loadCardConversations(cardInternalId: string, project: ProjectReference, projectLoadToken: number) {
        const card = this.dependencies.findCardByInternalId(cardInternalId)
        if (!card) throw new Error(`Cannot load conversations for unknown card: ${cardInternalId}`)

        const generation = this.conversationLoadGeneration
        const load = this.resolveAndAttachAgentConversations(card, cardInternalId, project, projectLoadToken, generation)
        const tracked: Promise<void> = load.then(() => {
            if (this.canApplyLoad(generation, project, projectLoadToken)) this.loadedCardInternalIds.add(cardInternalId)
        }).finally(() => {
            if (this.cardLoadsInFlight.get(cardInternalId) === tracked) this.cardLoadsInFlight.delete(cardInternalId)
        })
        this.cardLoadsInFlight.set(cardInternalId, tracked)

        return tracked
    }

    getAgentConversations(cardInternalId: string) {
        return this.conversationsByCardInternalId.get(cardInternalId) ?? []
    }

    attachCardAgentConversations(card: Card) {
        const cardInternalId = card.header.internalId
        card.agentConversationErrors = cardInternalId ? this.errorsByCardInternalId.get(cardInternalId) ?? [] : []
        card.agentConversations = cardInternalId ? this.conversationsByCardInternalId.get(cardInternalId) ?? [] : []

        return card
    }

    /** Applies a persisted conversation returned by an atomic backend update. */
    updateAgentConversation(conversation: AgentConversation) {
        this.updateProjectConversation(conversation)
        const referencingCardInternalIds = [...this.conversationsByCardInternalId]
            .filter(([, conversations]) => conversations.some(({ path }) => path === conversation.path))
            .map(([cardInternalId]) => cardInternalId)
        if (referencingCardInternalIds.length > 0) {
            referencingCardInternalIds.forEach((cardInternalId) => this.upsertAgentConversation(cardInternalId, conversation))
            return
        }
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
            void this.runStateAction(action, context, card.header.internalId)
        }
    }

    private async resolveAndAttachAgentConversations(
        card: Card,
        cardInternalId: string,
        project: ProjectReference,
        projectLoadToken: number,
        generation: number,
    ) {
        const { storage } = this.dependencies.requireDependencies()
        const resolved = await resolveCardConversations(card, project, storage)
        if (!this.canApplyLoad(generation, project, projectLoadToken)) return

        if (resolved.loadedActivityCount > 0) {
            const existing = this.conversationsByCardInternalId.get(cardInternalId) ?? []
            this.conversationsByCardInternalId.set(cardInternalId, preferExistingConversations(existing, resolved.conversations))
        }
        this.replaceLoadErrors(cardInternalId, resolved.errors)
        this.reportNewLoadErrors(cardInternalId, resolved.errors)
        this.notifyConversationsChanged(cardInternalId)
        if (resolved.loadedActivityCount === 0) return

        const actionIds = resolved.conversations.flatMap(({ actionId }) => actionId ? [actionId] : [])
        agentAcknowledgementService.announceConversationsChanged(cardInternalId, actionIds)
    }

    /** Drops results of loads that a project switch or a reload has already superseded. */
    private canApplyLoad(generation: number, project: ProjectReference, projectLoadToken: number) {
        return generation === this.conversationLoadGeneration
            && this.currentProjectLoadToken === projectLoadToken
            && this.dependencies.isCurrentLoad(project, projectLoadToken)
    }

    private replaceLoadErrors(cardInternalId: string, loadedErrors: AgentConversationError[]) {
        const onStateErrors = (this.errorsByCardInternalId.get(cardInternalId) ?? []).filter(isOnStateActionError)
        const nextErrors = [...loadedErrors, ...onStateErrors]
        if (nextErrors.length === 0) {
            this.errorsByCardInternalId.delete(cardInternalId)
            return
        }

        this.errorsByCardInternalId.set(cardInternalId, nextErrors)
    }

    private reportNewLoadErrors(cardInternalId: string, errors: AgentConversationError[]) {
        const newErrors = errors.filter((error) => {
            const key = `${cardInternalId}:${error.path}:${error.message}`
            if (this.reportedLoadErrorKeys.has(key)) return false

            this.reportedLoadErrorKeys.add(key)

            return true
        })
        this.trimReportedLoadErrorKeys()
        if (newErrors.length === 0) return

        const paths = newErrors.map(({ path }) => path).join(', ')
        dialogService.warning(`Some agent conversations could not be loaded and were skipped: ${paths}`, {title: 'Some agent conversations were not loaded'})
    }

    private trimReportedLoadErrorKeys() {
        while (this.reportedLoadErrorKeys.size > MAX_REPORTED_LOAD_ERROR_KEYS) {
            const [oldestKey] = this.reportedLoadErrorKeys

            this.reportedLoadErrorKeys.delete(oldestKey)
        }
    }

    private async runStateAction(action: ActionDefinition, context: ActionContext, cardInternalId: string | null) {
        try {
            const result = await runElectronAction(action, context, {}, undefined, false)
            if (result.status === 'completed') return

            const failedLog = result.logs.find((log) => log.status === 'failed')
            this.recordCardAgentError(cardInternalId, action.id, failedLog?.message ?? `${action.label} failed`)
        } catch (error) {
            this.recordCardAgentError(cardInternalId, action.id, error instanceof Error ? error.message : `${action.label} failed`)
        }
    }

    /** A card without an internal ID has nowhere to attach the failure, so it only reaches telemetry. */
    private recordCardAgentError(cardInternalId: string | null, actionId: string, message: string) {
        if (!cardInternalId) {
            telemetryService.captureError(new Error(`${actionId}: ${message}`))
            return
        }

        const error: AgentConversationError = { kind: 'onStateAction', message, path: actionId }
        this.errorsByCardInternalId.set(cardInternalId, [...(this.errorsByCardInternalId.get(cardInternalId) ?? []), error])
        this.notifyConversationsChanged(cardInternalId)
    }

    /** Notifies through the card's current path, which a rename or an archive may have changed meanwhile. */
    private notifyConversationsChanged(cardInternalId: string) {
        const card = this.dependencies.findCardByInternalId(cardInternalId)
        if (card) this.dependencies.conversationsChanged(card.path)
    }

    private handleActionRunEvent(event: ActionRunEvent) {
        if (
            event.type === 'update'
            && (event.update.kind === 'agentStarted' || event.update.kind === 'agentClosed')
            && !event.context.cardInternalId
        ) {
            this.upsertProjectConversation(event.update.conversation)
            return
        }

        if (
            event.type === 'update'
            && (event.update.kind === 'agentStarted' || event.update.kind === 'agentClosed')
            && event.context.kind === 'card'
            && event.context.file
        ) {
            const cardInternalId = this.linkCardActivityFile(event.context.file, event.update.conversation.path)
            if (!cardInternalId) {
                throw new Error(`Cannot link a card conversation without an internal ID: ${event.context.file}`)
            }
            this.upsertAgentConversation(cardInternalId, event.update.conversation)
        }
    }

    private updateProjectConversation(conversation: AgentConversation) {
        if (!this.projectConversations.some(({ id }) => id === conversation.id)) return

        this.projectConversations = this.projectConversations.map((current) => (
            current.id === conversation.id ? conversation : current
        ))
        agentAcknowledgementService.announceConversationsChanged(null, [])
    }

    private upsertProjectConversation(conversation: AgentConversation) {
        this.projectConversations = this.projectConversations.some(({ id }) => id === conversation.id)
            ? this.projectConversations.map((current) => current.id === conversation.id ? conversation : current)
            : [...this.projectConversations, conversation]
        agentAcknowledgementService.announceConversationsChanged(null, [])
    }

    private upsertAgentConversation(cardInternalId: string, conversation: AgentConversation) {
        const conversations = this.conversationsByCardInternalId.get(cardInternalId) ?? []
        const nextConversations = conversations.some((current) => current.id === conversation.id)
            ? conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...conversations, conversation]
        this.conversationsByCardInternalId.set(cardInternalId, nextConversations)
        this.notifyConversationsChanged(cardInternalId)
        const actionIds = conversation.actionId ? [conversation.actionId] : []
        agentAcknowledgementService.announceConversationsChanged(cardInternalId, actionIds)
    }
}
