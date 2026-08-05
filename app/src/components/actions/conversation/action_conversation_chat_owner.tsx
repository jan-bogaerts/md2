import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { cardActionPopupService, subscribeCardActionPopups } from '../../../services/actions/card_action_popup_service'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import { useActionAcknowledgements } from '../../hooks/use_agent_acknowledgements'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { useActionContextCard } from '../../hooks/use_action_context_card'
import { ActionConversationChat } from './action_conversation_chat'
import type { ActionConversationStore } from './action_conversation_store'

interface ActionConversationChatOwnerProps {
    actionId: string
    context: ActionContext
    popupEntryId?: string
    store: ActionConversationStore
}

/** Subscribes chat boundary to selected conversation, scoped acknowledgement, and popup stacking. */
export function ActionConversationChatOwner(props: ActionConversationChatOwnerProps) {
    const { actionId, context, popupEntryId, store } = props
    const liveConversation = useActionRunSelector(actionId, context, (run) => run?.conversation ?? null)
    const runStatus = useActionRunSelector(actionId, context, (run) => run?.status ?? 'idle')
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const popupEntries = useSyncExternalStore(
        subscribeCardActionPopups,
        () => cardActionPopupService.getSnapshot(),
        () => cardActionPopupService.getSnapshot(),
    )
    const { cardPath } = useActionContextCard(context)
    useActionAcknowledgements(cardPath, actionId)
    const conversation = liveConversation ?? selectedConversation
    const status = runStatus === 'idle' && conversation?.status === 'waitingForInput' ? 'waitingForInput' : runStatus
    const visible = !!popupEntryId && popupEntries.at(-1)?.id === popupEntryId && !!cardPath && !!conversation

    useEffect(() => {
        if (!popupEntryId || !cardPath || !conversation) return undefined

        agentAcknowledgementService.setConversationVisible(popupEntryId, cardPath, actionId, conversation, visible)

        return () => agentAcknowledgementService.setConversationVisible(
            popupEntryId,
            cardPath,
            actionId,
            conversation,
            false,
        )
    }, [actionId, cardPath, conversation, popupEntryId, visible])

    return <ActionConversationChat conversation={conversation} status={status} />
}
