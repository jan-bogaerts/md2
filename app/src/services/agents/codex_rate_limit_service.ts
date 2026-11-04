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

/** Scoped change event of the Codex rate limits of one agent account. */
export function codexRateLimitsChangedEvent(accountId: string) {
    return `changed:${accountId}`
}

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
    return typeof snapshot.accountId === 'string'
        && snapshot.accountId.length > 0
        && Number.isFinite(snapshot.observedAt)
        && (!snapshot.available || snapshot.buckets.length > 0)
        && snapshot.buckets.every(({ primary, secondary }) => (
            (!primary || Number.isFinite(primary.usedPercent))
            && (!secondary || Number.isFinite(secondary.usedPercent))
        ))
}

/** Owns the current Codex rate limits of each agent account for this renderer process only. */
export class CodexRateLimitService extends EventTarget {
    private bridge: ElectronCodexRuntimeBridge | null = null
    private readonly expirationTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly requestedAccountIds = new Set<string>()
    private readonly states = new Map<string, CodexRateLimitState>()
    private unsubscribeConnection: (() => void) | null = null
    private unsubscribeRateLimits: (() => void) | null = null

    constructor() {
        super()
        register('codexRateLimitService', this)
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
        const bridge = getElectronCodexRuntimeBridge()
        if (bridge === this.bridge && this.unsubscribeRateLimits) return

        this.unsubscribe()
        this.bridge = bridge
        this.clearStates()
        if (!bridge) return

        this.unsubscribeRateLimits = bridge.onCodexRateLimits((snapshot) => this.acceptSnapshot(bridge, snapshot))
        this.unsubscribeConnection = bridge.onConnectionChanged?.((connected) => this.handleConnectionChange(bridge, connected)) ?? null
        this.refreshRequested(bridge)
    }

    stop() {
        this.unsubscribe()
        this.bridge = null
        this.clearStates()
    }

    private acceptSnapshot(bridge: ElectronCodexRuntimeBridge, snapshot: CodexRateLimitSnapshot) {
        if (bridge !== this.bridge || !validSnapshot(snapshot)) return
        const { accountId } = snapshot
        const currentObservedAt = this.states.get(accountId)?.snapshot?.observedAt
        if (currentObservedAt !== undefined && snapshot.observedAt < currentObservedAt) return

        const receivedAt = Date.now()
        this.setState(accountId, { receivedAt, snapshot, stale: false })
        this.scheduleExpiration(accountId, snapshot, receivedAt)
    }

    private refreshRequested(bridge: ElectronCodexRuntimeBridge) {
        for (const accountId of this.requestedAccountIds) void this.refresh(bridge, accountId)
    }

    private async refresh(bridge: ElectronCodexRuntimeBridge, accountId: string) {
        try {
            const snapshot = await bridge.getCodexRateLimits(accountId)
            if (snapshot) this.acceptSnapshot(bridge, snapshot)
        } catch {
            if (bridge === this.bridge) this.markStale(accountId)
        }
    }

    private handleConnectionChange(bridge: ElectronCodexRuntimeBridge, connected: boolean) {
        if (bridge !== this.bridge) return
        if (!connected) {
            for (const accountId of this.states.keys()) this.markStale(accountId)
            return
        }

        this.refreshRequested(bridge)
    }

    private scheduleExpiration(accountId: string, snapshot: CodexRateLimitSnapshot, receivedAt: number) {
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

    private setState(accountId: string, state: CodexRateLimitState) {
        const current = this.getState(accountId)
        if (
            state.receivedAt === current.receivedAt
            && state.snapshot === current.snapshot
            && state.stale === current.stale
        ) return

        this.states.set(accountId, state)
        this.dispatchEvent(new CustomEvent(codexRateLimitsChangedEvent(accountId)))
    }
}

export const codexRateLimitService = new CodexRateLimitService()
