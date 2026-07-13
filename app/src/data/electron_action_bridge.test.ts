import { afterEach, describe, expect, it, vi } from 'vitest'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from './electron_action_bridge'

function createBridge(): ElectronActionBridge {
    return {
        cancelActionExecution: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: 'commit-1', files: [] })),
        openInEditor: vi.fn(),
        loadActionRunHistory: vi.fn(async () => []),
        onActionExecution: vi.fn(() => () => {}),
        runSearchRegexpAgent: vi.fn(async () => ''),
        sendActionInput: vi.fn(async () => {}),
        startAction: vi.fn(async () => 'action-1'),
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
