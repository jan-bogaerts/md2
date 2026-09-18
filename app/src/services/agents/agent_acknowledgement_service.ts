import type { ActionRunEvent, ActionRunStatus } from '../../data/action_run_types'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { AgentConversation } from '../../data/data_types'
import { actionRunRegistry } from '../actions/action_run_registry'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'

const UNSEEN_STATUSES = new Set<ActionRunStatus>(['completed', 'failed', 'waitingForInput'])
const PROJECT_SCOPE_KEY = 'project'

type ResolveStoredConversation = (conversation: AgentConversation) => AgentConversation | null
export type AgentConversationScope = string | null

/** Event type dispatched for aggregate acknowledgement changes on one card. */
export function cardAcknowledgementEvent(cardInternalId: string) {
    return `card-${cardInternalId}`
}

/** Event type dispatched for acknowledgement changes on one card action. */
export function actionAcknowledgementEvent(cardInternalId: string, actionId: string) {
    return `action-${cardInternalId}-${actionId}`
}

/** Event type dispatched for project-origin conversation changes. */
export const PROJECT_ACKNOWLEDGEMENT_EVENT = 'project-conversations'

function conversationKey(scope: AgentConversationScope, actionId: string, conversationId: string) {
    return `${scope ?? PROJECT_SCOPE_KEY}-${actionId}-${conversationId}`
}

/** Resolves the backend write before any local value changes, so a missing backend leaves the record untouched. */
function requireConversationViewedWriter() {
    const bridge = getElectronActionBridge()
    if (!bridge?.updateActionConversationViewed) throw new Error('Updating conversation view state requires Electron')

    return (reference: string, viewed: boolean) => bridge.updateActionConversationViewed!(reference, viewed)
}

/**
 * Tracks chat visibility and persists conversation view state.
 * Changes are announced through scoped card and card-action events so only affected leaves update;
 * the conversation data itself lives in the agent integration store and the activity files.
 * Scoping uses the stable card internal ID so card renames cannot break acknowledgement state.
 */
export class AgentAcknowledgementService extends EventTarget {
    private readonly backendViewedByConversationId = new Map<string, boolean>()
    private readonly lastRunStatuses = new Map<string, ActionRunStatus>()
    private resolveStoredConversation: ResolveStoredConversation | null = null
    private readonly visibleEntries = new Map<string, Set<string>>()

    constructor() {
        super()
        actionRunRegistry.subscribeActiveRunEvents(this.handleActionRunEvent)
    }

    /** Connects the loaded-conversation store so view changes land on the canonical conversation records. */
    connectConversationStore(resolveStoredConversation: ResolveStoredConversation) {
        this.resolveStoredConversation = resolveStoredConversation
    }

    /** Announce acknowledgement-relevant conversation changes to the scoped card and card-action subscribers. */
    announceConversationsChanged(scope: AgentConversationScope, actionIds: string[]) {
        if (scope === null) {
            this.dispatchEvent(new Event(PROJECT_ACKNOWLEDGEMENT_EVENT))
            return
        }

        for (const actionId of new Set(actionIds)) {
            this.dispatchEvent(new Event(actionAcknowledgementEvent(scope, actionId)))
        }
        this.dispatchEvent(new Event(cardAcknowledgementEvent(scope)))
    }

    setConversationVisible(
        entryId: string,
        scope: AgentConversationScope,
        actionId: string,
        conversation: AgentConversation,
        visible: boolean,
    ) {
        const key = conversationKey(scope, actionId, conversation.id)
        const entries = this.visibleEntries.get(key) ?? new Set<string>()
        if (visible) entries.add(entryId)
        else entries.delete(entryId)
        if (entries.size > 0) this.visibleEntries.set(key, entries)
        else this.visibleEntries.delete(key)
        const current = this.resolveStoredConversation?.(conversation) ?? conversation
        if (visible && !current.viewed) {
            void this.setViewed(scope, actionId, conversation, true).catch(() => undefined)
        }
    }

    /**
     * Remembers the view state the backend last reported for a conversation, so a failed write has a
     * value to fall back to rather than guessing from the optimistic one it is undoing.
     */
    recordBackendViewed(conversationId: string, viewed: boolean) {
        this.backendViewedByConversationId.set(conversationId, viewed)
    }

    /**
     * Applies the view state locally first so the window it was clicked in responds without waiting for
     * the backend, then persists it. A failed write puts back the value the backend last reported, which
     * leaves no window showing a state the activity file does not hold. The backend announcement that
     * follows a successful write replaces the optimistic value, so a differing backend value wins.
     */
    async setViewed(scope: AgentConversationScope, actionId: string, conversation: AgentConversation, viewed: boolean) {
        const current = this.resolveStoredConversation?.(conversation) ?? conversation
        if (current.viewed === viewed) return current

        const previous = current.viewed
        let applied = false
        try {
            const write = requireConversationViewedWriter()
            current.viewed = viewed
            conversation.viewed = viewed
            applied = true
            this.announceConversationsChanged(scope, [actionId])
            await write(conversation.path, viewed)
        } catch (error) {
            if (applied) {
                const reverted = this.backendViewedByConversationId.get(conversation.id) ?? previous
                current.viewed = reverted
                conversation.viewed = reverted
                this.announceConversationsChanged(scope, [actionId])
            }
            const fallbackMessage = scope === null
                ? 'Project conversation view state could not be saved'
                : 'Card conversation view state could not be saved'
            dialogService.error(error, { fallbackMessage })
            throw error
        }

        return current
    }

    /** Clears transient state at a project boundary. */
    reset() {
        this.backendViewedByConversationId.clear()
        this.lastRunStatuses.clear()
        this.visibleEntries.clear()
    }

    private readonly handleActionRunEvent = (event: ActionRunEvent) => {
        const previousStatus = this.lastRunStatuses.get(event.runId)
        this.lastRunStatuses.set(event.runId, event.status)
        if (previousStatus === event.status || !UNSEEN_STATUSES.has(event.status)) return

        const conversation = actionRunRegistry.getRunStore(event.runId)?.getSnapshot().conversation ?? null
        const scope = event.context.cardInternalId ?? null
        const actionId = conversation?.actionId
        if (!conversation || !actionId) return
        if ((this.visibleEntries.get(conversationKey(scope, actionId, conversation.id))?.size ?? 0) > 0) return

        void this.setViewed(scope, actionId, conversation, false).catch(() => undefined)
    }

}

export const agentAcknowledgementService = register('agentAcknowledgementService', new AgentAcknowledgementService())
