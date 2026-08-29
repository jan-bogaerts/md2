import type { ActionConversationRenderGroup } from './action_conversation_render_groups'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { ActionConversationMessage } from './action_conversation_message'
import { SubAgentGroup } from './sub_agent_group'
import { TerminalToolCallGroup } from './terminal_tool_call_group'

interface ActionConversationGroupListProps {
    cardInternalId: string | null
    groups: ActionConversationRenderGroup[]
    tracker: ActionConversationChatlogTracker
}

/** Maps stable conversation render groups to their leaf components. */
export function ActionConversationGroupList({ cardInternalId, groups, tracker }: ActionConversationGroupListProps) {
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
            return <ActionConversationMessage cardInternalId={cardInternalId} entry={entry} key={group.key} />
        }

        return <ActionConversationEventRow entry={entry} grouped={false} key={group.key} />
    })
}
