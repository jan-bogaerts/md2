import TerminalOutlined from '@mui/icons-material/TerminalOutlined'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { AgentConversationEvent } from '../../../data/data_types'
import { commandPreview, eventHasError, eventStatusLabel } from './event_display'

const COMMAND_DETAIL_MAX_HEIGHT = 320

interface CommandExecutionEventProps {
    event: AgentConversationEvent
    grouped: boolean
}

function detailValue(value: string | number) {
    return (
        <Box
            component="pre"
            sx={{
                fontFamily: 'monospace',
                m: 0,
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
            }}
        >
            {value}
        </Box>
    )
}

/** Collapsed command lifecycle entry with exact execution detail on demand. */
export function CommandExecutionEvent({ event, grouped }: CommandExecutionEventProps) {
    const [expanded, setExpanded] = useState(false)
    const preview = commandPreview(event.command) || 'Command'
    const hasError = eventHasError(event.status)
    const durationMs = typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
        ? event.durationMs
        : null
    const exitCode = typeof event.exitCode === 'number' && Number.isSafeInteger(event.exitCode)
        ? event.exitCode
        : null
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
                aria-expanded={expanded}
                aria-label={`Command details: ${preview}`}
                fullWidth
                onClick={toggleExpanded}
                startIcon={<TerminalOutlined />}
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
                    <Typography noWrap sx={{ flex: 1, minWidth: 0 }} variant="caption">{preview}</Typography>
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
                        maxHeight: COMMAND_DETAIL_MAX_HEIGHT,
                        minWidth: 0,
                        overflow: 'auto',
                        p: 1,
                    }}
                >
                    <Box><Typography color="custom.text3" variant="caption">Command</Typography>{detailValue(event.command ?? '')}</Box>
                    {event.workingDirectory ? (
                        <Box><Typography color="custom.text3" variant="caption">Working directory</Typography>{detailValue(event.workingDirectory)}</Box>
                    ) : null}
                    {event.content ? (
                        <Box><Typography color="custom.text3" variant="caption">Output</Typography>{detailValue(event.content)}</Box>
                    ) : null}
                    {exitCode !== null || durationMs !== null ? (
                        <Stack direction="row" spacing={2}>
                            {exitCode !== null ? (
                                <Typography variant="caption">Exit code: {exitCode}</Typography>
                            ) : null}
                            {durationMs !== null ? (
                                <Typography variant="caption">Duration: {durationMs} ms</Typography>
                            ) : null}
                        </Stack>
                    ) : null}
                </Stack>
            ) : null}
        </Box>
    )
}
