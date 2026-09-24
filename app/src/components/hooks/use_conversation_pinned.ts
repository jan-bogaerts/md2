import { useCallback, useSyncExternalStore } from 'react'
import type { ConversationPickerConversation } from '../actions/conversation/picker/action_conversation_picker_data'
import { dataService } from '../../services/data/data_service'

/** Subscribes one leaf control to one conversation's confirmed pin state. */
export function useConversationPinned(conversation: ConversationPickerConversation | null) {
    const conversationId = conversation?.id ?? null
    const subscribe = useCallback((listener: () => void) => (
        conversationId ? dataService.conversationPins.subscribeConversation(conversationId, listener) : () => undefined
    ), [conversationId])
    const getSnapshot = useCallback(() => (
        conversationId ? dataService.conversationPins.isPinned(conversationId) : false
    ), [conversationId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
