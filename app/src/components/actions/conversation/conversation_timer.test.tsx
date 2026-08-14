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

    it('freezes at the completed duration when the run is done', () => {
        render(
            <ConversationTimer
                completedAt="2026-01-01T00:01:30.000Z"
                startedAt="2026-01-01T00:00:00.000Z"
                status="completed"
            />,
        )

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('1:30')

        act(() => {
            vi.advanceTimersByTime(3_000)
        })

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('1:30')
    })

    it('ticks once a second while the run is active', () => {
        render(<ConversationTimer completedAt={null} startedAt="2026-01-01T00:00:00.000Z" status="running" />)

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:05')

        act(() => {
            vi.advanceTimersByTime(3_000)
        })

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:08')
    })

    it.each(['idle', 'waitingForInput', 'completed', 'failed', 'cancelled'] as const)(
        'does not tick while status is %s',
        (status) => {
            render(<ConversationTimer completedAt={null} startedAt="2026-01-01T00:00:00.000Z" status={status} />)

            expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:05')

            act(() => {
                vi.advanceTimersByTime(3_000)
            })

            expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:05')
        },
    )

    it('resets elapsed duration when the displayed conversation changes', () => {
        const { rerender } = render(
            <ConversationTimer completedAt={null} startedAt="2026-01-01T00:00:00.000Z" status="idle" />,
        )
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:05')

        rerender(<ConversationTimer completedAt={null} startedAt="2026-01-01T00:00:04.000Z" status="idle" />)

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:01')
    })

    it('resumes from the frozen value without counting time spent waiting', () => {
        const { rerender } = render(
            <ConversationTimer completedAt={null} startedAt="2026-01-01T00:00:00.000Z" status="running" />,
        )

        act(() => {
            vi.advanceTimersByTime(3_000)
        })
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:08')

        rerender(<ConversationTimer completedAt={null} startedAt="2026-01-01T00:00:00.000Z" status="waitingForInput" />)
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:08')

        rerender(<ConversationTimer completedAt={null} startedAt="2026-01-01T00:00:00.000Z" status="running" />)
        act(() => {
            vi.advanceTimersByTime(2_000)
        })

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:10')
    })
})
