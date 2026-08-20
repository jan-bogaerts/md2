import SpeedOutlined from '@mui/icons-material/SpeedOutlined'
import { Button } from '@mui/material'
import { useEffect, useState, type MouseEvent } from 'react'
import { useClaudeRateLimits } from '../hooks/use_claude_rate_limits'
import { ClaudeRateLimitDetails } from './claude_rate_limit_details'
import { claudeRateLimitPresentation } from './claude_rate_limit_status_data'
import { MobileStatusRow } from './mobile_status_row'
import { StatusDetailsSurface } from './status_details_surface'

const RESET_CLOCK_UPDATE_INTERVAL_MS = 30_000

interface ClaudeRateLimitStatusProps {
    mobile?: boolean
}

/** Account-wide Claude rate-limit status. Own subscription stays at this leaf boundary. */
export function ClaudeRateLimitStatus({ mobile = false }: ClaudeRateLimitStatusProps) {
    const rateLimitState = useClaudeRateLimits()
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [currentTime, setCurrentTime] = useState(Date.now)

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), RESET_CLOCK_UPDATE_INTERVAL_MS)

        return () => clearInterval(interval)
    }, [])

    const presentation = claudeRateLimitPresentation(rateLimitState)
    if (!presentation) return null
    const { accessibleState, highestUsedPercent, nearLimit, reached, receivedAt, snapshot } = presentation
    const statusColor = reached ? 'error.main' : nearLimit ? 'warning.main' : 'text.secondary'
    const roundedHighestPercent = Math.round(highestUsedPercent)
    const openDetails = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }
    const closeDetails = () => {
        setAnchorElement(null)
    }
    const accessibleName = `Claude usage ${roundedHighestPercent}% used${accessibleState}`

    return (
        <>
            {mobile ? (
                <MobileStatusRow
                    accessibleName={accessibleName}
                    icon={<SpeedOutlined sx={{ fontSize: 18 }} />}
                    label="Claude usage"
                    onClick={openDetails}
                    tone={statusColor}
                    value={`${roundedHighestPercent}% used`}
                />
            ) : (
                <Button
                    aria-label={accessibleName}
                    onClick={openDetails}
                    size="small"
                    startIcon={<SpeedOutlined sx={{ fontSize: 14 }} />}
                    sx={{ color: statusColor, fontSize: 'inherit', minWidth: 0, p: 0.5, whiteSpace: 'nowrap' }}
                >
                    Claude {roundedHighestPercent}% used
                </Button>
            )}
            <StatusDetailsSurface anchorElement={anchorElement} labelId="claude-rate-limit-title" mobile={mobile} onClose={closeDetails}>
                <ClaudeRateLimitDetails
                    currentTime={currentTime}
                    reached={reached}
                    receivedAt={receivedAt}
                    snapshot={snapshot}
                />
            </StatusDetailsSurface>
        </>
    )
}
