import BuildOutlined from '@mui/icons-material/BuildOutlined'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { AgentConversationEvent } from '../../../data/data_types'
import { eventHasError, eventStatusLabel, readableEventText } from './event_display'

const TOOL_DETAIL_MAX_HEIGHT = 240

interface AgentToolEventProps {
    event: AgentConversationEvent
    grouped: boolean
}

/** Generic compact renderer for normalized Codex tool and system events. */
export function AgentToolEvent({ event, grouped }: AgentToolEventProps) {
    const [expanded, setExpanded] = useState(false)
    const label = event.label ?? 'Agent event'
    const hasError = eventHasError(event.status)
    const contentLines = readableEventText(event.content)
    const outputLines = readableEventText(event.output)
    const durationMs = typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
        ? event.durationMs
        : null
    const hasDetail = contentLines.length > 0 || outputLines.length > 0 || durationMs !== null
    const toggleExpanded = () => {
        setExpanded((current) => !current)
    }

    return (
        <Box
            sx={{
                border: grouped ? 'none' : '1px solid',
                borderColor: hasError ? 'error.main' : 'divider',
                borderRadius: grouped ? 0 : 1,
                flexShrink: 0,
                minWidth: 0,
                overflow: 'hidden',
            }}
        >
            <Button
                aria-expanded={hasDetail ? expanded : undefined}
                aria-label={`${label} details`}
                disabled={!hasDetail}
                fullWidth
                onClick={toggleExpanded}
                startIcon={<BuildOutlined />}
                sx={{
                    color: hasError ? 'error.main' : 'text.secondary',
                    display: 'flex',
                    justifyContent: 'flex-start',
                    minWidth: 0,
                    px: 1,
                    py: 0.75,
                    textAlign: 'left',
                }}
            >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, width: '100%' }}>
                    <Typography noWrap sx={{ flex: 1, minWidth: 0 }} variant="caption">{label}</Typography>
                    <Typography color="inherit" role="status" variant="caption">
                        {eventStatusLabel(event.status)}
                    </Typography>
                </Stack>
            </Button>
            {expanded ? (
                <Stack
                    spacing={1}
                    sx={{
                        bgcolor: 'background.default',
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        color: hasError ? 'error.main' : 'text.secondary',
                        maxHeight: TOOL_DETAIL_MAX_HEIGHT,
                        minWidth: 0,
                        overflow: 'auto',
                        p: 1,
                    }}
                >
                    {contentLines.map((line, index) => (
                        <Typography key={`content-${index}`} sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }} variant="body2">
                            {line}
                        </Typography>
                    ))}
                    {outputLines.map((line, index) => (
                        <Typography key={`output-${index}`} sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }} variant="body2">
                            {line}
                        </Typography>
                    ))}
                    {durationMs !== null ? (
                        <Typography variant="caption">Duration: {durationMs} ms</Typography>
                    ) : null}
                </Stack>
            ) : null}
        </Box>
    )
}
