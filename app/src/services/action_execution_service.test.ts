import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionExecutionEvent } from '../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../data/electron_action_bridge'
import { ActionExecutionService } from './action_execution_service'

const context = { file: 'design/F-1.md', kind: 'card' as const }

function bridgeWithEvents() {
    let listener: ((event: ActionExecutionEvent) => void) | null = null
    const bridge = {
        onActionExecution: vi.fn((nextListener) => {
            listener = nextListener

            return vi.fn()
        }),
    } as unknown as ElectronActionBridge
    const emit = (event: ActionExecutionEvent) => {
        if (!listener) throw new Error('Missing execution listener')
        listener(event)
    }

    return { bridge, emit }
}

function executionEvent(status: ActionExecutionEvent['status']): ActionExecutionEvent {
    return { actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status, type: 'execution' }
}

describe('ActionExecutionService', () => {
    afterEach(() => setActionBridgeOverride(null))

    it('tracks context, streams chunks, and replaces them with terminal output', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionExecutionService()
        service.start()

        emit(executionEvent('running'))
        emit({
            actionId: 'build', command: 'npm test', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build',
            status: 'running', stdout: 'first ', type: 'action',
        })
        emit({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'running',
            stderr: 'warning', type: 'action',
        })

        expect(service.getRunningExecutionForFile(context.file)).toMatchObject({ executionId: 'execution-1' })
        expect(service.getSnapshot().executions[0].logs[0]).toMatchObject({ stderr: 'warning', stdout: 'first ' })

        emit({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'cancelled',
            stderr: '', stdout: 'final', type: 'action',
        })
        emit(executionEvent('cancelled'))

        expect(service.getRunningExecutionForFile(context.file)).toBeNull()
        expect(service.getSnapshot().executions[0].logs[0]).toMatchObject({ status: 'cancelled', stdout: 'final' })
        service.stop()
    })

    it.each(['completed', 'failed', 'cancelled', 'okButNotAfter'] as const)('clears card running state after %s', (status) => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionExecutionService()
        service.start()
        emit(executionEvent('running'))

        emit(executionEvent(status))

        expect(service.getRunningExecutionForContext(context)).toBeNull()
        service.stop()
    })

    it('adds live agent assistant output to shared execution logs', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionExecutionService()
        service.start()
        const conversation = {
            actionId: 'review', cardPath: context.file, completedAt: null, events: [], hasExplicitTitle: true, id: 'conversation-1', messages: [], path: 'log.json',
            providerSessions: [], startedAt: 'now', status: 'running' as const, title: 'Review',
        }

        emit({ actionId: 'review', context, executionId: 'execution-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'execution' })
        emit({ actionId: 'review', context, executionId: 'execution-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'action' })
        emit({
            actionId: 'review',
            agentEvent: { content: 'live answer', conversation, runId: 'turn-1', type: 'output' },
            context,
            executionId: 'execution-1',
            phase: 'main',
            rootActionId: 'review',
            status: 'running',
            type: 'agent',
        })

        expect(service.getSnapshot().executions[0]).toMatchObject({ conversation, logs: [{ stdout: 'live answer' }] })
        service.stop()
    })
})
