import { Tooltip, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import type { AgentConversationTimer } from '../../../../data/data_types'
import type { PopupRunStatus } from '../../run/popup/action_popup_defaults'
import { formatDuration } from './conversation_duration'

interface ConversationTimerProps {
    status: PopupRunStatus
    timer: AgentConversationTimer | undefined
}

function displayedElapsedMs(timer: AgentConversationTimer, status: PopupRunStatus) {
    if (status !== 'running' || timer.runningStartedAt === null) return timer.elapsedMs

    return timer.elapsedMs + Date.now() - Date.parse(timer.runningStartedAt)
}

function durationLine(label: string, valueMs: number, totalMs: number) {
    const share = totalMs > 0 ? Math.round((valueMs / totalMs) * 100) : 0

    return `${label}: ${formatDuration(valueMs)} (${share}%)`
}

/**
 * Splits the measured total into the parts it was spent on. A tool that is still running is not in
 * `toolMs` yet, so its time reads as agent time until it finishes; the note says so.
 */
function breakdownText(timer: AgentConversationTimer, elapsedMs: number) {
    const lines = [`Total: ${formatDuration(elapsedMs)}`]
    if (!timer.breakdown) {
        lines.push('Unmeasured: recorded before the time split existed')

        return lines.join('\n')
    }
    const { reasoningMs, toolMs } = timer.breakdown
    lines.push(
        durationLine('Tools', toolMs, elapsedMs),
        durationLine('Reasoning', reasoningMs, elapsedMs),
        durationLine('Agent', Math.max(0, elapsedMs - toolMs - reasoningMs), elapsedMs),
        'A tool still running counts as agent time until it finishes.',
    )

    return lines.join('\n')
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
    const elapsedMs = displayedElapsedMs(timer, status)
    const tooltip = breakdownText(timer, elapsedMs)

    return (
        <Tooltip slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }} title={tooltip}>
            <Typography aria-label={`Elapsed time. ${tooltip.replaceAll('\n', '; ')}`} color="text.secondary" variant="caption">
                {`⏱ ${formatDuration(elapsedMs)}`}
            </Typography>
        </Tooltip>
    )
}
