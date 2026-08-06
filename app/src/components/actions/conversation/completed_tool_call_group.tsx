import { Box } from '@mui/material'
import type { AgentConversationEventEntry } from '../../../data/data_types'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { eventIdentity } from './event_display'

interface CompletedToolCallGroupProps {
    entries: AgentConversationEventEntry[]
}

/** Shows adjacent completed tool calls inside one shared border. */
export function CompletedToolCallGroup({ entries }: CompletedToolCallGroupProps) {
    return (
        <Box
            aria-label="Completed tool calls"
            role="group"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, flexShrink: 0, minWidth: 0, overflow: 'hidden' }}
        >
            {entries.map((entry, index) => (
                <Box
                    key={eventIdentity(entry)}
                    sx={{ borderColor: 'divider', borderTop: index === 0 ? 'none' : '1px solid', minWidth: 0 }}
                >
                    <ActionConversationEventRow entry={entry} grouped />
                </Box>
            ))}
        </Box>
    )
}
