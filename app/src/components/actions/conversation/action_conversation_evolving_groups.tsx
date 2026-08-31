import { memo, useSyncExternalStore } from 'react'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationGroupList } from './action_conversation_group_list'

interface ActionConversationEvolvingGroupsProps {
    tracker: ActionConversationChatlogTracker
}

/** Subscribes to and renders regularly changing conversation groups. */
export const ActionConversationEvolvingGroups = memo(function ActionConversationEvolvingGroups(
    { tracker }: ActionConversationEvolvingGroupsProps,
) {
    const groups = useSyncExternalStore(
        tracker.subscribeEvolvingGroups,
        tracker.getEvolvingGroups,
        tracker.getEvolvingGroups,
    )

    return <ActionConversationGroupList cardInternalId={tracker.getCardInternalId()} groups={groups} tracker={tracker} />
})
