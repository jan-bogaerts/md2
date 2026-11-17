import { afterEach, describe, expect, it, vi } from 'vitest'
import { MISSING_THIS_CARD_CONTEXT_ERROR } from '../../../shared/action_errors.mjs'
import { serializeBridgeError } from '../../../shared/bridge_errors.mjs'
import type { PreparedActionPrompt } from './action_run_types'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from './electron_action_bridge'

const ACTION_CONTEXT = { kind: 'project' as const }

function createBridge(): ElectronActionBridge {
    return {
        cancelActionRun: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: 'commit-1', files: [], patch: '' })),
        generateWorktreeDiff: vi.fn(async () => ({ files: [], patch: '', repositoryRoot: 'C:/worktree', revision: 'worktree-1' })),
        openInEditor: vi.fn(),
        loadActionRunHistory: vi.fn(async () => []),
        onActionRun: vi.fn(() => () => {}),
        prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        runSearchRegexpAgent: vi.fn(async () => ''),
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

    it('routes calls to the preload bridge when no override is set', async () => {
        const preloadBridge = createBridge()
        window.md2Actions = preloadBridge
        const request = { actionId: 'main', context: ACTION_CONTEXT }

        await expect(getElectronActionBridge()?.prepareActionPrompt(request)).resolves.toEqual({ prompt: '' })
        expect(preloadBridge.prepareActionPrompt).toHaveBeenCalledWith(request)
    })

    it('keeps one stable bridge identity across lookups', () => {
        window.md2Actions = createBridge()

        expect(getElectronActionBridge()).toBe(getElectronActionBridge())
    })

    it('rejects with the carried error when the main process resolves a bridge error envelope', async () => {
        const preloadBridge = createBridge()
        const envelope = serializeBridgeError(new Error('Action runner is not available')) as unknown as PreparedActionPrompt
        preloadBridge.prepareActionPrompt = vi.fn(async () => envelope)
        window.md2Actions = preloadBridge

        await expect(getElectronActionBridge()?.prepareActionPrompt({ actionId: 'main', context: ACTION_CONTEXT }))
            .rejects.toThrow('Action runner is not available')
    })

    it('preserves the missing this-card context code from the main process', async () => {
        const preloadBridge = createBridge()
        const mainError = new Error('Missing card context') as Error & { code: string }
        mainError.code = MISSING_THIS_CARD_CONTEXT_ERROR
        preloadBridge.prepareActionPrompt = vi.fn(async () => (
            serializeBridgeError(mainError) as unknown as PreparedActionPrompt
        ))
        window.md2Actions = preloadBridge

        const error = await getElectronActionBridge()
            ?.prepareActionPrompt({ actionId: 'main', context: ACTION_CONTEXT })
            .catch((failure: unknown) => failure) as Error & { code?: string }

        expect(error.message).toBe('Missing card context')
        expect(error.code).toBe(MISSING_THIS_CARD_CONTEXT_ERROR)
    })

    it('returns the override before the preload bridge', () => {
        const preloadBridge = createBridge()
        const overrideBridge = createBridge()
        window.md2Actions = preloadBridge
        setActionBridgeOverride(overrideBridge)

        expect(getElectronActionBridge()).toBe(overrideBridge)
    })
})
