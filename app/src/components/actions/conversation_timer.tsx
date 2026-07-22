import { Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { formatDuration } from './conversation_duration'

interface ConversationTimerProps {
    completedAt: string | null
    startedAt: string
}

function elapsedMs(startedAt: string, completedAt: string | null) {
    const end = completedAt ? Date.parse(completedAt) : Date.now()

    return end - Date.parse(startedAt)
}

/**
 * Isolated run timer. While the run is active it ticks once a second; keeping it
 * in its own component means only this node re-renders, not the whole chat log.
 */
export function ConversationTimer({ completedAt, startedAt }: ConversationTimerProps) {
    const [, forceTick] = useState(0)

    useEffect(() => {
        if (completedAt) return

        const interval = setInterval(() => forceTick((tick) => tick + 1), 1000)

        return () => clearInterval(interval)
    }, [completedAt])

    // Derived during render so a completed run is static and a live run recomputes each tick.
    const elapsed = elapsedMs(startedAt, completedAt)

    return (
        <Typography aria-label="Elapsed time" color="text.secondary" variant="caption">
            {`⏱ ${formatDuration(elapsed)}`}
        </Typography>
    )
}
