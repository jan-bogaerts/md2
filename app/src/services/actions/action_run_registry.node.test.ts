import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { AgentConversation, AgentConversationEntry } from '../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { ActionRunRegistry, notifyActionCardStateChange } from './action_run_registry'

const context = { file: 'design/F-1.md', kind: 'card' as const }

function bridgeWithEvents(overrides: Partial<ElectronActionBridge> = {}) {
    let listener: ((event: ActionRunEvent) => void) | null = null
    const bridge = {
        onActionRun: vi.fn((nextListener) => {
            listener = nextListener

            return vi.fn()
        }),
        ...overrides,
    } as unknown as ElectronActionBridge
    const emit = (event: ActionRunEvent) => {
        if (!listener) throw new Error('Missing run listener')
        listener(event)
    }

    return { bridge, emit }
}

function runEvent(status: ActionRunEvent['status']): ActionRunEvent {
    return { actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status, type: 'run' }
}

function getRun(service: ActionRunRegistry, runId = 'run-1') {
    const run = service.getRunStore(runId)?.getSnapshot()
    if (!run) throw new Error('Missing run')

    return run
}

function getActiveRun(service: ActionRunRegistry) {
    return service.getContextActiveSnapshot(context)[0] ?? null
}

function agentConversation(entries: AgentConversationEntry[], overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: null,
        cardPath: context.file,
        completedAt: null,
        entries,
        hasExplicitTitle: true,
        id: 'conversation-1',
        path: 'log.json',
        providerSessions: [],
        startedAt: 'now',
        status: 'running',
        title: 'Review',
        viewed: true,
        ...overrides,
    }
}

describe('ActionRunRegistry', () => {
    afterEach(() => setActionBridgeOverride(null))

    it('tracks context and accumulates output deltas until the action finishes', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()

        emit(runEvent('running'))
        emit({
            actionId: 'build', command: 'npm test', context, runId: 'run-1', phase: 'main', rootActionId: 'build',
            status: 'running', type: 'action',
        })
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: { content: 'first ', kind: 'output' },
        })
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: { content: 'warning', kind: 'error' },
        })

        expect(getActiveRun(service)).toMatchObject({ runId: 'run-1' })
        const store = service.getActionRunStore('build', context)
        if (!store) throw new Error('Missing run store')
        const release = store.subscribe(vi.fn())
        expect(store.getSnapshot().logs[0]).toMatchObject({ stderr: 'warning', stdout: 'first ' })

        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'cancelled',
            type: 'action',
        })
        emit(runEvent('cancelled'))

        expect(getActiveRun(service)).toBeNull()
        expect(store.getSnapshot().logs[0]).toMatchObject({ status: 'cancelled', stderr: 'warning', stdout: 'first ' })
        release()
        service.stop()
    })

    it.each(['completed', 'failed', 'cancelled', 'okButNotAfter'] as const)('clears card running state after %s', (status) => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        emit(runEvent('running'))

        emit(runEvent(status))

        expect(getActiveRun(service)).toBeNull()
        service.stop()
    })

    it('keeps one stable store while retained and releases it after terminal persistence', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        emit(runEvent('running'))
        const store = service.getRunStore('run-1')
        if (!store) throw new Error('Missing run store')
        const release = store.subscribe(vi.fn())

        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: { content: 'done', kind: 'output' },
        })
        expect(service.getRunStore('run-1')).toBe(store)

        emit(runEvent('completed'))
        expect(service.getRunStore('run-1')).toBe(store)
        expect(store.getSnapshot().status).toBe('completed')

        release()
        expect(service.getRunStore('run-1')).toBeNull()
        expect(service.getActionRunStore('build', context)).toBeNull()
        service.stop()
    })

    it('keeps more than 100 simultaneous active runs without eviction', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()

        for (let index = 0; index < 101; index++) {
            emit({ ...runEvent('running'), runId: `run-${index}` })
        }

        expect(service.getGlobalActiveSnapshot()).toHaveLength(101)
        expect(service.getRunStore('run-0')).not.toBeNull()
        expect(service.getRunStore('run-100')).not.toBeNull()
        service.stop()
    })

    it('tracks a queued action as active and replaces its queued log when it starts', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()

        emit(runEvent('running'))
        emit({
            actionId: 'build', actionType: 'agent', context, runId: 'run-1', phase: 'main',
            rootActionId: 'build', status: 'queued', type: 'action',
        })

        expect(getRun(service)).toMatchObject({
            activeActionId: 'build',
            activeActionType: 'agent',
            status: 'queued',
        })
        expect(getRun(service).logs).toEqual([
            expect.objectContaining({ actionId: 'build', status: 'queued' }),
        ])

        emit({
            actionId: 'build', actionType: 'agent', context, runId: 'run-1', phase: 'main',
            rootActionId: 'build', status: 'running', type: 'action',
        })

        expect(getRun(service)?.status).toBe('running')
        expect(getRun(service).logs).toEqual([
            expect.objectContaining({ actionId: 'build', status: 'running' }),
        ])
        service.stop()
    })

    it('grows the canonical agent conversation from output deltas', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const userMessage = { content: 'Review this', id: 'message-1', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }

        emit({ actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'run' })
        emit({ actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'action' })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation([userMessage]), kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: '', kind: 'output', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: 'live answer', kind: 'output' },
        })

        expect(getRun(service)).toMatchObject({
            conversation: {
                entries: [userMessage, expect.objectContaining({ content: 'live answer', kind: 'message', role: 'assistant' })],
                id: 'conversation-1',
                path: 'log.json',
            },
            logs: [{ stdout: 'live answer' }],
        })
        service.stop()
    })

    it('upserts live agent event by provider item id without changing its sequence or duplicating file metrics', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const userMessage = {
            content: 'Run tests',
            id: 'message-1',
            kind: 'message' as const,
            role: 'user' as const,
            sequence: 1,
            timestamp: 'now',
        }

        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation([userMessage]), kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: '', kind: 'output', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                event: {
                    content: 'update: app/main.ts',
                    id: 'activity-started',
                    kind: 'event',
                    providerItemId: 'file-1',
                    sequence: 3,
                    status: 'inProgress',
                    timestamp: 'now',
                    type: 'fileChange',
                },
                kind: 'agentEvent',
            },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: 'Testing', kind: 'output', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: '...', kind: 'output', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: 'Testing passed', kind: 'output', messageId: 'assistant-1', previousContent: 'Testing...', replace: true, sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                event: {
                    content: 'update: app/main.ts',
                    deletions: 2,
                    id: 'activity-completed',
                    insertions: 4,
                    kind: 'event',
                    providerItemId: 'file-1',
                    status: 'completed',
                    timestamp: 'later',
                    type: 'fileChange',
                },
                kind: 'agentEvent',
            },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: 'Done', kind: 'output', messageId: 'assistant-2', sequence: 4 },
        })

        expect(getRun(service).conversation).toMatchObject({
            entries: [
                userMessage,
                expect.objectContaining({ content: 'Testing passed', id: 'assistant-1', sequence: 2 }),
                expect.objectContaining({
                    deletions: 2, id: 'activity-completed', insertions: 4,
                    providerItemId: 'file-1', sequence: 3, status: 'completed',
                }),
                expect.objectContaining({ content: 'Done', id: 'assistant-2', sequence: 4 }),
            ],
        })
        expect(getRun(service).logs.at(-1)?.stdout).toBe('Testing passedDone')
        service.stop()
    })

    it('applies terminal conversation metadata from the canonical close snapshot', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const started = agentConversation([])
        const completed = agentConversation([], {
            completedAt: 'later',
            providerSessions: [{
                agent: 'codex',
                conversationId: 'provider-1',
                createdAt: 'now',
                lastUsedAt: 'later',
                synchronizedThroughMessageId: 'assistant-1',
            }],
            status: 'completed',
            usage: { cachedInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 4, totalTokens: 10 },
        })

        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: started, kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'completed', type: 'update',
            update: { conversation: completed, kind: 'agentClosed' },
        })

        expect(getRun(service).conversation).toEqual(completed)
        service.stop()
    })

    it('sets question updates to waiting and restores running when answered without agent state events', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const firstMessage = { content: 'Plan', id: 'message-1', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }
        const nextMessage = { content: 'Approved', id: 'message-2', kind: 'message' as const, role: 'user' as const, timestamp: 'later' }
        const questions = [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }]

        emit({ actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'run' })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation([firstMessage]), kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'waitingForInput', type: 'update',
            update: { kind: 'agentQuestion', questions, requestId: 7 },
        })

        expect(getRun(service)).toMatchObject({
            question: { questions, requestId: 7 },
            status: 'waitingForInput',
        })

        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { kind: 'agentQuestionAnswer', userMessage: nextMessage },
        })

        expect(getRun(service)).toMatchObject({
            conversation: { entries: [firstMessage, nextMessage], status: 'running' },
            question: null,
            status: 'running',
        })
        service.stop()
    })

    it('recovers an active waiting session and deduplicates events received during snapshot loading', async () => {
        let resolveSnapshot!: (events: ActionRunEvent[]) => void
        const snapshot = new Promise<ActionRunEvent[]>((resolve) => {
            resolveSnapshot = resolve
        })
        const { bridge, emit } = bridgeWithEvents({ loadActiveActionRunEvents: vi.fn(() => snapshot) })
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        const userMessage = { content: 'Plan', id: 'message-1', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }
        const questions = [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }]
        const events: ActionRunEvent[] = [
            { ...runEvent('running'), sequence: 1 },
            {
                actionId: 'build', actionType: 'agent', context, runId: 'run-1', interactionReady: true,
                phase: 'main', rootActionId: 'build', sequence: 2, status: 'running', streaming: true, type: 'action',
            },
            {
                actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 3,
                status: 'running', type: 'update',
                update: { conversation: agentConversation([userMessage], { actionId: 'build', title: 'Build' }), kind: 'agentStarted' },
            },
            {
                actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 4,
                status: 'running', type: 'update', update: { content: 'proposal', kind: 'output' },
            },
            {
                actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 5,
                status: 'waitingForInput', type: 'update', update: { kind: 'agentQuestion', questions, requestId: 7 },
            },
        ]
        service.start()
        emit(events[4])
        resolveSnapshot(events)

        await vi.waitFor(() => expect(getRun(service)).toMatchObject({
            conversation: {
                entries: expect.arrayContaining([expect.objectContaining({ content: 'proposal', kind: 'message', role: 'assistant' })]),
                id: 'conversation-1',
                status: 'waitingForInput',
            },
            question: { questions, requestId: 7 },
            status: 'waitingForInput',
        }))
        expect(getRun(service).logs[0].stdout).toBe('proposal')
        service.stop()
    })

    it('keeps matching a run after the card header changes during the run', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        const runContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const, state: 'design', title: 'Old title' }
        service.start()

        emit({ actionId: 'build', context: runContext, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'run' })
        const reloadedContext = { ...runContext, state: 'ready', title: 'New title', worktree: '1' }

        expect(service.getActionRunStore('build', reloadedContext)?.getSnapshot()).toMatchObject({ runId: 'run-1' })
        service.stop()
    })

    it('does not notify running-only subscribers for output deltas', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        const activeChanged = vi.fn()
        service.subscribeGlobalActive(activeChanged)
        service.start()

        emit(runEvent('running'))
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: { content: 'chunk', kind: 'output' },
        })
        emit(runEvent('completed'))

        expect(activeChanged).toHaveBeenCalledTimes(2)
        service.stop()
    })

    it('notifies active-only subscribers when a run starts waiting or resumes', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        const activeChanged = vi.fn()
        service.subscribeGlobalActive(activeChanged)
        service.start()

        emit(runEvent('running'))
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build',
            status: 'waitingForInput', type: 'agentState',
        })
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build',
            status: 'running', type: 'agentState',
        })

        expect(activeChanged).toHaveBeenCalledTimes(3)
        service.stop()
    })

    it('routes card-state changes to desktop without replaying renderer run state', async () => {
        const notifyBridge = vi.fn(async () => undefined)
        const { bridge } = bridgeWithEvents({ notifyActionCardStateChange: notifyBridge })
        setActionBridgeOverride(bridge)

        await notifyActionCardStateChange(null, 'ready')
        await notifyActionCardStateChange('card-1', 'ready')

        expect(notifyBridge).toHaveBeenCalledOnce()
        expect(notifyBridge).toHaveBeenCalledWith('card-1', 'ready')
    })

})
