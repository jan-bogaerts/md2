import type { ActionConversationRenderGroup } from './action_conversation_render_groups'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationEventRow } from '../events/action_conversation_event_row'
import { ActionConversationMessage } from '../messages/action_conversation_message'
import { SubAgentGroup } from '../events/sub_agent_group'
import { TerminalToolCallGroup } from '../events/terminal_tool_call_group'
import type { ActionConversationCommandOperations } from '../state/action_conversation_command_service'

interface ActionConversationGroupListProps {
    commands: ActionConversationCommandOperations
    groups: ActionConversationRenderGroup[]
    tracker: ActionConversationChatlogTracker
}

/** Maps stable conversation render groups to their leaf components. */
export function ActionConversationGroupList({ commands, groups, tracker }: ActionConversationGroupListProps) {
    return groups.map((group) => {
        if (group.kind === 'terminalToolCalls') {
            return (
                <TerminalToolCallGroup
                    entries={group.entries}
                    groupKey={group.key}
                    key={group.key}
                    tracker={tracker}
                />
            )
        }
        if (group.kind === 'subAgent') {
            return (
                <SubAgentGroup
                    entry={group.entry}
                    groupKey={group.key}
                    groups={group.groups}
                    key={group.key}
                    label={group.label}
                    tracker={tracker}
                    runningCount={group.runningCount}
                />
            )
        }

        const { entry } = group
        if (entry.kind === 'message') {
            return <ActionConversationMessage commands={commands} entry={entry} key={group.key} tracker={tracker} />
        }

        return <ActionConversationEventRow entry={entry} grouped={false} key={group.key} />
    })
}
