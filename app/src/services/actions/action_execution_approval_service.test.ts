import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionExecutionEvent, AgentApproval, AgentApprovalDecision } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { ActionExecutionService, answerActionApproval } from './action_execution_service'

const context = { file: 'design/F-1.md', kind: 'card' as const }

function approvalEvent(sequence: number, approval: AgentApproval): ActionExecutionEvent {
    return {
        actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', sequence,
        status: 'waitingForInput', type: 'update', update: { approval, kind: 'agentApproval' },
    }
}

describe('ActionExecutionService approvals', () => {
    afterEach(() => setActionBridgeOverride(null))

    it('replays unresolved approvals and discards resolved requests', async () => {
        let listener: ((event: ActionExecutionEvent) => void) | null = null
        const commandApproval: AgentApproval = {
            command: 'npm test', filePaths: [], itemId: 'command-1', kind: 'commandExecution', requestId: 41,
            startedAtMs: 1, threadId: 'thread-1', turnId: 'turn-1',
        }
        const fileApproval: AgentApproval = {
            filePaths: ['app/main.ts'], itemId: 'file-1', kind: 'fileChange', requestId: 42,
            startedAtMs: 2, threadId: 'thread-1', turnId: 'turn-1',
        }
        const events: ActionExecutionEvent[] = [
            {
                actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', sequence: 1,
                status: 'running', type: 'execution',
            },
            approvalEvent(2, commandApproval),
            {
                actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', sequence: 3,
                status: 'waitingForInput', type: 'update', update: { kind: 'agentApprovalSubmitted', requestId: 41 },
            },
            {
                actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', sequence: 4,
                status: 'waitingForInput', type: 'update', update: { kind: 'agentApprovalResolved', requestId: 41 },
            },
            approvalEvent(5, fileApproval),
        ]
        const bridge = {
            loadActiveActionExecutionEvents: vi.fn(async () => events),
            onActionExecution: vi.fn((callback) => {
                listener = callback

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge
        setActionBridgeOverride(bridge)
        const service = new ActionExecutionService()
        service.start()

        await vi.waitFor(() => expect(service.getSnapshot().executions[0]?.approvals).toEqual([
            { ...fileApproval, submitted: false },
        ]))
        if (!listener) throw new Error('Missing action execution listener')
        listener({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', sequence: 6,
            status: 'cancelled', type: 'execution',
        })
        expect(service.getSnapshot().executions[0]?.approvals).toEqual([])
        service.stop()
    })

    it('forwards exact decisions through local or remote action bridges', async () => {
        const answerApproval = vi.fn(async () => undefined)
        setActionBridgeOverride({ answerActionApproval: answerApproval } as unknown as ElectronActionBridge)
        const decision: AgentApprovalDecision = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['npm', 'test'] } }

        await answerActionApproval('execution-1', 41, decision)

        expect(answerApproval).toHaveBeenCalledWith('execution-1', 41, decision)
    })
})
