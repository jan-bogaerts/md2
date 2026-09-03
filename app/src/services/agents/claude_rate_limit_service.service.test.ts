import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    setClaudeRuntimeBridgeOverride,
    type ClaudeRateLimitSnapshot,
    type ElectronClaudeRuntimeBridge,
} from '../../data/electron_claude_runtime_bridge'
import { ClaudeRateLimitService } from './claude_rate_limit_service'

function snapshot(observedAt: number, fiveHourPercent = 25, firstResetDelayMs = 60_000): ClaudeRateLimitSnapshot {
    return {
        available: true,
        observedAt,
        windows: [
            { id: 'five_hour', resetsAt: observedAt + firstResetDelayMs, usedPercent: fiveHourPercent },
            { id: 'weekly', resetsAt: observedAt + 3_600_000, usedPercent: 40 },
        ],
    }
}

function bridge(initialSnapshot: ClaudeRateLimitSnapshot | null = null) {
    let rateLimitListener: ((value: ClaudeRateLimitSnapshot) => void) | null = null
    let connectionListener: ((connected: boolean) => void) | null = null
    const value: ElectronClaudeRuntimeBridge = {
        getClaudeRateLimits: vi.fn(async () => initialSnapshot),
        onClaudeRateLimits: vi.fn((listener) => {
            rateLimitListener = listener

            return vi.fn()
        }),
        onConnectionChanged: vi.fn((listener) => {
            connectionListener = listener

            return vi.fn()
        }),
    }

    return {
        emitConnection: (connected: boolean) => connectionListener?.(connected),
        emitSnapshot: (nextSnapshot: ClaudeRateLimitSnapshot) => rateLimitListener?.(nextSnapshot),
        value,
    }
}

describe('ClaudeRateLimitService', () => {
    afterEach(() => {
        setClaudeRuntimeBridgeOverride(null)
        vi.useRealTimers()
    })

    it('reads current limits, subscribes, and replaces the runtime snapshot', async () => {
        const initial = snapshot(1, 10)
        const source = bridge(initial)
        setClaudeRuntimeBridgeOverride(source.value)
        const service = new ClaudeRateLimitService()

        service.start()
        await vi.waitFor(() => expect(service.getState().snapshot).toBe(initial))
        const updated = snapshot(2, 50)
        source.emitSnapshot(updated)

        expect(service.getState()).toEqual({ receivedAt: expect.any(Number), snapshot: updated, stale: false })
        service.stop()
    })

    it('keeps newest observation when read and subscription race', async () => {
        let resolveRead!: (value: ClaudeRateLimitSnapshot | null) => void
        const source = bridge()
        source.value.getClaudeRateLimits = vi.fn(() => new Promise<ClaudeRateLimitSnapshot | null>((resolve) => {
            resolveRead = resolve
        }))
        setClaudeRuntimeBridgeOverride(source.value)
        const service = new ClaudeRateLimitService()
        service.start()
        const newest = snapshot(20, 60)
        source.emitSnapshot(newest)
        resolveRead(snapshot(10, 20))
        await Promise.resolve()

        expect(service.getState().snapshot).toBe(newest)
        service.stop()
    })

    it('rejects malformed or partial renderer snapshots', () => {
        const source = bridge()
        setClaudeRuntimeBridgeOverride(source.value)
        const service = new ClaudeRateLimitService()
        service.start()
        const partial = { ...snapshot(10), windows: [snapshot(10).windows[0]] }
        const malformed = {
            ...snapshot(11), windows: [
                { ...snapshot(11).windows[0], usedPercent: 10.5 },
                snapshot(11).windows[1],
            ],
        }

        source.emitSnapshot(partial)
        source.emitSnapshot(malformed)

        expect(service.getState().snapshot).toBeNull()
        service.stop()
    })

    it('marks snapshot stale at earliest reset using receipt-time clock anchoring', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-15T10:00:00.000Z'))
        const remoteObservedAt = Date.parse('2026-08-15T12:00:00.000Z')
        const source = bridge(snapshot(remoteObservedAt, 25, 60_000))
        setClaudeRuntimeBridgeOverride(source.value)
        const service = new ClaudeRateLimitService()
        service.start()
        await vi.runAllTicks()

        await vi.advanceTimersByTimeAsync(59_999)
        expect(service.getState().stale).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        expect(service.getState().stale).toBe(true)
        service.stop()
    })

    it('marks data stale on disconnect and refreshes on reconnect', async () => {
        const source = bridge(snapshot(1))
        setClaudeRuntimeBridgeOverride(source.value)
        const service = new ClaudeRateLimitService()
        service.start()
        await vi.waitFor(() => expect(service.getState().snapshot).not.toBeNull())

        source.emitConnection(false)
        expect(service.getState().stale).toBe(true)
        source.emitConnection(true)

        await vi.waitFor(() => expect(source.value.getClaudeRateLimits).toHaveBeenCalledTimes(2))
        expect(service.getState().stale).toBe(false)
        service.stop()
    })

    it('keeps unavailable state hidden without browser persistence', async () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem')
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        const unavailable: ClaudeRateLimitSnapshot = { available: false, observedAt: 1, windows: [] }
        const source = bridge(unavailable)
        setClaudeRuntimeBridgeOverride(source.value)
        const service = new ClaudeRateLimitService()
        service.start()
        await vi.waitFor(() => expect(service.getState().snapshot).toBe(unavailable))

        expect(getItem).not.toHaveBeenCalled()
        expect(setItem).not.toHaveBeenCalled()
        getItem.mockRestore()
        setItem.mockRestore()
        service.stop()
    })
})
