import { useCallback, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { AgentConversation } from '../../data/data_types'
import { useActionRunSelector } from '../hooks/use_action_runs'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { dialogService } from '../../services/dialog_service'
import { useActionContextCard } from '../hooks/use_action_context_card'
import { ActionConversationChat } from './action_conversation_chat'
import type { ActionConversationStore } from './action_conversation_store'

interface ActionConversationChatOwnerProps {
    actionId: string
    context: ActionContext
    projectKey: string | null
    store: ActionConversationStore
}

function acknowledgeConversation(projectKey: string, cardPath: string, conversation: AgentConversation) {
    try {
        agentAcknowledgementService.acknowledge(projectKey, cardPath, [conversation])
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Card conversation could not be acknowledged' })
    }
}

/** Subscribes only chat boundary to selected and canonical live conversation changes. */
export function ActionConversationChatOwner(props: ActionConversationChatOwnerProps) {
    const { actionId, context, projectKey, store } = props
    const liveConversation = useActionRunSelector(actionId, context, (run) => run?.conversation ?? null)
    const runStatus = useActionRunSelector(actionId, context, (run) => run?.status ?? 'idle')
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const { cardPath } = useActionContextCard(context)
    const conversation = liveConversation ?? selectedConversation
    const status = runStatus === 'idle' && conversation?.status === 'waitingForInput' ? 'waitingForInput' : runStatus
    const handleConversationViewed = useCallback((viewedConversation: AgentConversation) => {
        if (projectKey && cardPath) acknowledgeConversation(projectKey, cardPath, viewedConversation)
    }, [cardPath, projectKey])
    const onConversationViewed = projectKey && cardPath ? handleConversationViewed : undefined

    return <ActionConversationChat conversation={conversation} onConversationViewed={onConversationViewed} status={status} />
}
