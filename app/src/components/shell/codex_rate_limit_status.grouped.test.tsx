import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    setCodexRuntimeBridgeOverride,
    type CodexRateLimitSnapshot,
    type ElectronCodexRuntimeBridge,
} from '../../data/electron_codex_runtime_bridge'
import { codexRateLimitService } from '../../services/agents/codex_rate_limit_service'
import { CodexRateLimitStatus } from './codex_rate_limit_status'

function snapshot(
    buckets: CodexRateLimitSnapshot['buckets'],
    available = true,
    observedAt = Date.now(),
): CodexRateLimitSnapshot {
    return { available, buckets, observedAt, rateLimitResetCredits: null }
}

function bucket(
    limitId: string,
    usedPercent: number,
    overrides: Partial<CodexRateLimitSnapshot['buckets'][number]> = {},
): CodexRateLimitSnapshot['buckets'][number] {
    return {
        credits: null,
        individualLimit: null,
        limitId,
        limitName: limitId,
        planType: 'plus',
        primary: {
            resetsAt: Math.floor(Date.now() / 1000) + 3600,
            usedPercent,
            windowDurationMins: 300,
        },
        rateLimitReachedType: null,
        secondary: null,
        ...overrides,
    }
}

function runtimeBridge(initialSnapshot: CodexRateLimitSnapshot | null) {
    let listener: ((value: CodexRateLimitSnapshot) => void) | null = null
    const bridge: ElectronCodexRuntimeBridge = {
        getCodexRateLimits: vi.fn(async () => initialSnapshot),
        onCodexRateLimits: vi.fn((callback) => {
            listener = callback

            return vi.fn()
        }),
        onCodexUpdateRequired: vi.fn(() => vi.fn()),
        updateCodexCli: vi.fn(async () => undefined),
    }

    return {
        bridge,
        emit: (value: CodexRateLimitSnapshot) => listener?.(value),
    }
}

async function renderStatus(initialSnapshot: CodexRateLimitSnapshot | null, mobile = false) {
    const runtime = runtimeBridge(initialSnapshot)
    setCodexRuntimeBridgeOverride(runtime.bridge)
    codexRateLimitService.start()
    render(<CodexRateLimitStatus mobile={mobile} />)
    await act(async () => {
        await Promise.resolve()
    })

    return runtime
}

describe('CodexRateLimitStatus', () => {
    afterEach(() => {
        cleanup()
        codexRateLimitService.stop()
        setCodexRuntimeBridgeOverride(null)
        vi.useRealTimers()
    })

    it('stays hidden before data and for unavailable API-key state', async () => {
        const runtime = await renderStatus(null)
        expect(screen.queryByText(/Codex \d/u)).not.toBeInTheDocument()

        act(() => {
            runtime.emit(snapshot([], false))
        })

        expect(screen.queryByText(/Codex \d/u)).not.toBeInTheDocument()
        expect(screen.queryByText('Codex 0% used')).not.toBeInTheDocument()
    })

    it('shows one bucket with used wording, window duration, and local reset time', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-07-28T10:00:00.000Z'))
        const resetsAt = Math.floor(Date.now() / 1000) + 3600
        await renderStatus(snapshot([bucket('Codex', 42, {primary: { resetsAt, usedPercent: 42, windowDurationMins: 300 }})]))

        const button = screen.getByRole('button', { name: 'Codex usage 42% used' })
        fireEvent.click(button)
        const expectedResetTime = new Date(resetsAt * 1000).toLocaleString([], {
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
        })

        expect(screen.getByText('Codex 42% used')).toBeInTheDocument()
        expect(screen.getByText(new RegExp(`Primary: 42% used · 5 hours · Resets ${expectedResetTime}`, 'u'))).toBeInTheDocument()
        expect(screen.queryByText(/remaining/iu)).not.toBeInTheDocument()
    })

    it('lists every named bucket and both reset windows', async () => {
        const secondary = {
            resetsAt: Math.floor(Date.now() / 1000) + 7200,
            usedPercent: 65,
            windowDurationMins: 10080,
        }
        await renderStatus(snapshot([
            bucket('Fast', 25, { limitName: 'Fast model' }),
            bucket('General', 55, { limitName: 'General model', secondary }),
        ]))

        fireEvent.click(screen.getByRole('button', { name: 'Codex usage 65% used' }))

        expect(screen.getByText('Fast model')).toBeInTheDocument()
        expect(screen.getByText('General model')).toBeInTheDocument()
        expect(screen.getByText(/Secondary: 65% used · 7 days/u)).toBeInTheDocument()
    })

    it('announces warning and reached states accessibly', async () => {
        const runtime = await renderStatus(snapshot([bucket('Codex', 85)]))
        expect(screen.getByRole('button', { name: 'Codex usage 85% used, near limit' })).toBeInTheDocument()

        act(() => {
            runtime.emit(snapshot([bucket('Codex', 100, { rateLimitReachedType: 'hard' })]))
        })
        const reachedButton = screen.getByRole('button', { name: 'Codex usage 100% used, limit reached' })
        fireEvent.click(reachedButton)

        expect(screen.getByRole('status')).toHaveTextContent('Codex limit reached')
    })

    it('opens details through keyboard-style button activation', async () => {
        await renderStatus(snapshot([bucket('Codex', 20)]))
        const button = screen.getByRole('button', { name: 'Codex usage 20% used' })

        button.focus()
        expect(button).toHaveFocus()
        fireEvent.click(button, { detail: 0 })

        expect(screen.getByRole('heading', { name: 'Codex account limits' })).toBeInTheDocument()
    })

    it('opens shared details in a mobile dialog', async () => {
        await renderStatus(snapshot([bucket('Codex', 20)]), true)

        fireEvent.click(screen.getByRole('button', { name: 'Codex usage 20% used' }))

        expect(screen.getByRole('dialog', { name: 'Codex account limits' })).toBeInTheDocument()
    })

    it('uses receipt time when formatting a reset reported by a skewed remote clock', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-07-28T10:00:00.000Z'))
        const remoteObservedAt = Date.parse('2026-07-28T12:00:00.000Z')
        const remoteResetTime = Date.parse('2026-07-28T13:00:00.000Z') / 1000
        await renderStatus(snapshot([
            bucket('Codex', 20, {primary: { resetsAt: remoteResetTime, usedPercent: 20, windowDurationMins: 300 }}),
        ], true, remoteObservedAt))

        fireEvent.click(screen.getByRole('button', { name: 'Codex usage 20% used' }))
        const localResetTime = new Date('2026-07-28T11:00:00.000Z').toLocaleString([], {
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
        })

        expect(screen.getByText(new RegExp(`Resets ${localResetTime} \\(60 min\\)`, 'u'))).toBeInTheDocument()
    })
})
