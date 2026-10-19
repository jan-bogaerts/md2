import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeBridgeError } from '../../../shared/bridge_errors.mjs'
import { getElectronClaudeRuntimeBridge, type ClaudeRateLimitSnapshot } from './electron_claude_runtime_bridge'
import { getElectronCodexRuntimeBridge, type CodexRateLimitSnapshot } from './electron_codex_runtime_bridge'

function bridgeErrorEnvelope<T>(message: string) {
    return serializeBridgeError(new Error(message)) as unknown as T
}

describe('getElectronCodexRuntimeBridge', () => {
    afterEach(() => {
        delete window.md2CodexRuntime
    })

    it('rejects with the carried error when the main process resolves a bridge error envelope', async () => {
        const envelope = bridgeErrorEnvelope<CodexRateLimitSnapshot>('Codex runtime is not available')
        window.md2CodexRuntime = { getCodexRateLimits: vi.fn(async () => envelope), onCodexRateLimits: vi.fn(() => () => {}) }

        await expect(getElectronCodexRuntimeBridge()?.getCodexRateLimits()).rejects.toThrow('Codex runtime is not available')
    })

    it('keeps one stable bridge identity across lookups', () => {
        window.md2CodexRuntime = { getCodexRateLimits: vi.fn(async () => null), onCodexRateLimits: vi.fn(() => () => {}) }

        expect(getElectronCodexRuntimeBridge()).toBe(getElectronCodexRuntimeBridge())
    })
})

describe('getElectronClaudeRuntimeBridge', () => {
    afterEach(() => {
        delete window.md2ClaudeRuntime
    })

    it('rejects with the carried error when the main process resolves a bridge error envelope', async () => {
        const envelope = bridgeErrorEnvelope<ClaudeRateLimitSnapshot>('Claude runtime is not available')
        window.md2ClaudeRuntime = { getClaudeRateLimits: vi.fn(async () => envelope), onClaudeRateLimits: vi.fn(() => () => {}) }

        await expect(getElectronClaudeRuntimeBridge()?.getClaudeRateLimits()).rejects.toThrow('Claude runtime is not available')
    })

    it('passes ordinary results through unchanged', async () => {
        const snapshot = { available: true, observedAt: 1, windows: [] }
        window.md2ClaudeRuntime = { getClaudeRateLimits: vi.fn(async () => snapshot), onClaudeRateLimits: vi.fn(() => () => {}) }

        await expect(getElectronClaudeRuntimeBridge()?.getClaudeRateLimits()).resolves.toEqual(snapshot)
    })
})
