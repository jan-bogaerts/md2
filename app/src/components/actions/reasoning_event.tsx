import { Box, Stack, Typography } from '@mui/material'
import type { AgentConversationEvent } from '../../data/data_types'
import { eventHasError, eventIdentity, eventStatusLabel } from './event_display'

interface ReasoningEventProps {
    event: AgentConversationEvent
}

/** Subdued live reasoning summary preserving provider section boundaries. */
export function ReasoningEvent({ event }: ReasoningEventProps) {
    const sections = event.summary && event.summary.length > 0
        ? event.summary
        : event.details && event.details.length > 0
            ? event.details
            : event.content ? [event.content] : []
    const hasError = eventHasError(event.status)

    return (
        <Box
            sx={{
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: hasError ? 'error.main' : 'divider',
                borderRadius: 1,
                flexShrink: 0,
                minWidth: 0,
                p: 1,
            }}
        >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Burning tokens</Typography>
                <Typography color={hasError ? 'error.main' : 'custom.text3'} role="status" variant="caption">
                    {eventStatusLabel(event.status)}
                </Typography>
            </Stack>
            {sections.map((section, index) => (
                <Typography
                    color={hasError ? 'error.main' : 'text.secondary'}
                    key={`${eventIdentity(event)}-section-${index}`}
                    sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                    variant="body2"
                >
                    {section}
                </Typography>
            ))}
        </Box>
    )
}
