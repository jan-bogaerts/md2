import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import { Box, Button, Typography } from '@mui/material'
import { memo, useCallback, useSyncExternalStore } from 'react'
import type { AgentConversationEventEntry } from '../../../data/data_types'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { CompletedToolCallGroup } from './completed_tool_call_group'
import type { ActionConversationRenderGroup } from './action_conversation_render_groups'
import type { ActionConversationRenderProjection } from './action_conversation_render_projection'

interface SubAgentGroupProps {
    entry: AgentConversationEventEntry
    groupKey: string
    groups: ActionConversationRenderGroup[]
    label: string
    projection: ActionConversationRenderProjection
    runningCount?: number
}

function groupEntryCount(groups: ActionConversationRenderGroup[]): number {
    return groups.reduce((count, group) => {
        if (group.kind === 'completedToolCalls') return count + group.entries.length
        if (group.kind === 'subAgent') return count + 1 + groupEntryCount(group.groups)

        return count + 1
    }, 0)
}

/** Shows one sub agent's text, thinking and tool calls under the `Agent` call that spawned it. */
export const SubAgentGroup = memo(function SubAgentGroup(
    { entry, groupKey, groups, label, projection, runningCount = 0 }: SubAgentGroupProps,
) {
    const subscribe = useCallback(
        (listener: () => void) => projection.subscribeExpansion(groupKey, listener),
        [groupKey, projection],
    )
    const getSnapshot = useCallback(() => projection.groupIsExpanded(groupKey), [groupKey, projection])
    const expanded = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const toggleExpanded = () => {
        projection.toggleExpansion(groupKey)
    }

    return (
        <Box
            aria-label={`Sub agent ${label}`}
            role="group"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, flexShrink: 0, minWidth: 0, overflow: 'hidden' }}
        >
            <ActionConversationEventRow entry={entry} grouped />
            <Button
                aria-expanded={expanded}
                aria-label={`${label} entries`}
                endIcon={expanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                fullWidth
                onClick={toggleExpanded}
                sx={{ color: 'text.secondary', justifyContent: 'space-between', minWidth: 0, px: 1, py: 0.75, textAlign: 'left' }}
            >
                <Typography noWrap sx={{ minWidth: 0 }} variant="caption">
                    {label} ({groupEntryCount(groups)}){runningCount > 0 ? ` — ${runningCount} running` : ''}
                </Typography>
            </Button>
            {expanded ? groups.map((group) => {
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
                if (group.entry.kind !== 'event') return null

                return (
                    <Box key={group.key} sx={{ borderColor: 'divider', minWidth: 0 }}>
                        <ActionConversationEventRow entry={group.entry} grouped />
                    </Box>
                )
            }) : null}
        </Box>
    )
})
