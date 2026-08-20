import { Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import type { AgentConversationTimer } from '../../../data/data_types'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { formatDuration } from './conversation_duration'

interface ConversationTimerProps {
    status: PopupRunStatus
    timer: AgentConversationTimer | undefined
}

function displayedElapsedMs(timer: AgentConversationTimer, status: PopupRunStatus) {
    if (status !== 'running' || timer.runningStartedAt === null) return timer.elapsedMs

    return timer.elapsedMs + Date.now() - Date.parse(timer.runningStartedAt)
}

/**
 * Isolated run timer. While the run is active it ticks once a second; keeping it
 * in its own component means only this node re-renders, not the whole chat log.
 */
export function ConversationTimer({ status, timer }: ConversationTimerProps) {
    const [, setTick] = useState(0)

    useEffect(() => {
        if (status !== 'running' || !timer?.runningStartedAt) return

        const interval = setInterval(() => {
            setTick((currentTick) => currentTick + 1)
        }, 1000)

        return () => clearInterval(interval)
    }, [status, timer?.runningStartedAt])

    if (!timer) return null

    return (
        <Typography aria-label="Elapsed time" color="text.secondary" variant="caption">
            {`⏱ ${formatDuration(displayedElapsedMs(timer, status))}`}
        </Typography>
    )
}
