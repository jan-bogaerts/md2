import { Box, Divider, Stack, Typography } from '@mui/material'
import type {
    ClaudeRateLimitSnapshot,
    ClaudeRateLimitWindow,
    ClaudeRateLimitWindowId,
} from '../../data/electron_claude_runtime_bridge'

const POPOVER_WIDTH = 360
const WINDOW_LABELS: Record<ClaudeRateLimitWindowId, string> = { five_hour: 'Session', weekly: 'Weekly' }

function formatReset(resetTime: number, observedAt: number, receivedAt: number, currentTime: number) {
    const localResetTime = receivedAt + resetTime - observedAt
    const remainingMilliseconds = Math.max(0, localResetTime - currentTime)
    const remainingMinutes = Math.ceil(remainingMilliseconds / 60_000)
    const localTime = new Date(localResetTime).toLocaleString([], {
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
    })

    return `Resets ${localTime} (${remainingMinutes} min)`
}

function windowDetail(window: ClaudeRateLimitWindow, observedAt: number, receivedAt: number, currentTime: number) {
    return `${WINDOW_LABELS[window.id]}: ${Math.round(window.usedPercent)}% used · ${formatReset(window.resetsAt, observedAt, receivedAt, currentTime)}`
}

interface ClaudeRateLimitDetailsProps {
    currentTime: number
    reached: boolean
    receivedAt: number
    snapshot: ClaudeRateLimitSnapshot
}

/** Claude-specific limit details shared by desktop popover and mobile dialog. */
export function ClaudeRateLimitDetails(props: ClaudeRateLimitDetailsProps) {
    const { currentTime, reached, receivedAt, snapshot } = props

    return (
        <Box sx={{ maxHeight: 'calc(100vh - 16px)', maxWidth: 'calc(100vw - 16px)', overflow: 'auto', width: POPOVER_WIDTH }}>
            <Box sx={{ p: 2 }}>
                <Typography id="claude-rate-limit-title" component="h2" sx={{ color: 'text.primary', fontWeight: 700 }} variant="subtitle2">
                    Claude account limits
                </Typography>
                {reached ? <Typography color="error.main" role="status" variant="caption">Claude limit reached</Typography> : null}
            </Box>
            <Divider />
            <Stack divider={<Divider flexItem />}>
                {snapshot.windows.map((window) => (
                    <Typography color="text.secondary" key={window.id} sx={{ p: 2 }} variant="caption">
                        {windowDetail(window, snapshot.observedAt, receivedAt, currentTime)}
                    </Typography>
                ))}
            </Stack>
        </Box>
    )
}
