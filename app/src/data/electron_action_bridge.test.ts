import { afterEach, describe, expect, it, vi } from 'vitest'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from './electron_action_bridge'

function createBridge(): ElectronActionBridge {
    return {
        appendActionRunHistory: vi.fn(async () => []),
        generateDiff: vi.fn(async () => ({ commit: 'commit-1', files: [] })),
        openInEditor: vi.fn(),
        loadActionRunHistory: vi.fn(async () => []),
        runAgent: vi.fn(async () => ({
            command: 'agent',
            conversation: {
                cardPath: 'design/F-1.md',
                completedAt: '2026-01-01T00:00:00.000Z',
                continuedFrom: null,
                events: [],
                id: 'run-1',
                messages: [],
                nativeSessionId: null,
                path: '.md2-agent-logs/run-1.json',
                startedAt: '2026-01-01T00:00:00.000Z',
                status: 'completed',
                title: 'Run',
            },
            exitCode: 0,
            prompt: 'run',
            reference: '.md2-agent-logs/run-1.json',
            runId: 'run-1',
            stderr: '',
            stdout: '',
        })),
        runCommand: vi.fn(async () => ({ command: 'npm test', exitCode: 0, stderr: '', stdout: 'ok' })),
    }
}

describe('getElectronActionBridge', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        delete window.md2Actions
    })

    it('returns null when no bridge is available', () => {
        expect(getElectronActionBridge()).toBeNull()
    })

    it('returns the preload bridge when no override is set', () => {
        const preloadBridge = createBridge()
        window.md2Actions = preloadBridge

        expect(getElectronActionBridge()).toBe(preloadBridge)
    })

    it('returns the override before the preload bridge', () => {
        const preloadBridge = createBridge()
        const overrideBridge = createBridge()
        window.md2Actions = preloadBridge
        setActionBridgeOverride(overrideBridge)

        expect(getElectronActionBridge()).toBe(overrideBridge)
    })
})
