import { Box, Divider, Stack, Typography } from '@mui/material'
import type { CodexRateLimitBucket, CodexRateLimitSnapshot, CodexRateLimitWindow } from '../../data/electron_codex_runtime_bridge'
import { codexBucketWindows } from './codex_rate_limit_status_data'

const POPOVER_WIDTH = 360
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 1440
const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000

function resetTimeMilliseconds(resetTime: number) {
    return resetTime < UNIX_MILLISECONDS_THRESHOLD ? resetTime * 1000 : resetTime
}

function formatWindowDuration(durationMinutes: number | null) {
    if (durationMinutes === null) return 'Unknown window'
    if (durationMinutes % MINUTES_PER_DAY === 0) {
        const days = durationMinutes / MINUTES_PER_DAY

        return `${days} ${days === 1 ? 'day' : 'days'}`
    }
    if (durationMinutes % MINUTES_PER_HOUR === 0) {
        const hours = durationMinutes / MINUTES_PER_HOUR

        return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
    }

    return `${durationMinutes} minutes`
}

function formatReset(resetTime: number | null, observedAt: number, receivedAt: number, currentTime: number) {
    if (resetTime === null) return 'Reset unknown'
    const resetMilliseconds = resetTimeMilliseconds(resetTime)
    const localResetTime = receivedAt + resetMilliseconds - observedAt
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

function bucketLabel(bucket: CodexRateLimitBucket, index: number) {
    return bucket.limitName?.trim() || bucket.limitId.trim() || `Limit ${index + 1}`
}

function windowDetail(label: string, window: CodexRateLimitWindow, observedAt: number, receivedAt: number, currentTime: number) {
    const reset = formatReset(window.resetsAt, observedAt, receivedAt, currentTime)

    return `${label}: ${Math.round(window.usedPercent)}% used · ${formatWindowDuration(window.windowDurationMins)} · ${reset}`
}

interface CodexRateLimitDetailsProps {
    currentTime: number
    reached: boolean
    receivedAt: number
    snapshot: CodexRateLimitSnapshot
    visibleBuckets: CodexRateLimitBucket[]
}

/** Shared Codex limit detail content for desktop and mobile surfaces. */
export function CodexRateLimitDetails(props: CodexRateLimitDetailsProps) {
    const { currentTime, reached, receivedAt, snapshot, visibleBuckets } = props

    return (
        <Box sx={{ maxHeight: 'calc(100vh - 16px)', maxWidth: 'calc(100vw - 16px)', overflow: 'auto', width: POPOVER_WIDTH }}>
            <Box sx={{ p: 2 }}>
                <Typography id="codex-rate-limit-title" component="h2" sx={{ color: 'text.primary', fontWeight: 700 }} variant="subtitle2">
                    Codex account limits
                </Typography>
                {reached ? <Typography color="error.main" role="status" variant="caption">Codex limit reached</Typography> : null}
            </Box>
            <Divider />
            <Stack divider={<Divider flexItem />}>
                {visibleBuckets.map((bucket, index) => (
                    <Stack key={bucket.limitId || index} spacing={0.5} sx={{ p: 2 }}>
                        <Typography sx={{ color: 'text.primary', fontWeight: 600 }} variant="body2">
                            {bucketLabel(bucket, index)}
                        </Typography>
                        {codexBucketWindows(bucket).map(({ label, value }) => (
                            <Typography color="text.secondary" key={label} variant="caption">
                                {windowDetail(label, value, snapshot.observedAt, receivedAt, currentTime)}
                            </Typography>
                        ))}
                    </Stack>
                ))}
            </Stack>
        </Box>
    )
}
