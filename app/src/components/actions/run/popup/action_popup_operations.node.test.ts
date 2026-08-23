import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import type { AgentConversation } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { projectAgentSelection, selectModel, type AgentSelectionState } from '../../../../data/agent_selection'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { ActionRunSettingsStore, type ResolvedActionRunSettings } from '../../../../services/actions/action_run_settings_service'
import { dialogService } from '../../../../services/dialog_service'
import {
    cancelPopupAction,
    currentActionPromptDraft,
    finishPopupAction,
    runPopupAction,
    type ActionPopupOperationInput,
} from './action_popup_operations'
import { ActionRunInputStore } from '../state/action_run_input_store'

const action = { id: 'stream', label: 'Stream', streaming: true, type: 'agent' } as ActionDefinition
const context: ActionContext = { file: 'design/F-1.md', kind: 'card', worktree: '3' }
const restartAction = vi.hoisted(() => vi.fn())

function deferred<T>() {
    let resolvePromise: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => { resolvePromise = resolve })

    return { promise, resolve: resolvePromise }
}

vi.mock('./action_popup_defaults', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_popup_defaults')>()

    return { ...actual, defaultRestartAction: restartAction }
})

const defaultSettings: ResolvedActionRunSettings = {agent: 'codex', model: 'gpt-5.5', permissionMode: 'ask-for-approval', thinkingLevel: 'high'}
const defaultSelection: AgentSelectionState = {activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: {codex: {model: 'gpt-5.5', thinkingLevel: 'high'}}}

function operationInput(
    inputStore: ActionRunInputStore,
    settingsStore = new ActionRunSettingsStore(action.id, null),
    conversationStore: Pick<ActionPopupOperationInput['conversationStore'], 'continuationPath' | 'getSnapshot' | 'load'> = {
        continuationPath: () => 'conversation.json',
        getSnapshot: () => ({ conversations: [], loading: false, selectedConversation: null }),
        load: vi.fn(async () => undefined),
    },
): ActionPopupOperationInput {
    return {
        action,
        context,
        conversationStore,
        historyStore: { load: vi.fn(async () => undefined) },
        inputStore,
        resultStore: {
            setResult: vi.fn(),
            setRunId: vi.fn(),
            setRunning: vi.fn(),
        },
        runValidationError: null,
        settings: settingsStore.getSnapshot().settings
            ? projectAgentSelection(settingsStore.getSnapshot().settings as AgentSelectionState)
            : defaultSettings,
        settingsStore,
    } as unknown as ActionPopupOperationInput
}

function storedConversation(entries: AgentConversation['entries']): AgentConversation {
    return {
        actionId: action.id,
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: null,
        entries,
        hasExplicitTitle: true,
        id: 'conversation-1',
        path: 'conversation.json',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'waitingForInput',
        title: 'Stream',
        viewed: true,
    }
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
    listener({
        ...eventBase,
        status: 'running',
        type: 'update',
        update: { conversation: storedConversation([]), kind: 'agentStarted' },
    })
    listener({ ...eventBase, status: 'waitingForInput', type: 'agentState' })
}

describe('runPopupAction waiting follow-up', () => {
    let bridge: ElectronActionBridge

    beforeEach(() => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        bridge = {
            cancelActionRun: vi.fn(async () => undefined),
            enqueueActionPrompt: vi.fn(async (_runId, content) => ({content, dispatchState: 'queued', id: 'prompt-1', revision: 0})),
            finishActionRun: vi.fn(async () => undefined),
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener
                return vi.fn()
            }),
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
        actionPromptDraftService.getDraft(action.id, context, { prepare: false }).edit('Next request')

        await runPopupAction(operationInput(inputStore))

        expect(bridge.enqueueActionPrompt).toHaveBeenCalledWith('run-1', 'Next request')
        expect(actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot()?.context.worktree).toBe('3')
        expect(restartAction).not.toHaveBeenCalled()
    })

    it('clears the editor only after the bridge accepts the enqueued prompt', async () => {
        const acceptance = deferred<void>()
        bridge.enqueueActionPrompt = vi.fn(async (_runId: string, content: string) => {
            await acceptance.promise

            return { content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 0 }
        })
        const draft = actionPromptDraftService.getDraft(action.id, context, { prepare: false })
        draft.edit('Next request')

        const send = runPopupAction(operationInput(new ActionRunInputStore()))
        expect(draft.getSnapshot()).toBe('Next request')
        acceptance.resolve()
        await send

        expect(draft.getSnapshot()).toBe('')
    })

    it('keeps text edited while the bridge acknowledgement is pending', async () => {
        const acceptance = deferred<void>()
        bridge.enqueueActionPrompt = vi.fn(async (_runId: string, content: string) => {
            await acceptance.promise

            return { content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 0 }
        })
        const draft = actionPromptDraftService.getDraft(action.id, context, { prepare: false })
        draft.edit('Accepted text')

        const send = runPopupAction(operationInput(new ActionRunInputStore()))
        draft.edit('New editor text')
        acceptance.resolve()
        await send

        expect(draft.getSnapshot()).toBe('New editor text')
    })

    it('keeps the prompt on screen and reports a failed enqueue', async () => {
        bridge.enqueueActionPrompt = vi.fn(async () => {
            throw new Error('Queue unavailable')
        })
        const reportError = vi.spyOn(dialogService, 'error')
        const draft = actionPromptDraftService.getDraft(action.id, context, { prepare: false })
        draft.edit('Do not lose this')

        await runPopupAction(operationInput(new ActionRunInputStore()))

        expect(draft.getSnapshot()).toBe('Do not lose this')
        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Queue unavailable' }),
            { fallbackMessage: 'Could not send agent message' },
        )
    })

    it('guards Send, Stop, and Finish while active run has historical display', async () => {
        const historicalConversation = { ...storedConversation([]), path: 'history.json' }
        const conversationStore = {
            continuationPath: () => historicalConversation.path,
            getSnapshot: () => ({ conversations: [historicalConversation], loading: false, selectedConversation: historicalConversation }),
            load: vi.fn(async () => undefined),
        } as unknown as ActionPopupOperationInput['conversationStore']
        const input = operationInput(new ActionRunInputStore(), undefined, conversationStore)

        await runPopupAction(input)
        await cancelPopupAction(action, context, conversationStore)
        await finishPopupAction(action, context, conversationStore)

        expect(bridge.enqueueActionPrompt).not.toHaveBeenCalled()
        expect(bridge.cancelActionRun).not.toHaveBeenCalled()
        expect(bridge.finishActionRun).not.toHaveBeenCalled()
    })

    it('restarts from persisted conversation with changed settings', async () => {
        const inputStore = new ActionRunInputStore()
        const settingsStore = new ActionRunSettingsStore(action.id, null)
        settingsStore.setSettings(selectModel(defaultSelection, 'gpt-5.6'), true)
        actionPromptDraftService.getDraft(action.id, context, { prepare: false }).edit('Next request')
        restartAction.mockImplementation(async (_runId, _action, _context, _runInput, onStarted) => {
            onStarted('run-2')
            return { changedPaths: [], logs: [], status: 'completed' }
        })

        await runPopupAction(operationInput(inputStore, settingsStore))

        expect(restartAction).toHaveBeenCalledWith(
            'run-1', action, context,
            expect.objectContaining({ continueFrom: 'conversation.json', model: 'gpt-5.6', prompt: 'Next request' }),
            expect.any(Function),
        )
        expect(bridge.enqueueActionPrompt).not.toHaveBeenCalled()
        expect(settingsStore.getSnapshot().settingsChangedWhileWaiting).toBe(false)
    })

    it('preserves prompt and reports restart failure', async () => {
        const inputStore = new ActionRunInputStore()
        const settingsStore = new ActionRunSettingsStore(action.id, null)
        settingsStore.setSettings(defaultSelection, true)
        const draft = actionPromptDraftService.getDraft(action.id, context, { prepare: false })
        draft.edit('Keep request')
        restartAction.mockImplementation(async () => {
            throw new Error('restart failed')
        })
        const reportError = vi.spyOn(dialogService, 'error')

        await runPopupAction(operationInput(inputStore, settingsStore))

        expect(draft.getSnapshot()).toBe('Keep request')
        expect(currentActionPromptDraft(action, context, false)).toBe(draft)
        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'restart failed' }),
            { fallbackMessage: 'Action run failed' },
        )
    })

    it('restores draft when replacement run fails before persisting submitted message', async () => {
        const inputStore = new ActionRunInputStore()
        const settingsStore = new ActionRunSettingsStore(action.id, null)
        settingsStore.setSettings(defaultSelection, true)
        const previousConversation = storedConversation([{content: 'Earlier answer', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:01:00.000Z'}])
        const conversationStore = {
            continuationPath: () => previousConversation.path,
            getSnapshot: () => ({ conversations: [previousConversation], loading: false, selectedConversation: previousConversation }),
            load: vi.fn(async () => undefined),
        }
        const operation = operationInput(inputStore, settingsStore, conversationStore)
        actionPromptDraftService.getDraft(action.id, context, { prepare: false }).edit('Keep request')
        restartAction.mockImplementation(async (_runId, _action, _context, _runInput, onStarted) => {
            onStarted('run-2')
            return {
                logs: [{
                    actionId: action.id,
                    actionName: action.label,
                    command: null,
                    message: 'Codex executable could not start',
                    phase: 'main',
                    status: 'failed',
                    stderr: 'Codex executable could not start',
                    stdout: '',
                }],
                status: 'failed',
            }
        })

        await runPopupAction(operation)

        expect(currentActionPromptDraft(action, context, false).getSnapshot()).toBe('Keep request')
        expect(operation.resultStore.setResult).toHaveBeenCalledWith(expect.objectContaining({
            logs: [expect.objectContaining({ message: 'Codex executable could not start' })],
            status: 'failed',
        }))
    })

    it('does not restore draft after failed replacement persisted submitted message', async () => {
        const inputStore = new ActionRunInputStore()
        const settingsStore = new ActionRunSettingsStore(action.id, null)
        settingsStore.setSettings(defaultSelection, true)
        const previousConversation = storedConversation([{content: 'Earlier answer', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:01:00.000Z'}])
        const failedConversation = {
            ...previousConversation,
            entries: [
                ...previousConversation.entries,
                { content: 'Sent request', id: 'user-2', kind: 'message' as const, role: 'user' as const, timestamp: '2026-01-01T00:02:00.000Z' },
            ],
        }
        let selectedConversation = previousConversation
        const conversationStore = {
            continuationPath: () => previousConversation.path,
            getSnapshot: () => ({ conversations: [selectedConversation], loading: false, selectedConversation }),
            load: vi.fn(async () => { selectedConversation = failedConversation }),
        }
        actionPromptDraftService.getDraft(action.id, context, { prepare: false }).edit('Sent request')
        restartAction.mockImplementation(async (_runId, _action, _context, _runInput, onStarted) => {
            onStarted('run-2')
            return { changedPaths: [], logs: [], status: 'failed' }
        })

        await runPopupAction(operationInput(inputStore, settingsStore, conversationStore))

        expect(currentActionPromptDraft(action, context, false).getSnapshot()).toBe('')
    })
})
