import { memo, useSyncExternalStore } from 'react'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationGroupList } from './action_conversation_group_list'
import type { ActionConversationCommandOperations } from '../state/action_conversation_command_service'

interface ActionConversationHistoryProps {
    commands: ActionConversationCommandOperations
    tracker: ActionConversationChatlogTracker
}

/** Subscribes to and renders low-change conversation groups. */
export const ActionConversationHistory = memo(function ActionConversationHistory(
    { commands, tracker }: ActionConversationHistoryProps,
) {
    const groups = useSyncExternalStore(
        tracker.subscribeStableGroups,
        tracker.getStableGroups,
        tracker.getStableGroups,
    )

    return <ActionConversationGroupList commands={commands} groups={groups} tracker={tracker} />
})
