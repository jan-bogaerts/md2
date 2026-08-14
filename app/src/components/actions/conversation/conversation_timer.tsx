import { Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { formatDuration } from './conversation_duration'

interface ConversationTimerProps {
    completedAt: string | null
    startedAt: string
    status: PopupRunStatus
}

function elapsedMs(startedAt: string, completedAt: string | null) {
    const end = completedAt ? Date.parse(completedAt) : Date.now()

    return end - Date.parse(startedAt)
}

/**
 * Isolated run timer. While the run is active it ticks once a second; keeping it
 * in its own component means only this node re-renders, not the whole chat log.
 */
export function ConversationTimer({ completedAt, startedAt, status }: ConversationTimerProps) {
    const [timerState, setTimerState] = useState(() => ({ elapsed: elapsedMs(startedAt, null), startedAt }))
    const lastTickAtRef = useRef(0)
    if (timerState.startedAt !== startedAt) {
        setTimerState({ elapsed: elapsedMs(startedAt, null), startedAt })
    }

    useEffect(() => {
        if (completedAt || status !== 'running') return

        lastTickAtRef.current = Date.now()
        const interval = setInterval(() => {
            const now = Date.now()
            const elapsedSinceLastTick = now - lastTickAtRef.current
            lastTickAtRef.current = now
            setTimerState((currentState) => ({
                ...currentState,
                elapsed: currentState.elapsed + elapsedSinceLastTick,
            }))
        }, 1000)

        return () => clearInterval(interval)
    }, [completedAt, status])

    const displayedElapsed = completedAt ? elapsedMs(startedAt, completedAt) : timerState.elapsed

    return (
        <Typography aria-label="Elapsed time" color="text.secondary" variant="caption">
            {`⏱ ${formatDuration(displayedElapsed)}`}
        </Typography>
    )
}
