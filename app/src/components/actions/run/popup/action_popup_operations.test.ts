import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { dialogService } from '../../../../services/dialog_service'
import { currentActionPromptDraft, runPopupAction, type ActionPopupOperationInput } from './action_popup_operations'
import { ActionRunInputStore } from '../state/action_run_input_store'

const action = { id: 'stream', label: 'Stream', streaming: true, type: 'agent' } as ActionDefinition
const context: ActionContext = { file: 'design/F-1.md', kind: 'card', worktree: '3' }
const restartAction = vi.hoisted(() => vi.fn())

vi.mock('./action_popup_defaults', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_popup_defaults')>()

    return { ...actual, defaultRestartAction: restartAction }
})

function operationInput(inputStore: ActionRunInputStore): ActionPopupOperationInput {
    return {
        action,
        context,
        conversationStore: {
            continuationPath: () => 'conversation.json',
            load: vi.fn(async () => undefined),
        },
        historyStore: { load: vi.fn(async () => undefined) },
        inputStore,
        resultStore: {
            setResult: vi.fn(),
            setRunId: vi.fn(),
            setRunning: vi.fn(),
        },
        runValidationError: null,
        settings: {
            accessLevel: 'workspace-write',
            agent: 'codex',
            approvalPolicy: 'on-request',
            model: inputStore.getSnapshot().modelOverride ?? 'gpt-5.5',
            thinkingLevel: 'high',
        },
    } as unknown as ActionPopupOperationInput
}

function emitWaitingRun(listener: (event: ActionRunEvent) => void) {
    const eventBase = {
        actionId: action.id,
        actionType: 'agent' as const,
        autoFinish: null,
        context,
        interactionReady: true,
        phase: 'main' as const,
        rootActionId: action.id,
        runId: 'run-1',
        streaming: true,
    }
    listener({ ...eventBase, status: 'running', type: 'run' })
    listener({ ...eventBase, status: 'waitingForInput', type: 'agentState' })
}

describe('runPopupAction waiting follow-up', () => {
    let bridge: ElectronActionBridge

    beforeEach(() => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        bridge = {
            beginActionPromptDraft: vi.fn(async () => 4),
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener
                return vi.fn()
            }),
            sendActionQueuedMessage: vi.fn(async () => ({ sent: true })),
            setActionQueuedMessage: vi.fn(async () => ({ accepted: true })),
        } as unknown as ElectronActionBridge
        setActionBridgeOverride(bridge)
        actionRunRegistry.start()
        if (!listener) throw new Error('Missing action run listener')
        emitWaitingRun(listener)
        restartAction.mockReset()
    })

    afterEach(() => {
        actionRunRegistry.stop()
        actionPromptDraftService.clearAll()
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('sends follow-up through same live process and assigned worktree', async () => {
        const inputStore = new ActionRunInputStore()
        const run = actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot() ?? null
        actionPromptDraftService.getDraft(action.id, context, run, { prepare: false }).edit('Next request')

        await runPopupAction(operationInput(inputStore))

        expect(bridge.sendActionQueuedMessage).toHaveBeenCalledWith('run-1', 4, 1)
        expect(actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot()?.context.worktree).toBe('3')
        expect(restartAction).not.toHaveBeenCalled()
    })

    it('restarts from persisted conversation with changed settings', async () => {
        const inputStore = new ActionRunInputStore()
        inputStore.setModel('gpt-5.6')
        inputStore.recordSettingsChangeWhileWaiting()
        const run = actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot() ?? null
        actionPromptDraftService.getDraft(action.id, context, run, { prepare: false }).edit('Next request')
        restartAction.mockImplementation(async (_runId, _action, _context, _runInput, onStarted) => {
            onStarted('run-2')
            return { logs: [], status: 'completed' }
        })

        await runPopupAction(operationInput(inputStore))

        expect(restartAction).toHaveBeenCalledWith(
            'run-1', action, context,
            expect.objectContaining({ continueFrom: 'conversation.json', model: 'gpt-5.6', prompt: 'Next request' }),
            expect.any(Function),
        )
        expect(bridge.sendActionQueuedMessage).not.toHaveBeenCalled()
        expect(inputStore.getSnapshot().settingsChangedWhileWaiting).toBe(false)
    })

    it('preserves prompt and reports restart failure', async () => {
        const inputStore = new ActionRunInputStore()
        inputStore.recordSettingsChangeWhileWaiting()
        const run = actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot() ?? null
        const draft = actionPromptDraftService.getDraft(action.id, context, run, { prepare: false })
        draft.edit('Keep request')
        restartAction.mockImplementation(async () => {
            actionPromptDraftService.clearRunDrafts('run-1')
            throw new Error('restart failed')
        })
        const reportError = vi.spyOn(dialogService, 'error')

        await runPopupAction(operationInput(inputStore))

        expect(draft.getSnapshot()).toBe('')
        expect(currentActionPromptDraft(action, context, false).getSnapshot()).toBe('Keep request')
        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'restart failed' }),
            { fallbackMessage: 'Action run failed' },
        )
    })
})
