import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { dataService } from '../data/data_service'
import { projectPersistenceService } from '../project/project_persistence_service'
import { actionExecutionService } from './action_execution_service'
import { cancelElectronAction, runElectronAction } from './electron_action_runner'

const action: ActionDefinition = {
    agent: null,
    appliesTo: null,
    builtin: false,
    command: 'renderer must not send this',
    description: 'Run tests',
    editorState: { phrases: [], selectedTab: 'prompt' },
    icon: null,
    id: 'test',
    label: 'Test',
    model: null,
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    phrases: [],
    prompt: null,
    sourcePath: 'actions/test.json',
    thinkingLevel: null,
    trackFileChanges: false,
    streaming: false,
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
        prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        runSearchRegexpAgent: vi.fn(),
        startAction: vi.fn(async () => {
            const emit = callback as unknown as (event: ActionExecutionEvent) => void
            emit({
                actionId: 'test', command: 'npm test', context, executionId: 'action-1', phase: 'main', rootActionId: 'test',
                status: 'running', type: 'action',
            })
            emit({
                actionId: 'test', context, executionId: 'action-1', phase: 'main', rootActionId: 'test', status: 'running', type: 'update',
                update: { content: 'ok', kind: 'output' },
            })
            emit({
                actionId: 'test', command: 'npm test', context, executionId: 'action-1', phase: 'main', rootActionId: 'test',
                status: 'completed', type: 'action',
            })
            emit({ actionId: 'test', context, executionId: 'action-1', phase: 'main', rootActionId: 'test', status: 'completed', type: 'execution' })

            return 'action-1'
        }),
    }
}

describe('electron action runner client', () => {
    afterEach(() => {
        actionExecutionService.stop()
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('sends only action id, context, and run-specific input and collects phase events', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        const reloadCurrentProjectSnapshot = vi.spyOn(dataService.projectLoading, 'reloadCurrentProjectSnapshot')

        const result = await runElectronAction(action, context, { extraPrompt: 'focus' })

        expect(bridge.startAction).toHaveBeenCalledWith({ actionId: 'test', context, runInput: { extraPrompt: 'focus' } })
        expect(reloadCurrentProjectSnapshot).not.toHaveBeenCalled()
        expect(result).toEqual({
            logs: [{ actionId: 'test', actionName: 'test', command: 'npm test', message: 'test completed', phase: 'main', status: 'completed', stderr: '', stdout: 'ok' }],
            status: 'completed',
        })
    })

    it('flushes pending card edits before starting the action', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        const snapshot = projectPersistenceService.getSnapshot()
        vi.spyOn(projectPersistenceService, 'getSnapshot').mockReturnValue({ ...snapshot, hasPendingSave: true })
        const flush = vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockImplementation(async () => {
            expect(bridge.startAction).not.toHaveBeenCalled()
        })

        await runElectronAction(action, context)

        expect(flush).toHaveBeenCalledTimes(1)
    })

    it('does not flush when no card edits are pending', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        vi.spyOn(projectPersistenceService, 'getSnapshot').mockReturnValue({ hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' })
        const flush = vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockResolvedValue()

        await runElectronAction(action, context)

        expect(flush).not.toHaveBeenCalled()
    })

    it('cancels by Electron execution id', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)

        await cancelElectronAction('action-1')

        expect(bridge.cancelActionExecution).toHaveBeenCalledWith('action-1')
    })

    it('reuses one shared subscription across successful runs', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)

        await runElectronAction(action, context)
        await runElectronAction(action, context)

        expect(bridge.onActionExecution).toHaveBeenCalledTimes(1)
    })
})
