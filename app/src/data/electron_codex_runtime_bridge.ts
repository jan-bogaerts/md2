export interface CodexRateLimitWindow {
    resetsAt: number | null
    usedPercent: number
    windowDurationMins: number | null
}

export interface CodexCreditsSnapshot {
    balance: string | null
    hasCredits: boolean
    unlimited: boolean
}

export interface CodexIndividualLimitSnapshot {
    limit: string
    remainingPercent: number
    resetsAt: number
    used: string
}

export interface CodexRateLimitBucket {
    credits: CodexCreditsSnapshot | null
    individualLimit: CodexIndividualLimitSnapshot | null
    limitId: string
    limitName: string | null
    planType: string | null
    primary: CodexRateLimitWindow | null
    rateLimitReachedType: string | null
    secondary: CodexRateLimitWindow | null
}

export interface CodexRateLimitResetCredit {
    description: string | null
    expiresAt: number | null
    grantedAt: number
    id: string
    resetType: string
    status: string
    title: string | null
}

export interface CodexRateLimitResetCreditsSummary {
    availableCount: number
    credits: CodexRateLimitResetCredit[] | null
}

export interface CodexRateLimitSnapshot {
    available: boolean
    buckets: CodexRateLimitBucket[]
    observedAt: number
    rateLimitResetCredits: CodexRateLimitResetCreditsSummary | null
}

export interface CodexUpdateRequired {
    cacheVersion: string
    runningVersion: string
}

export interface ElectronCodexRuntimeBridge {
    getCodexRateLimits(): Promise<CodexRateLimitSnapshot | null>
    onConnectionChanged?(callback: (connected: boolean) => void): () => void
    onCodexRateLimits(callback: (snapshot: CodexRateLimitSnapshot) => void): () => void
    onCodexUpdateRequired?(callback: (update: CodexUpdateRequired) => void): () => void
    updateCodexCli?(): Promise<void>
}

declare global {
    interface Window {
        md2CodexRuntime?: ElectronCodexRuntimeBridge
    }
}

let codexRuntimeBridgeOverride: ElectronCodexRuntimeBridge | null = null

export function setCodexRuntimeBridgeOverride(bridge: ElectronCodexRuntimeBridge | null) {
    codexRuntimeBridgeOverride = bridge
}

export function getElectronCodexRuntimeBridge() {
    if (codexRuntimeBridgeOverride) return codexRuntimeBridgeOverride

    return window.md2CodexRuntime ?? null
}
