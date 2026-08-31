import { memo, useSyncExternalStore } from 'react'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationGroupList } from './action_conversation_group_list'

interface ActionConversationHistoryProps {
    tracker: ActionConversationChatlogTracker
}

/** Subscribes to and renders low-change conversation groups. */
export const ActionConversationHistory = memo(function ActionConversationHistory(
    { tracker }: ActionConversationHistoryProps,
) {
    const groups = useSyncExternalStore(
        tracker.subscribeStableGroups,
        tracker.getStableGroups,
        tracker.getStableGroups,
    )

    return <ActionConversationGroupList cardInternalId={tracker.getCardInternalId()} groups={groups} tracker={tracker} />
})
