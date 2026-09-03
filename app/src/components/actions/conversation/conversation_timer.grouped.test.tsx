import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDuration } from './conversation_duration'
import { ConversationTimer } from './conversation_timer'

describe('formatDuration', () => {
    it('formats sub-minute spans as m:ss', () => {
        expect(formatDuration(7_000)).toBe('0:07')
    })

    it('formats minute spans as m:ss', () => {
        expect(formatDuration(83_000)).toBe('1:23')
    })

    it('formats hour spans as h:mm:ss', () => {
        expect(formatDuration(3_753_000)).toBe('1:02:33')
    })

    it('clamps negative spans to zero', () => {
        expect(formatDuration(-5_000)).toBe('0:00')
    })
})

describe('ConversationTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    })

    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it('shows persisted elapsed time without ticking after completion', () => {
        render(
            <ConversationTimer
                status="completed"
                timer={{ elapsedMs: 90_000, runningStartedAt: null }}
            />,
        )

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('1:30')

        act(() => {
            vi.advanceTimersByTime(3_000)
        })

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('1:30')
    })

    it('ticks once a second while the run is active', () => {
        render(
            <ConversationTimer
                status="running"
                timer={{ elapsedMs: 10_000, runningStartedAt: '2026-01-01T00:00:00.000Z' }}
            />,
        )

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:15')

        act(() => {
            vi.advanceTimersByTime(999)
        })
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:15')

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:16')
    })

    it.each(['idle', 'waitingForInput', 'completed', 'failed', 'cancelled'] as const)(
        'does not tick while status is %s',
        (status) => {
            render(<ConversationTimer status={status} timer={{ elapsedMs: 5_000, runningStartedAt: null }} />)

            expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:05')

            act(() => {
                vi.advanceTimersByTime(3_000)
            })

            expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:05')
        },
    )

    it('uses persisted duration when displayed conversation changes', () => {
        const { rerender } = render(
            <ConversationTimer status="idle" timer={{ elapsedMs: 5_000, runningStartedAt: null }} />,
        )
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:05')

        rerender(<ConversationTimer status="idle" timer={{ elapsedMs: 1_000, runningStartedAt: null }} />)

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:01')
    })

    it('resumes from the frozen value without counting time spent waiting', () => {
        const { rerender } = render(
            <ConversationTimer
                status="running"
                timer={{ elapsedMs: 0, runningStartedAt: '2026-01-01T00:00:00.000Z' }}
            />,
        )

        act(() => {
            vi.advanceTimersByTime(3_000)
        })
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:08')

        rerender(<ConversationTimer status="waitingForInput" timer={{ elapsedMs: 8_000, runningStartedAt: null }} />)
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:08')

        rerender(
            <ConversationTimer
                status="running"
                timer={{ elapsedMs: 8_000, runningStartedAt: '2026-01-01T00:00:18.000Z' }}
            />,
        )
        act(() => {
            vi.advanceTimersByTime(2_000)
        })

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:10')
    })

    it('shows no fabricated duration when timer data is unavailable', () => {
        render(<ConversationTimer status="completed" timer={undefined} />)

        expect(screen.queryByLabelText('Elapsed time')).not.toBeInTheDocument()
    })
})
