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

/** Scoped change event of the Claude rate limits of one agent account. */
export function claudeRateLimitsChangedEvent(accountId: string) {
    return `changed:${accountId}`
}

function firstResetTime(snapshot: ClaudeRateLimitSnapshot) {
    // A window Claude has not started carries no reset time and cannot be the next one to reset.
    const resetTimes = snapshot.windows.map(({ resetsAt }) => resetsAt).filter((resetsAt) => resetsAt !== null)

    return resetTimes.length > 0 ? Math.min(...resetTimes) : null
}

function validSnapshot(snapshot: ClaudeRateLimitSnapshot) {
    if (typeof snapshot.accountId !== 'string' || snapshot.accountId.length === 0) return false
    if (!Number.isFinite(snapshot.observedAt)) return false
    if (!snapshot.available) return snapshot.windows.length === 0
    if (snapshot.windows.length !== WINDOW_IDS.size) return false
    if (new Set(snapshot.windows.map(({ id }) => id)).size !== WINDOW_IDS.size) return false

    return snapshot.windows.every(({ id, resetsAt, usedPercent }) => (
        WINDOW_IDS.has(id)
            && (resetsAt === null || Number.isFinite(resetsAt))
            && Number.isInteger(usedPercent)
            && usedPercent >= 0
            && usedPercent <= 100
    ))
}

/** Owns the current Claude rate limits of each agent account for this renderer process only. */
export class ClaudeRateLimitService extends EventTarget {
    private bridge: ElectronClaudeRuntimeBridge | null = null
    private readonly expirationTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly requestedAccountIds = new Set<string>()
    private readonly states = new Map<string, ClaudeRateLimitState>()
    private unsubscribeConnection: (() => void) | null = null
    private unsubscribeRateLimits: (() => void) | null = null

    constructor() {
        super()
        register('claudeRateLimitService', this)
    }

    getState(accountId: string) {
        return this.states.get(accountId) ?? INITIAL_STATE
    }

    /** Reads the snapshot of an account a consumer displays, unless the host already published it. */
    requestSnapshot(accountId: string) {
        this.requestedAccountIds.add(accountId)
        if (this.bridge && !this.states.has(accountId)) void this.refresh(this.bridge, accountId)
    }

    start() {
        const bridge = getElectronClaudeRuntimeBridge()
        if (bridge === this.bridge && this.unsubscribeRateLimits) return

        this.unsubscribe()
        this.bridge = bridge
        this.clearStates()
        if (!bridge) return

        this.unsubscribeRateLimits = bridge.onClaudeRateLimits((snapshot) => this.acceptSnapshot(bridge, snapshot))
        this.unsubscribeConnection = bridge.onConnectionChanged?.((connected) => this.handleConnectionChange(bridge, connected)) ?? null
        this.refreshRequested(bridge)
    }

    stop() {
        this.unsubscribe()
        this.bridge = null
        this.clearStates()
    }

    private acceptSnapshot(bridge: ElectronClaudeRuntimeBridge, snapshot: ClaudeRateLimitSnapshot) {
        if (bridge !== this.bridge || !validSnapshot(snapshot)) return
        const { accountId } = snapshot
        const currentObservedAt = this.states.get(accountId)?.snapshot?.observedAt
        if (currentObservedAt !== undefined && snapshot.observedAt < currentObservedAt) return

        const receivedAt = Date.now()
        this.setState(accountId, { receivedAt, snapshot, stale: false })
        this.scheduleExpiration(accountId, snapshot, receivedAt)
    }

    private refreshRequested(bridge: ElectronClaudeRuntimeBridge) {
        for (const accountId of this.requestedAccountIds) void this.refresh(bridge, accountId)
    }

    private async refresh(bridge: ElectronClaudeRuntimeBridge, accountId: string) {
        try {
            const snapshot = await bridge.getClaudeRateLimits(accountId)
            if (snapshot) this.acceptSnapshot(bridge, snapshot)
        } catch {
            if (bridge === this.bridge) this.markStale(accountId)
        }
    }

    private handleConnectionChange(bridge: ElectronClaudeRuntimeBridge, connected: boolean) {
        if (bridge !== this.bridge) return
        if (!connected) {
            for (const accountId of this.states.keys()) this.markStale(accountId)
            return
        }

        this.refreshRequested(bridge)
    }

    private scheduleExpiration(accountId: string, snapshot: ClaudeRateLimitSnapshot, receivedAt: number) {
        this.clearExpiration(accountId)
        if (!snapshot.available) return
        const resetTime = firstResetTime(snapshot)
        if (resetTime === null) return
        const localResetTime = receivedAt + resetTime - snapshot.observedAt
        const delay = Math.max(0, localResetTime - Date.now())
        if (delay === 0) {
            this.markStale(accountId)
            return
        }
        this.expirationTimers.set(accountId, setTimeout(() => this.markStale(accountId), delay))
    }

    private clearExpiration(accountId: string) {
        const timer = this.expirationTimers.get(accountId)
        if (timer) clearTimeout(timer)
        this.expirationTimers.delete(accountId)
    }

    private markStale(accountId: string) {
        const state = this.getState(accountId)
        if (!state.snapshot || state.stale) return

        this.setState(accountId, { ...state, stale: true })
    }

    private unsubscribe() {
        this.unsubscribeRateLimits?.()
        this.unsubscribeConnection?.()
        this.unsubscribeRateLimits = null
        this.unsubscribeConnection = null
    }

    /** Drops every account state, announcing only accounts that had one. */
    private clearStates() {
        for (const accountId of [...this.states.keys()]) {
            this.clearExpiration(accountId)
            this.setState(accountId, INITIAL_STATE)
        }
        this.states.clear()
    }

    private setState(accountId: string, state: ClaudeRateLimitState) {
        const current = this.getState(accountId)
        if (
            state.receivedAt === current.receivedAt
            && state.snapshot === current.snapshot
            && state.stale === current.stale
        ) return

        this.states.set(accountId, state)
        this.dispatchEvent(new CustomEvent(claudeRateLimitsChangedEvent(accountId)))
    }
}

export const claudeRateLimitService = new ClaudeRateLimitService()
