import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    setCodexRuntimeBridgeOverride,
    type CodexRateLimitSnapshot,
    type ElectronCodexRuntimeBridge,
} from '../../data/electron_codex_runtime_bridge'
import { CodexRateLimitService, codexRateLimitsChangedEvent } from './codex_rate_limit_service'

const ACCOUNT_ID = 'codex-initial'
const WORK_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function snapshot(
    observedAt: number,
    usedPercent = 25,
    resetsAt = Math.floor(observedAt / 1000) + 3600,
    accountId = ACCOUNT_ID,
): CodexRateLimitSnapshot {
    return {
        accountId,
        available: true,
        buckets: [{
            credits: null,
            individualLimit: null,
            limitId: 'codex',
            limitName: 'Codex',
            planType: 'plus',
            primary: { resetsAt, usedPercent, windowDurationMins: 300 },
            rateLimitReachedType: null,
            secondary: null,
        }],
        observedAt,
        rateLimitResetCredits: null,
    }
}

function bridge(initialSnapshot: CodexRateLimitSnapshot | null = null) {
    let rateLimitListener: ((value: CodexRateLimitSnapshot) => void) | null = null
    let connectionListener: ((connected: boolean) => void) | null = null
    const value: ElectronCodexRuntimeBridge = {
        getCodexRateLimits: vi.fn(async () => initialSnapshot),
        onCodexRateLimits: vi.fn((listener) => {
            rateLimitListener = listener

            return vi.fn()
        }),
        onCodexUpdateRequired: vi.fn(() => vi.fn()),
        onConnectionChanged: vi.fn((listener) => {
            connectionListener = listener

            return vi.fn()
        }),
        updateCodexCli: vi.fn(async () => undefined),
    }

    return {
        emitConnection: (connected: boolean) => connectionListener?.(connected),
        emitSnapshot: (nextSnapshot: CodexRateLimitSnapshot) => rateLimitListener?.(nextSnapshot),
        value,
    }
}

describe('CodexRateLimitService', () => {
    afterEach(() => {
        setCodexRuntimeBridgeOverride(null)
        vi.useRealTimers()
    })

    it('reads current limits, subscribes, and replaces the runtime snapshot', async () => {
        const initial = snapshot(1, 10)
        const source = bridge(initial)
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()

        service.requestSnapshot(ACCOUNT_ID)

        service.start()
        await vi.waitFor(() => expect(service.getState(ACCOUNT_ID).snapshot).toBe(initial))
        const updated = snapshot(2, 40)
        source.emitSnapshot(updated)

        expect(service.getState(ACCOUNT_ID)).toEqual({ receivedAt: expect.any(Number), snapshot: updated, stale: false })
        expect(source.value.onCodexRateLimits).toHaveBeenCalledOnce()
        service.stop()
    })

    it('keeps the newest observation when read and subscription race', async () => {
        let resolveRead!: (value: CodexRateLimitSnapshot | null) => void
        const source = bridge()
        source.value.getCodexRateLimits = vi.fn(() => new Promise<CodexRateLimitSnapshot | null>((resolve) => {
            resolveRead = resolve
        }))
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        service.requestSnapshot(ACCOUNT_ID)
        service.start()
        const newest = snapshot(20, 60)
        source.emitSnapshot(newest)
        resolveRead(snapshot(10, 20))
        await Promise.resolve()

        expect(service.getState(ACCOUNT_ID).snapshot).toBe(newest)
        service.stop()
    })

    it('marks data stale on disconnect and refreshes on reconnect', async () => {
        const source = bridge(snapshot(1))
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        service.requestSnapshot(ACCOUNT_ID)
        service.start()
        await vi.waitFor(() => expect(service.getState(ACCOUNT_ID).snapshot).not.toBeNull())

        source.emitConnection(false)
        expect(service.getState(ACCOUNT_ID).stale).toBe(true)
        source.emitConnection(true)

        await vi.waitFor(() => expect(source.value.getCodexRateLimits).toHaveBeenCalledTimes(2))
        expect(service.getState(ACCOUNT_ID).stale).toBe(false)
        service.stop()
    })

    it('marks a snapshot stale when its first reset window expires', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-07-28T10:00:00.000Z'))
        const observedAt = Date.now()
        const resetTime = Math.floor(observedAt / 1000) + 60
        const source = bridge(snapshot(observedAt, 25, resetTime))
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        service.requestSnapshot(ACCOUNT_ID)
        service.start()
        await vi.runAllTicks()

        await vi.advanceTimersByTimeAsync(60_000)

        expect(service.getState(ACCOUNT_ID).stale).toBe(true)
        service.stop()
    })

    it('anchors expiration to local receipt time when remote clock differs', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-07-28T10:00:00.000Z'))
        const remoteObservedAt = Date.parse('2026-07-28T12:00:00.000Z')
        const remoteResetTime = Date.parse('2026-07-28T13:00:00.000Z') / 1000
        const source = bridge(snapshot(remoteObservedAt, 25, remoteResetTime))
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        service.requestSnapshot(ACCOUNT_ID)
        service.start()
        await vi.runAllTicks()

        await vi.advanceTimersByTimeAsync(59 * 60_000)
        expect(service.getState(ACCOUNT_ID).stale).toBe(false)
        await vi.advanceTimersByTimeAsync(60_000)
        expect(service.getState(ACCOUNT_ID).stale).toBe(true)
        service.stop()
    })

    it('hides unavailable state and never uses browser persistence', async () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem')
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        const unavailable: CodexRateLimitSnapshot = {
            accountId: ACCOUNT_ID,
            available: false,
            buckets: [],
            observedAt: 1,
            rateLimitResetCredits: null,
        }
        const source = bridge(unavailable)
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        service.requestSnapshot(ACCOUNT_ID)
        service.start()
        await vi.waitFor(() => expect(service.getState(ACCOUNT_ID).snapshot).toBe(unavailable))

        expect(getItem).not.toHaveBeenCalled()
        expect(setItem).not.toHaveBeenCalled()
        getItem.mockRestore()
        setItem.mockRestore()
        service.stop()
    })

    it('keeps account states separate and announces only the changed account', async () => {
        const source = bridge()
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        const initialChanged = vi.fn()
        service.addEventListener(codexRateLimitsChangedEvent(ACCOUNT_ID), initialChanged)
        service.start()
        const initial = snapshot(1, 10)
        source.emitSnapshot(initial)
        initialChanged.mockClear()

        const work = snapshot(2, 90, undefined, WORK_ACCOUNT_ID)
        source.emitSnapshot(work)

        expect(service.getState(ACCOUNT_ID).snapshot).toBe(initial)
        expect(service.getState(WORK_ACCOUNT_ID).snapshot).toBe(work)
        expect(initialChanged).not.toHaveBeenCalled()
        service.stop()
    })

    it('reads a requested account once and refreshes it after reconnecting', async () => {
        const source = bridge(snapshot(1, 10, undefined, WORK_ACCOUNT_ID))
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        service.start()

        service.requestSnapshot(WORK_ACCOUNT_ID)
        await vi.waitFor(() => expect(service.getState(WORK_ACCOUNT_ID).snapshot).not.toBeNull())
        service.requestSnapshot(WORK_ACCOUNT_ID)
        source.emitConnection(false)
        expect(service.getState(WORK_ACCOUNT_ID).stale).toBe(true)
        source.emitConnection(true)

        await vi.waitFor(() => expect(source.value.getCodexRateLimits).toHaveBeenCalledTimes(2))
        expect(source.value.getCodexRateLimits).toHaveBeenCalledWith(WORK_ACCOUNT_ID)
        service.stop()
    })

    it('ignores a snapshot that names no account', () => {
        const source = bridge()
        setCodexRuntimeBridgeOverride(source.value)
        const service = new CodexRateLimitService()
        service.start()

        source.emitSnapshot({ ...snapshot(1), accountId: '' })

        expect(service.getState('')).toEqual({ receivedAt: null, snapshot: null, stale: false })
        service.stop()
    })
})
