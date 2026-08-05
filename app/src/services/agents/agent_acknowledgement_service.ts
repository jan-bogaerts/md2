import type { ActionRunEvent, ActionRunStatus } from '../../data/action_run_types'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { AgentConversation, ProjectReference } from '../../data/data_types'
import { actionRunRegistry } from '../actions/action_run_registry'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'

const UNSEEN_STATUSES = new Set<ActionRunStatus>(['completed', 'failed', 'waitingForInput'])

type Listener = () => void
type PersistViewed = (reference: string, viewed: boolean) => Promise<AgentConversation>
type SubscribeRunEvents = (listener: (event: ActionRunEvent) => void) => () => void
type GetRunConversation = (runId: string) => AgentConversation | null

interface RuntimeConversation {
    conversation: AgentConversation
    revision: number
}

function conversationKey(cardPath: string, actionId: string, conversationId: string) {
    return `${cardPath}\u0000${actionId}\u0000${conversationId}`
}

function actionKey(cardPath: string, actionId: string) {
    return `${cardPath}\u0000${actionId}`
}

function projectIdentity(project: ProjectReference | null) {
    return project ? `${project.id}\u0000${project.branch}` : null
}

async function persistConversationViewed(reference: string, viewed: boolean) {
    const bridge = getElectronActionBridge()
    if (!bridge?.updateActionConversationViewed) throw new Error('Updating conversation view state requires Electron')

    return bridge.updateActionConversationViewed(reference, viewed)
}

function newestConversation(conversations: AgentConversation[]) {
    return [...conversations].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ?? null
}

function subscribeListener(listenersByKey: Map<string, Set<Listener>>, key: string, listener: Listener) {
    const listeners = listenersByKey.get(key) ?? new Set<Listener>()
    listeners.add(listener)
    listenersByKey.set(key, listeners)

    return () => {
        listeners.delete(listener)
        if (listeners.size === 0) listenersByKey.delete(key)
    }
}

/** Owns transient card conversation view state and scoped acknowledgement events. */
export class AgentAcknowledgementService {
    private readonly actionListeners = new Map<string, Set<Listener>>()
    private readonly actionRevisions = new Map<string, number>()
    private readonly cardListeners = new Map<string, Set<Listener>>()
    private readonly cardRevisions = new Map<string, number>()
    private currentProjectIdentity: string | null = null
    private readonly getRunConversation: GetRunConversation
    private readonly persistViewed: PersistViewed
    private readonly runStatuses = new Map<string, ActionRunStatus>()
    private readonly runtime = new Map<string, Map<string, Map<string, RuntimeConversation>>>()
    private readonly visibleEntries = new Map<string, Set<string>>()

    constructor(
        persistViewed: PersistViewed,
        subscribeRunEvents: SubscribeRunEvents,
        getRunConversation: GetRunConversation,
    ) {
        this.persistViewed = persistViewed
        this.getRunConversation = getRunConversation
        subscribeRunEvents(this.handleActionRunEvent)
    }

    setLoadedProject(project: ProjectReference | null) {
        const nextIdentity = projectIdentity(project)
        if (nextIdentity === this.currentProjectIdentity) return

        this.currentProjectIdentity = nextIdentity
        this.clearRuntimeState()
    }

    subscribeAction(cardPath: string, actionId: string, listener: Listener) {
        return subscribeListener(this.actionListeners, actionKey(cardPath, actionId), listener)
    }

    subscribeCard(cardPath: string, listener: Listener) {
        return subscribeListener(this.cardListeners, cardPath, listener)
    }

    actionRevision(cardPath: string, actionId: string) {
        return this.actionRevisions.get(actionKey(cardPath, actionId)) ?? 0
    }

    cardRevision(cardPath: string) {
        return this.cardRevisions.get(cardPath) ?? 0
    }

    /** Notify scoped UI subscribers after conversations have changed for a card. */
    notifyConversationsChanged(cardPath: string, actionIds: string[]) {
        const scopedActionKeys = [...new Set(actionIds)].map((actionId) => actionKey(cardPath, actionId))
        for (const scopedActionKey of scopedActionKeys) {
            this.actionRevisions.set(scopedActionKey, (this.actionRevisions.get(scopedActionKey) ?? 0) + 1)
            for (const listener of this.actionListeners.get(scopedActionKey) ?? []) listener()
        }

        this.cardRevisions.set(cardPath, this.cardRevision(cardPath) + 1)
        for (const listener of this.cardListeners.get(cardPath) ?? []) listener()
    }

    conversations(cardPath: string, conversations: AgentConversation[]) {
        const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]))
        const actions = this.runtime.get(cardPath)
        for (const runtimeConversations of actions?.values() ?? []) {
            for (const { conversation } of runtimeConversations.values()) conversationsById.set(conversation.id, conversation)
        }

        return [...conversationsById.values()]
    }

    latestUnseen(cardPath: string, conversations: AgentConversation[], actionId: string) {
        return newestConversation(this.conversations(cardPath, conversations).filter((conversation) => (
            conversation.actionId === actionId && !conversation.viewed
        )))
    }

    hasUnseen(cardPath: string, conversations: AgentConversation[]) {
        return this.conversations(cardPath, conversations).some(({ viewed }) => !viewed)
    }

    setConversationVisible(
        entryId: string,
        cardPath: string,
        actionId: string,
        conversation: AgentConversation,
        visible: boolean,
    ) {
        const key = conversationKey(cardPath, actionId, conversation.id)
        const entries = this.visibleEntries.get(key) ?? new Set<string>()
        if (visible) entries.add(entryId)
        else entries.delete(entryId)
        if (entries.size > 0) this.visibleEntries.set(key, entries)
        else this.visibleEntries.delete(key)
        if (visible && !this.currentConversation(cardPath, actionId, conversation).viewed) {
            void this.setViewed(cardPath, actionId, conversation, true)
        }
    }

    async setViewed(cardPath: string, actionId: string, conversation: AgentConversation, viewed: boolean) {
        const current = this.currentConversation(cardPath, actionId, conversation)
        if (current.viewed === viewed) return current

        const previousRuntime = this.runtimeConversation(cardPath, actionId, conversation.id)
        const revision = (previousRuntime?.revision ?? 0) + 1
        const next = { ...current, viewed }
        this.storeRuntime(cardPath, actionId, { conversation: next, revision })
        this.notify(cardPath, actionId)

        try {
            const persisted = await this.persistViewed(conversation.path, viewed)
            const latest = this.runtimeConversation(cardPath, actionId, conversation.id)
            if (latest?.revision === revision) {
                this.storeRuntime(cardPath, actionId, { conversation: { ...persisted, viewed }, revision })
            }

            return persisted
        } catch (error) {
            const latest = this.runtimeConversation(cardPath, actionId, conversation.id)
            if (latest?.revision === revision) {
                if (previousRuntime) this.storeRuntime(cardPath, actionId, previousRuntime)
                else this.deleteRuntime(cardPath, actionId, conversation.id)
                this.notify(cardPath, actionId)
            }
            dialogService.error(error, { fallbackMessage: 'Card conversation view state could not be saved' })
            throw error
        }
    }

    clearRuntimeState() {
        const cardPaths = [...new Set([
            ...this.runtime.keys(),
            ...this.cardListeners.keys(),
        ])]
        this.runtime.clear()
        this.runStatuses.clear()
        this.visibleEntries.clear()
        for (const cardPath of cardPaths) this.cardRevisions.set(cardPath, this.cardRevision(cardPath) + 1)
        for (const key of this.actionListeners.keys()) this.actionRevisions.set(key, (this.actionRevisions.get(key) ?? 0) + 1)
        for (const cardPath of cardPaths) {
            for (const listener of this.cardListeners.get(cardPath) ?? []) listener()
        }
        for (const listeners of this.actionListeners.values()) {
            for (const listener of listeners) listener()
        }
    }

    private readonly handleActionRunEvent = (event: ActionRunEvent) => {
        const previousStatus = this.runStatuses.get(event.runId)
        this.runStatuses.set(event.runId, event.status)
        const conversation = this.getRunConversation(event.runId)
        const cardPath = event.context.file
        const actionId = conversation?.actionId
        const isCardConversation = !!event.context.cardInternalId && !!cardPath && !!actionId && !!conversation
        if (!isCardConversation) return

        const current = this.currentConversation(cardPath, actionId, conversation)
        const revision = this.runtimeConversation(cardPath, actionId, conversation.id)?.revision ?? 0
        this.storeRuntime(cardPath, actionId, { conversation: current, revision })
        if (previousStatus === event.status || !UNSEEN_STATUSES.has(event.status)) return
        const key = conversationKey(cardPath, actionId, conversation.id)
        if ((this.visibleEntries.get(key)?.size ?? 0) > 0) return

        void this.setViewed(cardPath, actionId, conversation, false).catch(() => undefined)
    }

    private currentConversation(cardPath: string, actionId: string, fallback: AgentConversation) {
        const runtimeConversation = this.runtimeConversation(cardPath, actionId, fallback.id)?.conversation

        return runtimeConversation ? { ...fallback, viewed: runtimeConversation.viewed } : fallback
    }

    private runtimeConversation(cardPath: string, actionId: string, conversationId: string) {
        return this.runtime.get(cardPath)?.get(actionId)?.get(conversationId)
    }

    private storeRuntime(cardPath: string, actionId: string, value: RuntimeConversation) {
        const actions = this.runtime.get(cardPath) ?? new Map<string, Map<string, RuntimeConversation>>()
        const conversations = actions.get(actionId) ?? new Map<string, RuntimeConversation>()
        conversations.set(value.conversation.id, value)
        actions.set(actionId, conversations)
        this.runtime.set(cardPath, actions)
    }

    private deleteRuntime(cardPath: string, actionId: string, conversationId: string) {
        const actions = this.runtime.get(cardPath)
        const conversations = actions?.get(actionId)
        conversations?.delete(conversationId)
        if (conversations?.size === 0) actions?.delete(actionId)
        if (actions?.size === 0) this.runtime.delete(cardPath)
    }

    private notify(cardPath: string, actionId: string) {
        this.notifyConversationsChanged(cardPath, [actionId])
    }

}

export const agentAcknowledgementService = register(
    'agentAcknowledgementService',
    new AgentAcknowledgementService(
        persistConversationViewed,
        (listener) => actionRunRegistry.subscribeActiveRunEvents(listener),
        (runId) => actionRunRegistry.getRunStore(runId)?.getSnapshot().conversation ?? null,
    ),
)

export function latestUnseenAgentResult(cardPath: string, conversations: AgentConversation[], actionId: string) {
    return agentAcknowledgementService.latestUnseen(cardPath, conversations, actionId)
}

export function hasUnseenAgentResult(cardPath: string, conversations: AgentConversation[]) {
    return agentAcknowledgementService.hasUnseen(cardPath, conversations)
}
