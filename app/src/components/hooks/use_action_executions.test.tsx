import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionExecutionService } from '../../services/actions/action_execution_service'
import { useRunningActionForContext, useRunningActionForFile } from './use_action_executions'

const selectedContext = { file: 'design/F-1.md', kind: 'card' as const }
const unrelatedContext = { file: 'design/F-2.md', kind: 'card' as const }

function executionEvent(context: typeof selectedContext, executionId: string, status: ActionExecutionEvent['status']): ActionExecutionEvent {
    return { actionId: 'build', context, executionId, phase: 'main', rootActionId: 'build', status, type: 'execution' }
}

describe('running action hooks', () => {
    afterEach(() => {
        cleanup()
        actionExecutionService.stop()
        setActionBridgeOverride(null)
    })

    it('does not rerender file or context selectors for unrelated running actions', () => {
        let listener: ((event: ActionExecutionEvent) => void) | null = null
        const bridge = {
            onActionExecution: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge
        setActionBridgeOverride(bridge)
        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount += 1

            return {
                contextExecution: useRunningActionForContext(selectedContext),
                fileExecution: useRunningActionForFile(selectedContext.file),
            }
        })
        if (!listener) throw new Error('Missing execution listener')
        const emit = listener as (event: ActionExecutionEvent) => void

        act(() => emit(executionEvent(unrelatedContext, 'execution-2', 'running')))

        expect(renderCount).toBe(1)
        expect(result.current).toEqual({ contextExecution: null, fileExecution: null })

        act(() => emit(executionEvent(selectedContext, 'execution-1', 'running')))

        expect(renderCount).toBe(2)
        expect(result.current.contextExecution?.executionId).toBe('execution-1')
        expect(result.current.fileExecution?.executionId).toBe('execution-1')

        act(() => emit(executionEvent(unrelatedContext, 'execution-2', 'completed')))

        expect(renderCount).toBe(2)

        act(() => emit(executionEvent(selectedContext, 'execution-1', 'completed')))

        expect(renderCount).toBe(3)
        expect(result.current).toEqual({ contextExecution: null, fileExecution: null })
    })
})
