import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChangeEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import type { ActionDefinition } from '../../data/action_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionExecutionService } from '../../services/actions/action_execution_service'
import { dialogService } from '../../services/dialog_service'
import { useActionPopupController } from './use_action_popup_controller'

const action: ActionDefinition = {
    agent: null,
    appliesTo: null,
    builtin: false,
    command: 'npm test',
    description: 'Build',
    editorState: { phrases: [], selectedTab: 'prompt' },
    icon: null,
    id: 'build',
    label: 'Build',
    model: null,
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    phrases: [],
    prompt: null,
    sourcePath: 'actions/build.json',
    thinkingLevel: null,
    trackFileChanges: false,
    streaming: false,
    type: 'command',
}
const context: ActionContext = { file: 'design/F-1.md', kind: 'card' }

function installBridge() {
    let listener: ((event: ActionExecutionEvent) => void) | null = null
    const bridge = {
        onActionExecution: vi.fn((nextListener) => {
            listener = nextListener

            return vi.fn()
        }),
    } as unknown as ElectronActionBridge
    setActionBridgeOverride(bridge)
    actionExecutionService.start()

    return (event: ActionExecutionEvent) => {
        if (!listener) throw new Error('Missing action execution listener')
        act(() => listener?.(event))
    }
}

describe('useActionPopupController', () => {
    afterEach(() => {
        actionExecutionService.stop()
        setActionBridgeOverride(null)
    })

    it('loads history once while live output updates rerender the controller', async () => {
        const emit = installBridge()
        const loadHistory = vi.fn(async () => [])
        const { rerender } = renderHook(
            ({ currentContext }) => useActionPopupController({ action, context: currentContext, loadHistory }),
            { initialProps: { currentContext: context } },
        )
        await waitFor(() => expect(loadHistory).toHaveBeenCalledTimes(1))

        emit({ actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'running', type: 'execution' })
        emit({
            actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'running', type: 'update',
            update: { content: 'one', kind: 'output' },
        })
        rerender({ currentContext: { ...context } })
        emit({
            actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'running', type: 'update',
            update: { content: 'two', kind: 'output' },
        })

        expect(loadHistory).toHaveBeenCalledTimes(1)
    })

    it('uses effective assignment for runs and excludes project session assignment from schedules', async () => {
        const effectiveContext: ActionContext = { kind: 'project', worktree: '1' }
        const scheduleContext: ActionContext = { kind: 'project' }
        const runAction = vi.fn(async () => ({ logs: [], status: 'completed' as const }))
        const scheduleAction = vi.fn(async () => undefined)
        const loadHistory = vi.fn(async () => [])
        const { result } = renderHook(() => useActionPopupController({
            action,
            context: effectiveContext,
            loadHistory,
            runAction,
            scheduleAction,
            scheduleContext,
        }))
        await waitFor(() => expect(loadHistory).toHaveBeenCalled())

        await act(async () => result.current.handleRun())
        const timestampEvent = { target: { value: new Date(Date.now() + 60_000).toISOString() }} as ChangeEvent<HTMLInputElement>
        act(() => result.current.handleScheduleTimestampChange(timestampEvent))
        await act(async () => result.current.handleScheduleAction())

        expect(runAction).toHaveBeenCalledWith(action, effectiveContext, { extraPrompt: '' }, expect.any(Function))
        expect(scheduleAction).toHaveBeenCalledWith(action, scheduleContext, expect.objectContaining({ type: 'at' }))
    })

    it('sends later streaming turns and structured answers through active execution', async () => {
        const emit = installBridge()
        const streamingAction: ActionDefinition = {
            ...action,
            command: null,
            prompt: 'Plan',
            streaming: true,
            type: 'agent',
        }
        const sendMessage = vi.fn(async () => undefined)
        const answerQuestion = vi.fn(async () => undefined)
        const loadConversations = vi.fn(async () => [])
        const loadHistory = vi.fn(async () => [])
        const preparePrompt = vi.fn(async () => 'Plan')
        const userMessage = { content: 'Plan', id: 'message-1', role: 'user' as const, timestamp: 'now' }
        const { result } = renderHook(() => useActionPopupController({
            action: streamingAction,
            answerQuestion,
            context,
            loadConversations,
            loadHistory,
            preparePrompt,
            sendMessage,
        }))

        emit({ actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'running', type: 'execution' })
        emit({
            actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'running', type: 'update',
            update: { conversationId: 'conversation-1', kind: 'agentStarted', reference: 'log.json', startedAt: 'now', title: 'Build', userMessage },
        })
        emit({
            actionId: action.id, actionType: 'agent', autoFinish: null, context, executionId: 'execution-1',
            interactionReady: true, phase: 'main', rootActionId: action.id, status: 'waitingForInput',
            streaming: true, type: 'agentState',
        })

        act(() => result.current.handlePromptChange('Approved'))
        await act(async () => result.current.handleRun())
        const questions = [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }]
        emit({
            actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'waitingForInput', type: 'update',
            update: { kind: 'agentQuestion', questions, requestId: 7 },
        })
        await act(async () => result.current.handleAnswerQuestion({ confirm: ['Yes'] }))

        expect(sendMessage).toHaveBeenCalledWith('execution-1', 'Approved')
        expect(answerQuestion).toHaveBeenCalledWith('execution-1', 7, { confirm: ['Yes'] })
        expect(result.current.streamingActive).toBe(true)
    })

    it('reports streaming interaction failures and preserves the prompt', async () => {
        const emit = installBridge()
        const streamingAction: ActionDefinition = {
            ...action,
            command: null,
            prompt: 'Plan',
            streaming: true,
            type: 'agent',
        }
        const answerError = new Error('Answer failed')
        const finishError = new Error('Finish failed')
        const sendError = new Error('Send failed')
        const answerQuestion = vi.fn(async () => { throw answerError })
        const finishAction = vi.fn(async () => { throw finishError })
        const loadConversations = vi.fn(async () => [])
        const loadHistory = vi.fn(async () => [])
        const preparePrompt = vi.fn(async () => 'Plan')
        const sendMessage = vi.fn(async () => { throw sendError })
        const reportError = vi.spyOn(dialogService, 'error')
        const { result } = renderHook(() => useActionPopupController({
            action: streamingAction,
            answerQuestion,
            context,
            finishAction,
            loadConversations,
            loadHistory,
            preparePrompt,
            sendMessage,
        }))

        emit({ actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'running', type: 'execution' })
        emit({
            actionId: action.id, actionType: 'agent', autoFinish: null, context, executionId: 'execution-1',
            interactionReady: true, phase: 'main', rootActionId: action.id, status: 'waitingForInput',
            streaming: true, type: 'agentState',
        })
        act(() => result.current.handlePromptChange('Keep this prompt'))
        await act(async () => result.current.handleRun())
        emit({
            actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id, status: 'waitingForInput', type: 'update',
            update: {
                kind: 'agentQuestion',
                questions: [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }],
                requestId: 7,
            },
        })
        await act(async () => result.current.handleAnswerQuestion({ confirm: ['Yes'] }))
        await act(async () => result.current.handleFinish())

        expect(reportError).toHaveBeenCalledWith(sendError, { fallbackMessage: 'Could not send agent message' })
        expect(reportError).toHaveBeenCalledWith(answerError, { fallbackMessage: 'Could not answer agent question' })
        expect(reportError).toHaveBeenCalledWith(finishError, { fallbackMessage: 'Could not finish agent session' })
        expect(result.current.prompt).toBe('Keep this prompt')
    })

    it('reports action validation failures through dialogService', async () => {
        const validationError = new Error('Action "Build" requires a worktree assignment')
        const runAction = vi.fn(async () => ({ logs: [], status: 'completed' as const }))
        const loadHistory = vi.fn(async () => [])
        const reportError = vi.spyOn(dialogService, 'error')
        const { result } = renderHook(() => useActionPopupController({
            action,
            context: { kind: 'project' },
            executionValidationError: validationError.message,
            loadHistory,
            runAction,
        }))

        await act(async () => result.current.handleRun())

        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: validationError.message }), {fallbackMessage: 'Action run failed'})
        expect(runAction).not.toHaveBeenCalled()
        expect(result.current.runStatus).toBe('failed')
    })

    it.each(['completed', 'failed', 'cancelled', 'okButNotAfter'] as const)(
        'prepares a fresh prompt and relaunches after %s',
        async (terminalStatus) => {
            const emit = installBridge()
            const agentAction: ActionDefinition = {
                ...action,
                command: null,
                prompt: 'Plan',
                type: 'agent',
            }
            emit({
                actionId: action.id, actionType: 'agent', context, executionId: 'execution-1', phase: 'main',
                rootActionId: action.id, status: 'running', type: 'action',
            })
            emit({
                actionId: action.id, actionType: 'agent', context, executionId: 'execution-1', phase: 'main',
                rootActionId: action.id, status: terminalStatus, type: 'action',
            })
            emit({
                actionId: action.id, context, executionId: 'execution-1', phase: 'main', rootActionId: action.id,
                status: terminalStatus, type: 'execution',
            })
            const preparePrompt = vi.fn(async () => 'Prepared')
            const runAction = vi.fn(async () => ({ logs: [], status: 'completed' as const }))
            const loadConversations = vi.fn(async () => [])
            const loadHistory = vi.fn(async () => [])
            const { result } = renderHook(() => useActionPopupController({
                action: agentAction,
                context,
                loadConversations,
                loadHistory,
                preparePrompt,
                runAction,
            }))

            await waitFor(() => expect(result.current.prompt).toBe('Prepared'))
            await act(async () => result.current.handleRun())

            expect(preparePrompt).toHaveBeenCalledWith(agentAction, context)
            expect(runAction).toHaveBeenCalledWith(
                agentAction,
                context,
                expect.objectContaining({ prompt: 'Prepared' }),
                expect.any(Function),
            )
        },
    )

    it('does not replace prompt while an execution is active', () => {
        const emit = installBridge()
        const agentAction: ActionDefinition = {
            ...action,
            command: null,
            prompt: 'Plan',
            type: 'agent',
        }
        emit({
            actionId: action.id, actionType: 'agent', context, executionId: 'execution-1', phase: 'main',
            rootActionId: action.id, status: 'running', type: 'action',
        })
        const preparePrompt = vi.fn(async () => 'Prepared')
        const loadConversations = vi.fn(async () => [])
        const loadHistory = vi.fn(async () => [])

        renderHook(() => useActionPopupController({
            action: agentAction,
            context,
            loadConversations,
            loadHistory,
            preparePrompt,
        }))

        expect(preparePrompt).not.toHaveBeenCalled()
    })

    it('restores prompt draft after popup controller remount', async () => {
        installBridge()
        const agentAction: ActionDefinition = {
            ...action,
            command: null,
            prompt: 'Plan',
            type: 'agent',
        }
        const dependencies = {
            action: agentAction,
            context,
            loadConversations: vi.fn(async () => []),
            loadHistory: vi.fn(async () => []),
            preparePrompt: vi.fn(async () => 'Prepared'),
        }
        const first = renderHook(() => useActionPopupController(dependencies))
        await waitFor(() => expect(first.result.current.prompt).toBe('Prepared'))

        act(() => first.result.current.handlePromptChange('Keep this draft'))
        first.unmount()
        const second = renderHook(() => useActionPopupController(dependencies))

        expect(second.result.current.prompt).toBe('Keep this draft')
    })
})
