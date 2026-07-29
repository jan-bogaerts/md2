import SpeedOutlined from '@mui/icons-material/SpeedOutlined'
import { Box, Button, Divider, Popover, Stack, Typography } from '@mui/material'
import { useEffect, useState, type MouseEvent } from 'react'
import type { CodexRateLimitBucket, CodexRateLimitWindow } from '../../data/electron_codex_runtime_bridge'
import { useCodexRateLimits } from '../hooks/use_codex_rate_limits'

const CODEX_RATE_LIMIT_WARNING_PERCENT = 80
const RESET_CLOCK_UPDATE_INTERVAL_MS = 30_000
const POPOVER_WIDTH = 360
const POPOVER_VIEWPORT_MARGIN = 16
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

function formatReset(
    resetTime: number | null,
    observedAt: number,
    receivedAt: number,
    currentTime: number,
) {
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

function bucketWindows(bucket: CodexRateLimitBucket) {
    return [
        ...(bucket.primary ? [{ label: 'Primary', value: bucket.primary }] : []),
        ...(bucket.secondary ? [{ label: 'Secondary', value: bucket.secondary }] : []),
    ]
}

function bucketHighestUsage(bucket: CodexRateLimitBucket) {
    const percentages = bucketWindows(bucket).map(({ value }) => value.usedPercent)

    return percentages.length > 0 ? Math.max(...percentages) : null
}

function windowDetail(
    label: string,
    window: CodexRateLimitWindow,
    observedAt: number,
    receivedAt: number,
    currentTime: number,
) {
    const reset = formatReset(window.resetsAt, observedAt, receivedAt, currentTime)

    return `${label}: ${Math.round(window.usedPercent)}% used · ${formatWindowDuration(window.windowDurationMins)} · ${reset}`
}

/** Account-wide Codex rate-limit status. Own subscription stays at this leaf boundary. */
export function CodexRateLimitStatus() {
    const { receivedAt, snapshot, stale } = useCodexRateLimits()
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [currentTime, setCurrentTime] = useState(Date.now)

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), RESET_CLOCK_UPDATE_INTERVAL_MS)

        return () => clearInterval(interval)
    }, [])

    if (!snapshot?.available || receivedAt === null || stale) return null
    const visibleBuckets = snapshot.buckets.filter((bucket) => bucketWindows(bucket).length > 0)
    if (visibleBuckets.length === 0) return null
    const highestUsedPercent = Math.max(...visibleBuckets.map((bucket) => bucketHighestUsage(bucket) ?? 0))
    const reached = visibleBuckets.some(({ rateLimitReachedType }) => !!rateLimitReachedType) || highestUsedPercent >= 100
    const nearLimit = !reached && highestUsedPercent >= CODEX_RATE_LIMIT_WARNING_PERCENT
    const statusColor = reached ? 'error.main' : nearLimit ? 'warning.main' : 'text.secondary'
    const roundedHighestPercent = Math.round(highestUsedPercent)
    const openDetails = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }
    const closeDetails = () => {
        setAnchorElement(null)
    }
    const accessibleState = reached ? ', limit reached' : nearLimit ? ', near limit' : ''

    return (
        <>
            <Button
                aria-label={`Codex usage ${roundedHighestPercent}% used${accessibleState}`}
                onClick={openDetails}
                size="small"
                startIcon={<SpeedOutlined sx={{ fontSize: 14 }} />}
                sx={{ color: statusColor, fontSize: 'inherit', minWidth: 0, p: 0.5, whiteSpace: 'nowrap' }}
            >
                Codex {roundedHighestPercent}% used
            </Button>
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
                onClose={closeDetails}
                open={!!anchorElement}
                transformOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                <Box
                    sx={{
                        maxHeight: `calc(100vh - ${POPOVER_VIEWPORT_MARGIN}px)`,
                        maxWidth: `calc(100vw - ${POPOVER_VIEWPORT_MARGIN}px)`,
                        overflow: 'auto',
                        width: POPOVER_WIDTH,
                    }}
                >
                    <Box sx={{ p: 2 }}>
                        <Typography component="h2" sx={{ color: 'text.primary', fontWeight: 700 }} variant="subtitle2">
                            Codex account limits
                        </Typography>
                        {reached ? (
                            <Typography color="error.main" role="status" variant="caption">Codex limit reached</Typography>
                        ) : null}
                    </Box>
                    <Divider />
                    <Stack divider={<Divider flexItem />}>
                        {visibleBuckets.map((bucket, index) => (
                            <Stack key={bucket.limitId || index} spacing={0.5} sx={{ p: 2 }}>
                                <Typography sx={{ color: 'text.primary', fontWeight: 600 }} variant="body2">
                                    {bucketLabel(bucket, index)}
                                </Typography>
                                {bucketWindows(bucket).map(({ label, value }) => (
                                    <Typography color="text.secondary" key={label} variant="caption">
                                        {windowDetail(label, value, snapshot.observedAt, receivedAt, currentTime)}
                                    </Typography>
                                ))}
                            </Stack>
                        ))}
                    </Stack>
                </Box>
            </Popover>
        </>
    )
}
