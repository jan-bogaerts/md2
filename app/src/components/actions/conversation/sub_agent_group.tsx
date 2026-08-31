import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import { Box, Button, Typography } from '@mui/material'
import { memo, useCallback, useSyncExternalStore } from 'react'
import type { AgentConversationEventEntry } from '../../../data/data_types'
import { ActionConversationEventRow } from './action_conversation_event_row'
import type { ActionConversationRenderGroup } from './action_conversation_render_groups'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { TerminalToolCallGroup } from './terminal_tool_call_group'

interface SubAgentGroupProps {
    entry: AgentConversationEventEntry
    groupKey: string
    groups: ActionConversationRenderGroup[]
    label: string
    tracker: ActionConversationChatlogTracker
    runningCount?: number
}

function groupEntryCount(groups: ActionConversationRenderGroup[]): number {
    return groups.reduce((count, group) => {
        if (group.kind === 'terminalToolCalls') return count + group.entries.length
        if (group.kind === 'subAgent') return count + 1 + groupEntryCount(group.groups)

        return count + 1
    }, 0)
}

/** Shows one sub agent's text, thinking and tool calls under the `Agent` call that spawned it. */
export const SubAgentGroup = memo(function SubAgentGroup(
    { entry, groupKey, groups, label, tracker, runningCount = 0 }: SubAgentGroupProps,
) {
    const subscribe = useCallback(
        (listener: () => void) => tracker.subscribeExpansion(groupKey, listener),
        [groupKey, tracker],
    )
    const getSnapshot = useCallback(() => tracker.groupIsExpanded(groupKey), [groupKey, tracker])
    const expanded = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const toggleExpanded = () => {
        tracker.toggleExpansion(groupKey)
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
