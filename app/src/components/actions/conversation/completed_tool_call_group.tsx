import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import { Box, Button, Typography } from '@mui/material'
import { useState } from 'react'
import type { AgentConversationEventEntry } from '../../../data/data_types'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { eventIdentity } from './event_display'

interface CompletedToolCallGroupProps {
    entries: AgentConversationEventEntry[]
}

/** Shows adjacent completed tool calls as one expandable summary. */
export function CompletedToolCallGroup({ entries }: CompletedToolCallGroupProps) {
    const [expanded, setExpanded] = useState(false)
    const toggleExpanded = () => {
        setExpanded((current) => !current)
    }

    return (
        <Box
            aria-label="Completed tool calls"
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
                <Typography noWrap sx={{ minWidth: 0 }} variant="caption">Tools called ({entries.length})</Typography>
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
}
