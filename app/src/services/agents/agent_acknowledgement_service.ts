import type { ActionRunEvent, ActionRunStatus } from '../../data/action_run_types'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { AgentConversation } from '../../data/data_types'
import { actionRunRegistry } from '../actions/action_run_registry'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'

const UNSEEN_STATUSES = new Set<ActionRunStatus>(['completed', 'failed', 'waitingForInput'])

type ResolveStoredConversation = (conversation: AgentConversation) => AgentConversation | null

/** Event type dispatched for aggregate acknowledgement changes on one card. */
export function cardAcknowledgementEvent(cardInternalId: string) {
    return `card-${cardInternalId}`
}

/** Event type dispatched for acknowledgement changes on one card action. */
export function actionAcknowledgementEvent(cardInternalId: string, actionId: string) {
    return `action-${cardInternalId}-${actionId}`
}

function conversationKey(cardInternalId: string, actionId: string, conversationId: string) {
    return `${cardInternalId}-${actionId}-${conversationId}`
}

async function persistConversationViewed(reference: string, viewed: boolean) {
    const bridge = getElectronActionBridge()
    if (!bridge?.updateActionConversationViewed) throw new Error('Updating conversation view state requires Electron')

    return bridge.updateActionConversationViewed(reference, viewed)
}

/**
 * Tracks chat visibility and persists conversation view state.
 * Changes are announced through scoped card and card-action events so only affected leaves update;
 * the conversation data itself lives in the agent integration store and the activity files.
 * Scoping uses the stable card internal ID so card renames cannot break acknowledgement state.
 */
export class AgentAcknowledgementService extends EventTarget {
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
    announceConversationsChanged(cardInternalId: string, actionIds: string[]) {
        for (const actionId of new Set(actionIds)) {
            this.dispatchEvent(new Event(actionAcknowledgementEvent(cardInternalId, actionId)))
        }
        this.dispatchEvent(new Event(cardAcknowledgementEvent(cardInternalId)))
    }

    setConversationVisible(
        entryId: string,
        cardInternalId: string,
        actionId: string,
        conversation: AgentConversation,
        visible: boolean,
    ) {
        const key = conversationKey(cardInternalId, actionId, conversation.id)
        const entries = this.visibleEntries.get(key) ?? new Set<string>()
        if (visible) entries.add(entryId)
        else entries.delete(entryId)
        if (entries.size > 0) this.visibleEntries.set(key, entries)
        else this.visibleEntries.delete(key)
        const current = this.resolveStoredConversation?.(conversation) ?? conversation
        if (visible && !current.viewed) {
            void this.setViewed(cardInternalId, actionId, conversation, true).catch(() => undefined)
        }
    }

    async setViewed(cardInternalId: string, actionId: string, conversation: AgentConversation, viewed: boolean) {
        const current = this.resolveStoredConversation?.(conversation) ?? conversation
        if (current.viewed === viewed) return current

        try {
            await persistConversationViewed(conversation.path, viewed)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card conversation view state could not be saved' })
            throw error
        }
        current.viewed = viewed
        conversation.viewed = viewed
        this.announceConversationsChanged(cardInternalId, [actionId])

        return current
    }

    /** Clears transient state at a project boundary. */
    reset() {
        this.lastRunStatuses.clear()
        this.visibleEntries.clear()
    }

    private readonly handleActionRunEvent = (event: ActionRunEvent) => {
        const previousStatus = this.lastRunStatuses.get(event.runId)
        this.lastRunStatuses.set(event.runId, event.status)
        if (previousStatus === event.status || !UNSEEN_STATUSES.has(event.status)) return

        const conversation = actionRunRegistry.getRunStore(event.runId)?.getSnapshot().conversation ?? null
        const cardInternalId = event.context.cardInternalId
        const actionId = conversation?.actionId
        if (!cardInternalId || !conversation || !actionId) return
        if ((this.visibleEntries.get(conversationKey(cardInternalId, actionId, conversation.id))?.size ?? 0) > 0) return

        void this.setViewed(cardInternalId, actionId, conversation, false).catch(() => undefined)
    }

}

export const agentAcknowledgementService = register('agentAcknowledgementService', new AgentAcknowledgementService())
