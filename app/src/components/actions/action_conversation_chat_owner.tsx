import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { AgentConversation } from '../../data/data_types'
import { useActionRunSelector } from '../hooks/use_action_runs'
import { ActionConversationChat } from './action_conversation_chat'
import type { ActionConversationStore } from './action_conversation_store'

interface ActionConversationChatOwnerProps {
    actionId: string
    context: ActionContext
    onConversationViewed?: (conversation: AgentConversation) => void
    store: ActionConversationStore
}

/** Subscribes only chat boundary to selected and canonical live conversation changes. */
export function ActionConversationChatOwner(props: ActionConversationChatOwnerProps) {
    const { actionId, context, onConversationViewed, store } = props
    const liveConversation = useActionRunSelector(actionId, context, (run) => run?.conversation ?? null)
    const runStatus = useActionRunSelector(actionId, context, (run) => run?.status ?? 'idle')
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const conversation = liveConversation ?? selectedConversation
    const status = runStatus === 'idle' && conversation?.status === 'waitingForInput' ? 'waitingForInput' : runStatus

    return <ActionConversationChat conversation={conversation} onConversationViewed={onConversationViewed} status={status} />
}
