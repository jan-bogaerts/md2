import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import { Box, Button, Typography } from '@mui/material'
import { memo, useCallback, useSyncExternalStore } from 'react'
import type { AgentConversationEventEntry } from '../../../data/data_types'
import { ActionConversationEventRow } from './action_conversation_event_row'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { eventHasError, eventIdentity } from './event_display'

interface TerminalToolCallGroupProps {
    entries: AgentConversationEventEntry[]
    groupKey: string
    tracker: ActionConversationChatlogTracker
}

/** Shows adjacent terminal tool calls as one expandable summary. */
export const TerminalToolCallGroup = memo(function TerminalToolCallGroup(
    { entries, groupKey, tracker }: TerminalToolCallGroupProps,
) {
    const subscribe = useCallback(
        (listener: () => void) => tracker.subscribeExpansion(groupKey, listener),
        [groupKey, tracker],
    )
    const getSnapshot = useCallback(() => tracker.groupIsExpanded(groupKey), [groupKey, tracker])
    const expanded = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const errorCount = entries.filter((entry) => eventHasError(entry.status)).length
    const toggleExpanded = () => {
        tracker.toggleExpansion(groupKey)
    }

    return (
        <Box
            aria-label="Terminal tool calls"
            role="group"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, flexShrink: 0, minWidth: 0, overflow: 'hidden' }}
        >
            <Button
                aria-expanded={expanded}
                endIcon={expanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                fullWidth
                onClick={toggleExpanded}
                sx={{ color: 'text.secondary', justifyContent: 'space-between', minWidth: 0, px: 1, py: 0.75, textAlign: 'left' }}
            >
                <Typography noWrap sx={{ minWidth: 0 }} variant="caption">
                    Tools called ({entries.length}){errorCount > 0 ? ` — errors: ${errorCount}` : ''}
                </Typography>
            </Button>
            {expanded ? entries.map((entry) => (
                <Box
                    key={eventIdentity(entry)}
                    sx={{ borderColor: 'divider', minWidth: 0 }}
                >
                    <ActionConversationEventRow entry={entry} grouped />
                </Box>
            )) : null}
        </Box>
    )
})
