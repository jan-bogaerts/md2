import { useSyncExternalStore } from 'react'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationReservedBlock } from './action_conversation_reserved_block'

interface ActionConversationReservedBlocksProps {
    tracker: ActionConversationChatlogTracker
}

/** Renders placeholders reserved for changing conversation groups. */
export function ActionConversationReservedBlocks({ tracker }: ActionConversationReservedBlocksProps) {
    const count = useSyncExternalStore(
        tracker.subscribeReservedBlockCount,
        tracker.getReservedBlockCount,
        tracker.getReservedBlockCount,
    )

    return Array.from({ length: count }, (_, index) => (
        <ActionConversationReservedBlock key={`reserved-block-${index}`} />
    ))
}
