import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent, AgentApproval, AgentApprovalDecision } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { ActionRunRegistry, answerActionApproval } from './action_run_registry'

const context = { file: 'design/F-1.md', kind: 'card' as const }

function approvalEvent(sequence: number, approval: AgentApproval): ActionRunEvent {
    return {
        actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence,
        status: 'waitingForInput', type: 'update', update: { approval, kind: 'agentApproval' },
    }
}

describe('ActionRunRegistry approvals', () => {
    afterEach(() => setActionBridgeOverride(null))

    it('replays unresolved approvals and discards resolved requests', async () => {
        const listeners: Array<(event: ActionRunEvent) => void> = []
        const commandApproval: AgentApproval = {
            command: 'npm test', filePaths: [], itemId: 'command-1', kind: 'commandExecution', requestId: 41,
            startedAtMs: 1, threadId: 'thread-1', turnId: 'turn-1',
        }
        const fileApproval: AgentApproval = {
            filePaths: ['app/main.ts'], input: { file_path: 'app/main.ts' }, itemId: 'file-1', kind: 'fileChange',
            permissionSuggestions: [{ behavior: 'allow', destination: 'session' }], provider: 'claude', requestId: 42,
            startedAtMs: 2, toolName: 'Write',
        }
        const events: ActionRunEvent[] = [
            {
                actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 1,
                status: 'running', type: 'run',
            },
            approvalEvent(2, commandApproval),
            {
                actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 3,
                status: 'waitingForInput', type: 'update', update: { kind: 'agentApprovalSubmitted', requestId: 41 },
            },
            {
                actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 4,
                status: 'waitingForInput', type: 'update', update: { kind: 'agentApprovalResolved', requestId: 41 },
            },
            approvalEvent(5, fileApproval),
        ]
        const bridge = {
            loadActiveActionRunEvents: vi.fn(async () => events),
            onActionRun: vi.fn((callback) => {
                listeners.push(callback)

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()

        await vi.waitFor(() => expect(service.getRunStore('run-1')?.getSnapshot().approvals).toEqual([
            { ...fileApproval, submitted: false },
        ]))
        const store = service.getRunStore('run-1')
        if (!store) throw new Error('Missing run store')
        const release = store.subscribe(vi.fn())
        const [listener] = listeners
        if (!listener) throw new Error('Missing action run listener')
        listener({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 6,
            status: 'cancelled', type: 'run',
        })
        expect(store.getSnapshot().approvals).toEqual([])
        release()
        service.stop()
    })

    it('forwards exact decisions through local or remote action bridges', async () => {
        const answerApproval = vi.fn(async () => undefined)
        setActionBridgeOverride({ answerActionApproval: answerApproval } as unknown as ElectronActionBridge)
        const decision: AgentApprovalDecision = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['npm', 'test'] } }

        await answerActionApproval('run-1', 41, decision)

        expect(answerApproval).toHaveBeenCalledWith('run-1', 41, decision)
    })
})
