import type { ActionConversationRenderGroup } from './action_conversation_render_groups'
import type { ActionConversationRenderProjection } from './action_conversation_render_projection'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { ActionConversationMessage } from './action_conversation_message'
import { CompletedToolCallGroup } from './completed_tool_call_group'
import { SubAgentGroup } from './sub_agent_group'

interface ActionConversationGroupListProps {
    cardInternalId: string | null
    groups: ActionConversationRenderGroup[]
    projection: ActionConversationRenderProjection
}

/** Maps stable conversation render groups to their leaf components. */
export function ActionConversationGroupList({ cardInternalId, groups, projection }: ActionConversationGroupListProps) {
    return groups.map((group) => {
        if (group.kind === 'completedToolCalls') {
            return (
                <CompletedToolCallGroup
                    entries={group.entries}
                    groupKey={group.key}
                    key={group.key}
                    projection={projection}
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
                    projection={projection}
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
