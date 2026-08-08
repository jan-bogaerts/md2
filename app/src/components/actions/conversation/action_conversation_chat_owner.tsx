import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { cardPopupService, subscribeCardPopups } from '../../../services/card_popup_service'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import { useActionRunSelector } from '../../hooks/use_action_runs'
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
        subscribeCardPopups,
        () => cardPopupService.getSnapshot(),
        () => cardPopupService.getSnapshot(),
    )
    const cardInternalId = context.cardInternalId
    const conversation = liveConversation ?? selectedConversation
    const status = runStatus === 'idle' && conversation?.status === 'waitingForInput' ? 'waitingForInput' : runStatus
    const visible = !!popupEntryId && popupEntries.at(-1)?.id === popupEntryId && !!cardInternalId && !!conversation

    useEffect(() => {
        if (!popupEntryId || !cardInternalId || !conversation) return undefined

        agentAcknowledgementService.setConversationVisible(popupEntryId, cardInternalId, actionId, conversation, visible)

        return () => agentAcknowledgementService.setConversationVisible(
            popupEntryId,
            cardInternalId,
            actionId,
            conversation,
            false,
        )
    }, [actionId, cardInternalId, conversation, popupEntryId, visible])

    return <ActionConversationChat conversation={conversation} status={status} />
}
