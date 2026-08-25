import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { resolveDisplayedConversation, type ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import { ActionUsageSummary } from './action_usage_summary'
import type { ActionUsageScopeStore } from './action_usage_scope_store'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'
import { useActionRunStores, useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import type { AgentConversation } from '../../../../data/data_types'

interface ActionUsageSummaryOwnerProps {
    action: ActionDefinition
    bindingStore: ActionRunBindingStore
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    scopeStore: ActionUsageScopeStore
}

/** Subscribes usage summary to conversation and history data only. */
export function ActionUsageSummaryOwner(props: ActionUsageSummaryOwnerProps) {
    const { action, bindingStore, context, conversationStore, historyStore, scopeStore } = props
    const boundRunId = useBoundRunId(bindingStore)
    const liveConversation = useRunSelector(boundRunId, (run) => run?.conversation ?? null)
    const liveConversations = useActionRunStores(action.id, context)
        .map(({ getSnapshot }) => getSnapshot().conversation)
        .filter((conversation): conversation is AgentConversation => !!conversation)
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const historySnapshot = useSyncExternalStore(historyStore.subscribe, historyStore.getSnapshot, historyStore.getSnapshot)
    const scopeSnapshot = useSyncExternalStore(scopeStore.subscribe, scopeStore.getSnapshot, scopeStore.getSnapshot)
    const displayedConversation = resolveDisplayedConversation(liveConversation, conversationSnapshot.selectedConversation)
    const scope = displayedConversation ? scopeSnapshot : 'actionCard'

    useEffect(() => {
        void historyStore.load()
    }, [historyStore])

    useEffect(() => {
        if (!displayedConversation) scopeStore.useActionCardScope()
    }, [displayedConversation, scopeStore])

    if (context.kind !== 'card' || !context.file || !context.cardInternalId || action.type !== 'agent') return null

    const handleToggleScope = () => scopeStore.toggle(!!displayedConversation)

    return (
        <ActionUsageSummary
            actionId={action.id}
            cardInternalId={context.cardInternalId}
            conversation={displayedConversation}
            conversations={conversationStore.conversationOptions(liveConversations)}
            history={historySnapshot.entries}
            liveConversation={liveConversation}
            onToggleScope={handleToggleScope}
            scope={scope}
        />
    )
}
