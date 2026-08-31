import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    setClaudeRuntimeBridgeOverride,
    type ClaudeRateLimitSnapshot,
    type ElectronClaudeRuntimeBridge,
} from '../../data/electron_claude_runtime_bridge'
import {
    setCodexRuntimeBridgeOverride,
    type CodexRateLimitSnapshot,
    type ElectronCodexRuntimeBridge,
} from '../../data/electron_codex_runtime_bridge'
import { claudeRateLimitService } from '../../services/agents/claude_rate_limit_service'
import { codexRateLimitService } from '../../services/agents/codex_rate_limit_service'
import { ClaudeRateLimitStatus } from './claude_rate_limit_status'
import { CodexRateLimitStatus } from './codex_rate_limit_status'

function snapshot(
    fiveHourPercent = 25,
    weeklyPercent = 40,
    observedAt = Date.now(),
    firstResetDelayMs = 3_600_000,
): ClaudeRateLimitSnapshot {
    return {
        available: true,
        observedAt,
        windows: [
            { id: 'five_hour', resetsAt: observedAt + firstResetDelayMs, usedPercent: fiveHourPercent },
            { id: 'weekly', resetsAt: observedAt + 7_200_000, usedPercent: weeklyPercent },
        ],
    }
}

function runtimeBridge(initialSnapshot: ClaudeRateLimitSnapshot | null) {
    let listener: ((value: ClaudeRateLimitSnapshot) => void) | null = null
    const bridge: ElectronClaudeRuntimeBridge = {
        getClaudeRateLimits: vi.fn(async () => initialSnapshot),
        onClaudeRateLimits: vi.fn((callback) => {
            listener = callback

            return vi.fn()
        }),
    }

    return { bridge, emit: (value: ClaudeRateLimitSnapshot) => listener?.(value) }
}

async function renderStatus(initialSnapshot: ClaudeRateLimitSnapshot | null, mobile = false) {
    const runtime = runtimeBridge(initialSnapshot)
    setClaudeRuntimeBridgeOverride(runtime.bridge)
    claudeRateLimitService.start()
    render(<ClaudeRateLimitStatus mobile={mobile} />)
    await act(async () => {
        await Promise.resolve()
    })

    return runtime
}

describe('ClaudeRateLimitStatus', () => {
    afterEach(() => {
        cleanup()
        claudeRateLimitService.stop()
        codexRateLimitService.stop()
        setClaudeRuntimeBridgeOverride(null)
        setCodexRuntimeBridgeOverride(null)
        vi.useRealTimers()
    })

    it('stays hidden before data and for unavailable state', async () => {
        const runtime = await renderStatus(null)
        expect(screen.queryByText(/Claude \d/u)).not.toBeInTheDocument()

        act(() => runtime.emit({ available: false, observedAt: Date.now(), windows: [] }))

        expect(screen.queryByText(/Claude \d/u)).not.toBeInTheDocument()
    })

    it('shows highest usage and lists session and weekly reset details', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-15T10:00:00.000Z'))
        const observedAt = Date.now()
        await renderStatus(snapshot(42, 55, observedAt))

        fireEvent.click(screen.getByRole('button', { name: 'Claude usage 55% used' }))
        const sessionReset = new Date(observedAt + 3_600_000).toLocaleString([], {
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
        })

        expect(screen.getByText('Claude 55% used')).toBeInTheDocument()
        expect(screen.getByText(new RegExp(`Session: 42% used · Resets ${sessionReset}`, 'u'))).toBeInTheDocument()
        expect(screen.getByText(/Weekly: 55% used · Resets/u)).toBeInTheDocument()
    })

    it('announces warning and reached states accessibly', async () => {
        const runtime = await renderStatus(snapshot(85, 20))
        expect(screen.getByRole('button', { name: 'Claude usage 85% used, near limit' })).toBeInTheDocument()

        act(() => runtime.emit(snapshot(100, 20)))
        fireEvent.click(screen.getByRole('button', { name: 'Claude usage 100% used, limit reached' }))

        expect(screen.getByRole('status')).toHaveTextContent('Claude limit reached')
    })

    it('renders nothing after earliest reset becomes stale', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-15T10:00:00.000Z'))
        await renderStatus(snapshot(25, 20, Date.now(), 60_000))
        expect(screen.getByText('Claude 25% used')).toBeInTheDocument()

        await act(async () => vi.advanceTimersByTimeAsync(60_000))

        expect(screen.queryByText('Claude 25% used')).not.toBeInTheDocument()
    })

    it('opens Claude details in mobile dialog', async () => {
        await renderStatus(snapshot(20, 10), true)

        fireEvent.click(screen.getByRole('button', { name: 'Claude usage 20% used' }))

        expect(screen.getByRole('dialog', { name: 'Claude account limits' })).toBeInTheDocument()
    })

    it('renders independently beside Codex usage', async () => {
        const claudeRuntime = runtimeBridge(snapshot(30, 20))
        const codexSnapshot: CodexRateLimitSnapshot = {
            available: true,
            buckets: [{
                credits: null,
                individualLimit: null,
                limitId: 'codex',
                limitName: 'Codex',
                planType: 'plus',
                primary: { resetsAt: Math.floor(Date.now() / 1000) + 3600, usedPercent: 45, windowDurationMins: 300 },
                rateLimitReachedType: null,
                secondary: null,
            }],
            observedAt: Date.now(),
            rateLimitResetCredits: null,
        }
        const codexBridge: ElectronCodexRuntimeBridge = {
            getCodexRateLimits: vi.fn(async () => codexSnapshot),
            onCodexRateLimits: vi.fn(() => vi.fn()),
        }
        setClaudeRuntimeBridgeOverride(claudeRuntime.bridge)
        setCodexRuntimeBridgeOverride(codexBridge)
        claudeRateLimitService.start()
        codexRateLimitService.start()
        render(<><ClaudeRateLimitStatus /><CodexRateLimitStatus /></>)
        await act(async () => {
            await Promise.resolve()
        })

        expect(screen.getByText('Claude 30% used')).toBeInTheDocument()
        expect(screen.getByText('Codex 45% used')).toBeInTheDocument()
    })
})
