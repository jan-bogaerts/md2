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
})
