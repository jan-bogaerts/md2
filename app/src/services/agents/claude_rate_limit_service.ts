import {
    getElectronClaudeRuntimeBridge,
    type ClaudeRateLimitSnapshot,
    type ElectronClaudeRuntimeBridge,
} from '../../data/electron_claude_runtime_bridge'
import { register } from '../service_injector'

export interface ClaudeRateLimitState {
    receivedAt: number | null
    snapshot: ClaudeRateLimitSnapshot | null
    stale: boolean
}

const INITIAL_STATE: ClaudeRateLimitState = { receivedAt: null, snapshot: null, stale: false }
const WINDOW_IDS = new Set(['five_hour', 'weekly'])

function firstResetTime(snapshot: ClaudeRateLimitSnapshot) {
    return snapshot.windows.length > 0 ? Math.min(...snapshot.windows.map(({ resetsAt }) => resetsAt)) : null
}

function validSnapshot(snapshot: ClaudeRateLimitSnapshot) {
    if (!Number.isFinite(snapshot.observedAt)) return false
    if (!snapshot.available) return snapshot.windows.length === 0
    if (snapshot.windows.length !== WINDOW_IDS.size) return false
    if (new Set(snapshot.windows.map(({ id }) => id)).size !== WINDOW_IDS.size) return false

    return snapshot.windows.every(({ id, resetsAt, usedPercent }) => (
        WINDOW_IDS.has(id)
            && Number.isFinite(resetsAt)
            && Number.isInteger(usedPercent)
            && usedPercent >= 0
            && usedPercent <= 100
    ))
}

/** Owns current account-wide Claude rate limits for this renderer process only. */
export class ClaudeRateLimitService extends EventTarget {
    private bridge: ElectronClaudeRuntimeBridge | null = null
    private expirationTimer: ReturnType<typeof setTimeout> | null = null
    private state: ClaudeRateLimitState = INITIAL_STATE
    private unsubscribeConnection: (() => void) | null = null
    private unsubscribeRateLimits: (() => void) | null = null

    constructor() {
        super()
        register('claudeRateLimitService', this)
    }

    getState() {
        return this.state
    }

    start() {
        const bridge = getElectronClaudeRuntimeBridge()
        if (bridge === this.bridge && this.unsubscribeRateLimits) return

        this.unsubscribe()
        this.bridge = bridge
        this.setState(INITIAL_STATE)
        if (!bridge) return

        this.unsubscribeRateLimits = bridge.onClaudeRateLimits((snapshot) => this.acceptSnapshot(bridge, snapshot))
        this.unsubscribeConnection = bridge.onConnectionChanged?.((connected) => this.handleConnectionChange(bridge, connected)) ?? null
        void this.refresh(bridge)
    }

    stop() {
        this.unsubscribe()
        this.bridge = null
        this.setState(INITIAL_STATE)
    }

    private acceptSnapshot(bridge: ElectronClaudeRuntimeBridge, snapshot: ClaudeRateLimitSnapshot) {
        if (bridge !== this.bridge || !validSnapshot(snapshot)) return
        const currentObservedAt = this.state.snapshot?.observedAt
        if (currentObservedAt !== undefined && snapshot.observedAt < currentObservedAt) return

        const receivedAt = Date.now()
        this.setState({ receivedAt, snapshot, stale: false })
        this.scheduleExpiration(snapshot, receivedAt)
    }

    private async refresh(bridge: ElectronClaudeRuntimeBridge) {
        try {
            const snapshot = await bridge.getClaudeRateLimits()
            if (snapshot) this.acceptSnapshot(bridge, snapshot)
        } catch {
            if (bridge === this.bridge) this.markStale()
        }
    }

    private handleConnectionChange(bridge: ElectronClaudeRuntimeBridge, connected: boolean) {
        if (bridge !== this.bridge) return
        if (!connected) {
            this.markStale()
            return
        }

        void this.refresh(bridge)
    }

    private scheduleExpiration(snapshot: ClaudeRateLimitSnapshot, receivedAt: number) {
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

    private setState(state: ClaudeRateLimitState) {
        if (
            state.receivedAt === this.state.receivedAt
            && state.snapshot === this.state.snapshot
            && state.stale === this.state.stale
        ) return

        this.state = state
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

export const claudeRateLimitService = new ClaudeRateLimitService()
