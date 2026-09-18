import { cardContext, type ActionContext } from '../../data/action_context'
import { type ActionDefinition } from '../../data/action_types'
import type { ActionRunEvent, ActionRunTerminalStatus } from '../../data/action_run_types'
import {
    type AgentConversation,
    type AgentConversationError,
    type AgentConversationStatus,
    type Card,
    type ProjectReference,
    type ProjectSnapshot,
    type StorageService,
} from '../../data/data_types'
import { actionService } from '../actions/action_service'
import { actionRunRegistry } from '../actions/action_run_registry'
import { getElectronActionBridge, type ActionConversationViewedEvent } from '../../data/electron_action_bridge'
import { agentAcknowledgementService } from './agent_acknowledgement_service'
import { listAgentConversationReferences, loadActivityConversations, loadAgentConversation } from './agent_conversation_service'
import { runElectronAction } from '../actions/electron_action_runner'
import { mapWithConcurrency } from '../concurrency'
import { type RequiredDataServiceDependencies } from '../data/data_service_context'
import { telemetryService } from '../telemetry/telemetry_service'
import { dialogService } from '../dialog_service'

const AGENT_CONVERSATION_LOAD_CONCURRENCY = 8
/** Terminal run status as the conversation records it; a run that ended after its after-phase check still completed. */
const TERMINAL_CONVERSATION_STATUS: Record<ActionRunTerminalStatus, AgentConversationStatus> = {
    cancelled: 'cancelled',
    completed: 'completed',
    failed: 'failed',
    okButNotAfter: 'completed',
}
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
    private conversationWriteSequence = 0
    private readonly conversationWriteSequenceById: Map<string, number> = new Map()
    private currentProjectLoadToken: number | null = null
    private readonly dependencies: AgentIntegrationDeps
    private readonly errorsByCardInternalId: Map<string, AgentConversationError[]> = new Map()
    private readonly loadedCardInternalIds: Set<string> = new Set()
    private projectConversations: AgentConversation[] = []
    private projectLoad: Promise<void> | null = null
    private projectLoadCompleted = false
    private readonly reportedLoadErrorKeys: Set<string> = new Set()
    private conversationViewCleanup: (() => void) | null = null
    private scheduledRunCleanup: (() => void) | null = null

    constructor(dependencies: AgentIntegrationDeps) {
        this.dependencies = dependencies
    }

    reset() {
        this.stopScheduledRunWatch()
        this.resetLoadedConversations()
    }

    resetLoadedConversations() {
        this.cardLoadsInFlight.clear()
        this.conversationsByCardInternalId.clear()
        this.conversationLoadGeneration += 1
        this.conversationWriteSequenceById.clear()
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

    /** Records an in-memory write, so a load that started before it cannot put an older copy back. */
    private markConversationWritten(conversationId: string) {
        this.conversationWriteSequence += 1
        this.conversationWriteSequenceById.set(conversationId, this.conversationWriteSequence)
    }

    /**
     * Merges a load result into the stored records. A stored record survives only while a live run still owns it,
     * or when it was written in memory after this load started. Otherwise the loaded record wins, so a corrected
     * activity file takes effect on reload.
     */
    private preferExistingConversations(existing: AgentConversation[], loaded: AgentConversation[], loadSequence: number) {
        const conversationsById = new Map(loaded.map((conversation) => [conversation.id, conversation]))
        existing.forEach((conversation) => {
            const writtenDuringLoad = (this.conversationWriteSequenceById.get(conversation.id) ?? 0) > loadSequence
            const keepExisting = writtenDuringLoad || actionRunRegistry.hasLiveConversation(conversation.id)
            if (conversationsById.has(conversation.id) && !keepExisting) return

            conversationsById.set(conversation.id, conversation)
        })

        return [...conversationsById.values()]
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
        this.startConversationViewWatch()
    }

    /** Listens for view-state changes written by any window, so every window converges without a reload. */
    private startConversationViewWatch() {
        const bridge = getElectronActionBridge()
        if (!bridge?.onActionConversationViewed) return

        this.conversationViewCleanup = bridge.onActionConversationViewed((event) => {
            try {
                this.applyConversationViewed(event)
            } catch (error) {
                telemetryService.captureError(error)
            }
        })
    }

    private stopScheduledRunWatch() {
        if (this.conversationViewCleanup) {
            this.conversationViewCleanup()
            this.conversationViewCleanup = null
        }
        if (!this.scheduledRunCleanup) return

        this.scheduledRunCleanup()
        this.scheduledRunCleanup = null
    }

    /**
     * Writes the view state the backend reports onto the stored conversation and announces it through the
     * scoped acknowledgement events. The backend value wins over an optimistic local one, and only that one
     * field changes; no card or conversation object is republished for it.
     */
    applyConversationViewed({ conversationId, viewed }: ActionConversationViewedEvent) {
        agentAcknowledgementService.recordBackendViewed(conversationId, viewed)
        const located = this.locateStoredConversation(conversationId)
        if (!located || located.conversation.viewed === viewed) return

        located.conversation.viewed = viewed
        this.markConversationWritten(located.conversation.id)
        const actionId = located.conversation.actionId
        agentAcknowledgementService.announceConversationsChanged(located.scope, actionId ? [actionId] : [])
    }

    /** Finds the stored record for a canonical conversation id together with the scope it is announced under. */
    private locateStoredConversation(conversationId: string) {
        for (const [cardInternalId, conversations] of this.conversationsByCardInternalId) {
            const stored = conversations.find(({ id }) => id === conversationId)
            if (stored) return { conversation: stored, scope: cardInternalId as string | null }
        }
        const stored = this.projectConversations.find(({ id }) => id === conversationId)

        return stored ? { conversation: stored, scope: null as string | null } : null
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
        const loadSequence = this.conversationWriteSequence
        const { config, storage } = this.dependencies.requireDependencies()
        const references = await listAgentConversationReferences(storage, project, config.projectFolder)
        const conversations = await mapWithConcurrency(references, AGENT_CONVERSATION_LOAD_CONCURRENCY, async (reference) => (
            loadAgentConversation(storage, project, reference)
        ))
        if (!this.canApplyLoad(generation, project, projectLoadToken)) return

        const loadedProjectConversations = conversations.filter(({ cardInternalId }) => cardInternalId === null)
        this.projectConversations = this.preferExistingConversations(this.projectConversations, loadedProjectConversations, loadSequence)
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
        const loadSequence = this.conversationWriteSequence
        const { storage } = this.dependencies.requireDependencies()
        const resolved = await resolveCardConversations(card, project, storage)
        if (!this.canApplyLoad(generation, project, projectLoadToken)) return

        if (resolved.loadedActivityCount > 0) {
            const existing = this.conversationsByCardInternalId.get(cardInternalId) ?? []
            this.conversationsByCardInternalId.set(
                cardInternalId,
                this.preferExistingConversations(existing, resolved.conversations, loadSequence),
            )
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
        if (event.type === 'agentState') {
            this.applyConversationStatus(event, event.status)
            return
        }

        if (event.type === 'run' && event.status in TERMINAL_CONVERSATION_STATUS) {
            this.applyConversationStatus(event, TERMINAL_CONVERSATION_STATUS[event.status as ActionRunTerminalStatus])
            return
        }

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
            && event.context.cardInternalId
        ) {
            this.upsertAgentConversation(event.context.cardInternalId, event.update.conversation)
        }
    }

    /**
     * Writes the backend status onto the stored conversation and announces it through the scoped acknowledgement
     * events. Only that one field changes; no card or conversation object is republished for it.
     */
    private applyConversationStatus(event: ActionRunEvent, status: AgentConversationStatus) {
        const liveConversation = actionRunRegistry.getRunStore(event.runId)?.getSnapshot().conversation
        if (!liveConversation) return

        const cardInternalId = event.context.cardInternalId ?? null
        const stored = cardInternalId
            ? (this.conversationsByCardInternalId.get(cardInternalId) ?? []).find(({ id }) => id === liveConversation.id)
            : this.projectConversations.find(({ id }) => id === liveConversation.id)
        if (!stored || stored.status === status) return

        stored.status = status
        this.markConversationWritten(stored.id)
        agentAcknowledgementService.announceConversationsChanged(cardInternalId, stored.actionId ? [stored.actionId] : [])
    }

    private updateProjectConversation(conversation: AgentConversation) {
        if (!this.projectConversations.some(({ id }) => id === conversation.id)) return

        this.projectConversations = this.projectConversations.map((current) => (
            current.id === conversation.id ? conversation : current
        ))
        this.markConversationWritten(conversation.id)
        agentAcknowledgementService.announceConversationsChanged(null, [])
    }

    private upsertProjectConversation(conversation: AgentConversation) {
        this.projectConversations = this.projectConversations.some(({ id }) => id === conversation.id)
            ? this.projectConversations.map((current) => current.id === conversation.id ? conversation : current)
            : [...this.projectConversations, conversation]
        this.markConversationWritten(conversation.id)
        agentAcknowledgementService.announceConversationsChanged(null, [])
    }

    private upsertAgentConversation(cardInternalId: string, conversation: AgentConversation) {
        const conversations = this.conversationsByCardInternalId.get(cardInternalId) ?? []
        const nextConversations = conversations.some((current) => current.id === conversation.id)
            ? conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...conversations, conversation]
        this.conversationsByCardInternalId.set(cardInternalId, nextConversations)
        this.markConversationWritten(conversation.id)
        this.notifyConversationsChanged(cardInternalId)
        const actionIds = conversation.actionId ? [conversation.actionId] : []
        agentAcknowledgementService.announceConversationsChanged(cardInternalId, actionIds)
    }
}
