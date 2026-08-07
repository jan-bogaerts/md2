import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import { useActionRunSelector } from '../../../hooks/use_action_runs'
import { ActionUsageSummary } from './action_usage_summary'

interface ActionUsageSummaryOwnerProps {
    action: ActionDefinition
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
}

/** Subscribes usage summary to conversation and history data only. */
export function ActionUsageSummaryOwner(props: ActionUsageSummaryOwnerProps) {
    const { action, context, conversationStore, historyStore } = props
    const liveConversation = useActionRunSelector(action.id, context, (run) => run?.conversation ?? null)
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const historySnapshot = useSyncExternalStore(historyStore.subscribe, historyStore.getSnapshot, historyStore.getSnapshot)

    useEffect(() => {
        void historyStore.load()
    }, [historyStore])

    if (context.kind !== 'card' || !context.file || !context.cardInternalId || action.type !== 'agent') return null

    return (
        <ActionUsageSummary
            actionId={action.id}
            cardInternalId={context.cardInternalId}
            conversation={liveConversation ?? conversationSnapshot.selectedConversation}
            conversations={conversationStore.conversationOptions(null)}
            history={historySnapshot.entries}
        />
    )
}
