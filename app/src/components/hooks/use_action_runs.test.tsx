import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import { useActionRun, useRunSelector, useRunningActionForContext } from './use_action_runs'

const selectedContext = { file: 'design/F-1.md', kind: 'card' as const }
const unrelatedContext = { file: 'design/F-2.md', kind: 'card' as const }

function runEvent(context: typeof selectedContext, runId: string, status: ActionRunEvent['status']): ActionRunEvent {
    return { actionId: 'build', context, runId, phase: 'main', rootActionId: 'build', status, type: 'run' }
}

describe('action run hooks', () => {
    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        setActionBridgeOverride(null)
    })

    it('does not rerender selected run consumers for unrelated run changes', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        const bridge = {
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge
        setActionBridgeOverride(bridge)
        actionRunRegistry.start()
        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount += 1

            return {
                activeRun: useRunningActionForContext(selectedContext),
                selectedRun: useActionRun('build', selectedContext),
            }
        })
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void

        act(() => emit(runEvent(unrelatedContext, 'run-2', 'running')))

        expect(renderCount).toBe(1)
        expect(result.current).toEqual({ activeRun: null, selectedRun: null })

        act(() => emit(runEvent(selectedContext, 'run-1', 'running')))

        expect(renderCount).toBe(2)
        expect(result.current.activeRun?.runId).toBe('run-1')
        expect(result.current.selectedRun?.runId).toBe('run-1')

        act(() => emit({
            actionId: 'build', context: unrelatedContext, runId: 'run-2', phase: 'main', rootActionId: 'build',
            status: 'running', type: 'update', update: { content: 'unrelated', kind: 'output' },
        }))

        expect(renderCount).toBe(2)

        act(() => emit(runEvent(selectedContext, 'run-1', 'completed')))

        expect(renderCount).toBe(3)
        expect(result.current.activeRun).toBeNull()
        expect(result.current.selectedRun).toBeNull()
    })

    it('subscribes to the selected runId before and after its store exists', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        const bridge = {
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge
        setActionBridgeOverride(bridge)
        actionRunRegistry.start()
        const { result, rerender } = renderHook(
            ({ runId }) => useRunSelector(runId, (run) => run?.status ?? 'idle'),
            { initialProps: { runId: 'run-1' as string | null } },
        )
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void

        act(() => emit(runEvent(selectedContext, 'run-1', 'running')))
        expect(result.current).toBe('running')

        act(() => emit(runEvent(selectedContext, 'run-2', 'running')))
        rerender({ runId: 'run-2' })
        expect(result.current).toBe('running')

        act(() => emit(runEvent(selectedContext, 'run-1', 'waitingForInput')))
        expect(result.current).toBe('running')

        act(() => emit(runEvent(selectedContext, 'run-2', 'waitingForInput')))
        expect(result.current).toBe('waitingForInput')
    })
})
