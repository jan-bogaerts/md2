export type ClaudeRateLimitWindowId = 'five_hour' | 'weekly'

export interface ClaudeRateLimitWindow {
    id: ClaudeRateLimitWindowId
    resetsAt: number
    usedPercent: number
}

export interface ClaudeRateLimitSnapshot {
    available: boolean
    observedAt: number
    windows: ClaudeRateLimitWindow[]
}

export interface ElectronClaudeRuntimeBridge {
    getClaudeRateLimits(): Promise<ClaudeRateLimitSnapshot | null>
    onClaudeRateLimits(callback: (snapshot: ClaudeRateLimitSnapshot) => void): () => void
    onConnectionChanged?(callback: (connected: boolean) => void): () => void
}

declare global {
    interface Window {
        md2ClaudeRuntime?: ElectronClaudeRuntimeBridge
    }
}

let claudeRuntimeBridgeOverride: ElectronClaudeRuntimeBridge | null = null

export function setClaudeRuntimeBridgeOverride(bridge: ElectronClaudeRuntimeBridge | null) {
    claudeRuntimeBridgeOverride = bridge
}

export function getElectronClaudeRuntimeBridge() {
    if (claudeRuntimeBridgeOverride) return claudeRuntimeBridgeOverride

    return window.md2ClaudeRuntime ?? null
}
