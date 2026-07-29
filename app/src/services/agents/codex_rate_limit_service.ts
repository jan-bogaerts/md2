import {
    getElectronCodexRuntimeBridge,
    type CodexRateLimitSnapshot,
    type ElectronCodexRuntimeBridge,
} from '../../data/electron_codex_runtime_bridge'
import { register } from '../service_injector'

export interface CodexRateLimitState {
    receivedAt: number | null
    snapshot: CodexRateLimitSnapshot | null
    stale: boolean
}

const INITIAL_STATE: CodexRateLimitState = { receivedAt: null, snapshot: null, stale: false }
const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000

function resetTimeMilliseconds(resetTime: number) {
    return resetTime < UNIX_MILLISECONDS_THRESHOLD ? resetTime * 1000 : resetTime
}

function firstResetTime(snapshot: CodexRateLimitSnapshot) {
    const resetTimes = snapshot.buckets.flatMap(({ primary, secondary }) => (
        [primary?.resetsAt, secondary?.resetsAt]
            .filter((resetTime): resetTime is number => resetTime !== null && resetTime !== undefined)
            .map(resetTimeMilliseconds)
    ))

    return resetTimes.length > 0 ? Math.min(...resetTimes) : null
}

function validSnapshot(snapshot: CodexRateLimitSnapshot) {
    return Number.isFinite(snapshot.observedAt)
        && (!snapshot.available || snapshot.buckets.length > 0)
        && snapshot.buckets.every(({ primary, secondary }) => (
            (!primary || Number.isFinite(primary.usedPercent))
            && (!secondary || Number.isFinite(secondary.usedPercent))
        ))
}

/** Owns current account-wide Codex rate limits for this renderer process only. */
export class CodexRateLimitService extends EventTarget {
    private bridge: ElectronCodexRuntimeBridge | null = null
    private expirationTimer: ReturnType<typeof setTimeout> | null = null
    private state: CodexRateLimitState = INITIAL_STATE
    private unsubscribeConnection: (() => void) | null = null
    private unsubscribeRateLimits: (() => void) | null = null

    constructor() {
        super()
        register('codexRateLimitService', this)
    }

    getState() {
        return this.state
    }

    start() {
        const bridge = getElectronCodexRuntimeBridge()
        if (bridge === this.bridge && this.unsubscribeRateLimits) return

        this.unsubscribe()
        this.bridge = bridge
        this.setState(INITIAL_STATE)
        if (!bridge) return

        this.unsubscribeRateLimits = bridge.onCodexRateLimits((snapshot) => this.acceptSnapshot(bridge, snapshot))
        this.unsubscribeConnection = bridge.onConnectionChanged?.((connected) => this.handleConnectionChange(bridge, connected)) ?? null
        void this.refresh(bridge)
    }

    stop() {
        this.unsubscribe()
        this.bridge = null
        this.setState(INITIAL_STATE)
    }

    private acceptSnapshot(bridge: ElectronCodexRuntimeBridge, snapshot: CodexRateLimitSnapshot) {
        if (bridge !== this.bridge || !validSnapshot(snapshot)) return
        const currentObservedAt = this.state.snapshot?.observedAt
        if (currentObservedAt !== undefined && snapshot.observedAt < currentObservedAt) return

        const receivedAt = Date.now()
        this.setState({ receivedAt, snapshot, stale: false })
        this.scheduleExpiration(snapshot, receivedAt)
    }

    private async refresh(bridge: ElectronCodexRuntimeBridge) {
        try {
            const snapshot = await bridge.getCodexRateLimits()
            if (snapshot) this.acceptSnapshot(bridge, snapshot)
        } catch {
            if (bridge === this.bridge) this.markStale()
        }
    }

    private handleConnectionChange(bridge: ElectronCodexRuntimeBridge, connected: boolean) {
        if (bridge !== this.bridge) return
        if (!connected) {
            this.markStale()
            return
        }

        void this.refresh(bridge)
    }

    private scheduleExpiration(snapshot: CodexRateLimitSnapshot, receivedAt: number) {
        if (this.expirationTimer) clearTimeout(this.expirationTimer)
        this.expirationTimer = null
        if (!snapshot.available) return
        const resetTime = firstResetTime(snapshot)
        if (resetTime === null) return
        const localResetTime = receivedAt + resetTime - snapshot.observedAt
        const delay = Math.max(0, localResetTime - Date.now())
        if (delay === 0) {
            this.markStale()
            return
        }
        this.expirationTimer = setTimeout(() => this.markStale(), delay)
    }

    private markStale() {
        if (!this.state.snapshot || this.state.stale) return

        this.setState({ ...this.state, stale: true })
    }

    private unsubscribe() {
        this.unsubscribeRateLimits?.()
        this.unsubscribeConnection?.()
        this.unsubscribeRateLimits = null
        this.unsubscribeConnection = null
        if (this.expirationTimer) clearTimeout(this.expirationTimer)
        this.expirationTimer = null
    }

    private setState(state: CodexRateLimitState) {
        if (
            state.receivedAt === this.state.receivedAt
            && state.snapshot === this.state.snapshot
            && state.stale === this.state.stale
        ) return

        this.state = state
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

export const codexRateLimitService = new CodexRateLimitService()
