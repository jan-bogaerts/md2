import BuildOutlined from '@mui/icons-material/BuildOutlined'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { AgentConversationEvent } from '../../data/data_types'
import { activityHasError, activityStatusLabel, readableActivityText } from './activity_display'

const TOOL_DETAIL_MAX_HEIGHT = 240

interface AgentToolActivityProps {
    activity: AgentConversationEvent
}

/** Generic compact renderer for normalized Codex tool and system activity. */
export function AgentToolActivity({ activity }: AgentToolActivityProps) {
    const [expanded, setExpanded] = useState(false)
    const label = activity.label ?? 'Agent activity'
    const hasError = activityHasError(activity.status)
    const contentLines = readableActivityText(activity.content)
    const outputLines = readableActivityText(activity.output)
    const durationMs = typeof activity.durationMs === 'number' && Number.isFinite(activity.durationMs)
        ? activity.durationMs
        : null
    const hasDetail = contentLines.length > 0 || outputLines.length > 0 || durationMs !== null
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
