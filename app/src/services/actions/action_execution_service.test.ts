import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
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

    it('tracks context and accumulates output deltas until the action finishes', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionExecutionService()
        service.start()

        emit(executionEvent('running'))
        emit({
            actionId: 'build', command: 'npm test', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build',
            status: 'running', type: 'action',
        })
        emit({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: { content: 'first ', kind: 'output' },
        })
        emit({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: { content: 'warning', kind: 'error' },
        })

        expect(service.getRunningExecutionForFile(context.file)).toMatchObject({ executionId: 'execution-1' })
        expect(service.getSnapshot().executions[0].logs[0]).toMatchObject({ stderr: 'warning', stdout: 'first ' })

        emit({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'cancelled',
            type: 'action',
        })
        emit(executionEvent('cancelled'))

        expect(service.getRunningExecutionForFile(context.file)).toBeNull()
        expect(service.getSnapshot().executions[0].logs[0]).toMatchObject({ status: 'cancelled', stderr: 'warning', stdout: 'first ' })
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

    it('builds a live agent turn from start metadata and output deltas', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionExecutionService()
        service.start()
        const userMessage = { content: 'Review this', id: 'message-1', role: 'user' as const, timestamp: 'now' }

        emit({ actionId: 'review', context, executionId: 'execution-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'execution' })
        emit({ actionId: 'review', context, executionId: 'execution-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'action' })
        emit({
            actionId: 'review', context, executionId: 'execution-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversationId: 'conversation-1', kind: 'agentStarted', reference: 'log.json', startedAt: 'now', title: 'Review', userMessage },
        })
        emit({
            actionId: 'review', context, executionId: 'execution-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: 'live answer', kind: 'output' },
        })

        expect(service.getSnapshot().executions[0]).toMatchObject({
            agentTurn: { assistantText: 'live answer', conversationId: 'conversation-1', reference: 'log.json', userMessage },
            logs: [{ stdout: 'live answer' }],
        })
        service.stop()
    })

    it('does not notify running-only subscribers for output deltas', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionExecutionService()
        const runningChanged = vi.fn()
        service.addEventListener('runningChanged', runningChanged)
        service.start()

        emit(executionEvent('running'))
        emit({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: { content: 'chunk', kind: 'output' },
        })
        emit(executionEvent('completed'))

        expect(runningChanged).toHaveBeenCalledTimes(2)
        service.stop()
    })
})
