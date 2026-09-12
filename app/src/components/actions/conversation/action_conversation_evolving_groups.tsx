import { memo, useSyncExternalStore } from 'react'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationGroupList } from './action_conversation_group_list'
import type { ActionConversationCommandOperations } from './action_conversation_command_service'

interface ActionConversationEvolvingGroupsProps {
    commands: ActionConversationCommandOperations
    tracker: ActionConversationChatlogTracker
}

/** Subscribes to and renders regularly changing conversation groups. */
export const ActionConversationEvolvingGroups = memo(function ActionConversationEvolvingGroups(
    { commands, tracker }: ActionConversationEvolvingGroupsProps,
) {
    const groups = useSyncExternalStore(
        tracker.subscribeEvolvingGroups,
        tracker.getEvolvingGroups,
        tracker.getEvolvingGroups,
    )

    return <ActionConversationGroupList commands={commands} groups={groups} tracker={tracker} />
})
