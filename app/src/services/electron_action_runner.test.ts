import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../data/action_types'
import type { ActionExecutionEvent } from '../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../data/electron_action_bridge'
import { dataService } from './data_service'
import { cancelElectronAction, runElectronAction } from './electron_action_runner'

const action: ActionDefinition = {
    agent: null,
    appliesTo: null,
    builtin: false,
    command: 'renderer must not send this',
    description: 'Run tests',
    icon: null,
    id: 'test',
    label: 'Test',
    model: null,
    name: 'test',
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    prompt: null,
    sourcePath: 'actions/test.json',
    thinkingLevel: null,
    type: 'command',
}
const context = { file: 'design/F-1.md', kind: 'card' as const }

function createBridge(): ElectronActionBridge {
    let callback: ((event: ActionExecutionEvent) => void) | null = null

    return {
        cancelActionExecution: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: '', files: [] })),
        loadActionRunHistory: vi.fn(async () => []),
        onActionExecution: vi.fn((listener) => {
            callback = listener

            return vi.fn()
        }),
        openInEditor: vi.fn(async () => {}),
        runSearchRegexpAgent: vi.fn(),
        sendActionInput: vi.fn(async () => {}),
        startAction: vi.fn(async () => {
            const emit = callback as unknown as (event: ActionExecutionEvent) => void
            emit({
                actionId: 'test', command: 'npm test', executionId: 'action-1', phase: 'main', rootActionId: 'test',
                status: 'completed', stderr: '', stdout: 'ok', type: 'action',
            })
            emit({
                actionId: 'test', executionId: 'action-1', phase: 'main', rootActionId: 'test', status: 'completed', type: 'execution',
            })

            return 'action-1'
        }),
    }
}

describe('electron action runner client', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('sends only action id, context, and run-specific input and collects phase events', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        vi.spyOn(dataService.projectLoading, 'reloadCurrentProjectSnapshot').mockResolvedValue(undefined)

        const result = await runElectronAction(action, context, { extraPrompt: 'focus' })

        expect(bridge.startAction).toHaveBeenCalledWith({ actionId: 'test', context, runInput: { extraPrompt: 'focus' } })
        expect(result).toEqual({
            logs: [{ actionName: 'test', command: 'npm test', message: 'test completed', phase: 'main', status: 'completed', stderr: '', stdout: 'ok' }],
            status: 'completed',
        })
    })

    it('cancels by Electron execution id', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)

        await cancelElectronAction('action-1')

        expect(bridge.cancelActionExecution).toHaveBeenCalledWith('action-1')
    })
})
