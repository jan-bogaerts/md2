import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { AgentConversationEvent } from '../../../data/data_types'
import { eventHasError, eventIdentity, eventStatusLabel } from './event_display'
import { reasoningDisplay } from './reasoning_display'

interface ReasoningEventProps {
    event: AgentConversationEvent
}

/** Subdued live reasoning summary preserving provider section boundaries. */
export function ReasoningEvent({ event }: ReasoningEventProps) {
    const completed = event.status === 'completed'
    const [expansion, setExpansion] = useState({ completed, expanded: !completed })
    if (expansion.completed !== completed) setExpansion({ completed, expanded: !completed })
    const expanded = !completed || expansion.expanded
    const { sections } = reasoningDisplay(event)
    const hasError = eventHasError(event.status)
    const toggleExpanded = () => {
        setExpansion((current) => ({ ...current, expanded: !current.expanded }))
    }

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
            {completed ? (
                <Button
                    aria-expanded={expanded}
                    aria-label="Reasoning details"
                    endIcon={expanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                    fullWidth
                    onClick={toggleExpanded}
                    sx={{ color: 'text.secondary', justifyContent: 'space-between', minWidth: 0, p: 0, textAlign: 'left' }}
                >
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, width: '100%' }}>
                        <Typography sx={{ flex: 1, fontWeight: 600, minWidth: 0 }} variant="caption">Burning tokens</Typography>
                        <Typography color="custom.text3" role="status" variant="caption">
                            {eventStatusLabel(event.status)}
                        </Typography>
                    </Stack>
                </Button>
            ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Burning tokens</Typography>
                    <Typography color={hasError ? 'error.main' : 'custom.text3'} role="status" variant="caption">
                        {eventStatusLabel(event.status)}
                    </Typography>
                </Stack>
            )}
            {expanded ? sections.map((section, index) => (
                <Typography
                    color={hasError ? 'error.main' : 'text.secondary'}
                    key={`${eventIdentity(event)}-section-${index}`}
                    sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                    variant="body2"
                >
                    {section}
                </Typography>
            )) : null}
        </Box>
    )
}
