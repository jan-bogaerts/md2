import TerminalOutlined from '@mui/icons-material/TerminalOutlined'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { AgentConversationEvent } from '../../data/data_types'
import { activityHasError, activityStatusLabel, commandPreview } from './activity_display'

const COMMAND_DETAIL_MAX_HEIGHT = 320

interface CommandExecutionActivityProps {
    activity: AgentConversationEvent
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
export function CommandExecutionActivity({ activity }: CommandExecutionActivityProps) {
    const [expanded, setExpanded] = useState(false)
    const preview = commandPreview(activity.command) || 'Command'
    const hasError = activityHasError(activity.status)
    const durationMs = typeof activity.durationMs === 'number' && Number.isFinite(activity.durationMs)
        ? activity.durationMs
        : null
    const exitCode = typeof activity.exitCode === 'number' && Number.isSafeInteger(activity.exitCode)
        ? activity.exitCode
        : null
    const toggleExpanded = () => {
        setExpanded((current) => !current)
    }

    return (
        <Box
            sx={{
                border: '1px solid',
                borderColor: hasError ? 'error.main' : 'divider',
                borderRadius: 1,
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
                        {activityStatusLabel(activity.status)}
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
                    <Box><Typography color="custom.text3" variant="caption">Command</Typography>{detailValue(activity.command ?? '')}</Box>
                    {activity.workingDirectory ? (
                        <Box><Typography color="custom.text3" variant="caption">Working directory</Typography>{detailValue(activity.workingDirectory)}</Box>
                    ) : null}
                    {activity.output ? (
                        <Box><Typography color="custom.text3" variant="caption">Output</Typography>{detailValue(activity.output)}</Box>
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
