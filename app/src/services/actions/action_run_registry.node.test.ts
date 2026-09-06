import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { AgentConversation, AgentConversationEntry } from '../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionPromptDraftService } from './action_prompt_draft_service'
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

    it('projects captured card context in global active runs', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const cardRunContext = {
            cardInternalId: 'card-internal-1',
            file: 'design/F-1.md',
            kind: 'card' as const,
            title: 'Captured card title',
        }

        emit({ ...runEvent('running'), context: cardRunContext })

        expect(service.getGlobalActiveSnapshot()[0]).toEqual({
            context: cardRunContext,
            rootActionId: 'build',
            runId: 'run-1',
            status: 'running',
        })
        service.stop()
    })

    it('keeps runs for reviewed change sets on one diagram separate', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        const firstContext = {
            diagramChanges: 'First changes', diagramChangeSetId: 'review-1', diagramId: 'diagram-1',
            kind: 'diagram' as const, type: 'root',
        }
        const secondContext = {
            diagramChanges: 'Second changes', diagramChangeSetId: 'review-2', diagramId: 'diagram-1',
            kind: 'diagram' as const, type: 'root',
        }
        service.start()

        emit({ ...runEvent('running'), context: firstContext })
        emit({ ...runEvent('running'), context: secondContext, runId: 'run-2' })

        expect(service.getActionRunStore('build', firstContext)?.getSnapshot().runId).toBe('run-1')
        expect(service.getActionRunStore('build', secondContext)?.getSnapshot().runId).toBe('run-2')
        service.stop()
    })

    it('returns changed paths from terminal run data', async () => {
        const { bridge, emit } = bridgeWithEvents({ startAction: vi.fn(async () => 'run-1') })
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        let resolveStarted!: () => void
        const started = new Promise<void>((resolve) => {
            resolveStarted = resolve
        })
        const completion = service.startRun({ id: 'build' } as ActionDefinition, context, {}, resolveStarted)
        await started

        emit(runEvent('running'))
        emit({
            ...runEvent('completed'),
            changedPaths: ['app/a.ts', 'desktop/b.js'],
            diagramPath: 'design/diagrams/overview.json',
        })

        await expect(completion).resolves.toEqual({
            changedPaths: ['app/a.ts', 'desktop/b.js'],
            diagramPath: 'design/diagrams/overview.json',
            logs: [],
            status: 'completed',
        })
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

    it('resubscribes to a recreated run store after registry restart', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        emit(runEvent('running'))
        const listener = vi.fn()
        const unsubscribe = service.subscribeRun('run-1', listener)

        service.stop()
        service.start()
        emit(runEvent('running'))
        emit({
            actionId: 'build', command: 'npm test', context, runId: 'run-1', phase: 'main', rootActionId: 'build',
            status: 'running', type: 'action',
        })

        expect(listener).toHaveBeenCalledTimes(3)
        expect(getRun(service).logs).toHaveLength(1)
        unsubscribe()
        service.stop()
    })

    it('deletes a run draft when its terminal store is released', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        const draft = actionPromptDraftService.getDraft('build', context, 'run-1', { prepare: false })
        service.start()

        emit(runEvent('running'))
        emit(runEvent('completed'))

        expect(actionPromptDraftService.getDraft('build', context, 'run-1', { prepare: false })).not.toBe(draft)
        actionPromptDraftService.clearAll()
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

    it('retains concurrent stores for one action and removes only the terminal run', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()

        emit(runEvent('running'))
        emit({ ...runEvent('running'), runId: 'run-2' })

        expect(service.getActionRunStores('build', context).map(({ getSnapshot }) => getSnapshot().runId))
            .toEqual(['run-1', 'run-2'])
        expect(service.getActionRunStore('build', context)?.getSnapshot().runId).toBe('run-2')
        expect(service.getRunStore('run-1')?.getSnapshot().status).toBe('running')

        emit(runEvent('completed'))

        expect(service.getActionRunStores('build', context).map(({ getSnapshot }) => getSnapshot().runId))
            .toEqual(['run-2'])
        expect(service.getActionRunStore('build', context)?.getSnapshot().runId).toBe('run-2')
        expect(service.getRunStore('run-1')).toBeNull()
        expect(service.getRunStore('run-2')?.getSnapshot().status).toBe('running')
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
            update: { content: '', entryIndex: 1, kind: 'agentOutput', messageId: 'assistant-1', sequence: 2 },
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
            update: { content: '', entryIndex: 1, kind: 'agentOutput', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                entryIndex: 2,
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
            update: { content: 'Testing', entryIndex: 1, kind: 'agentOutput', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: '...', entryIndex: 1, kind: 'agentOutput', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                content: 'Testing passed', entryIndex: 1, kind: 'agentOutput', messageId: 'assistant-1',
                previousContent: 'Testing...', replace: true, sequence: 2,
            },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                entryIndex: 2,
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
            update: { content: 'Done', entryIndex: 3, kind: 'agentOutput', messageId: 'assistant-2', sequence: 4 },
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

    it('replaces keyed assistant and provider entries at supplied indexes without searching history', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const assistant = {
            content: 'draft', id: 'assistant-1', kind: 'message' as const, role: 'assistant' as const,
            sequence: 2, timestamp: 'now',
        }
        const providerEvent = {
            content: 'running', id: 'event-1', kind: 'event' as const, providerItemId: 'tool-1',
            sequence: 3, status: 'inProgress', timestamp: 'now', type: 'commandExecution',
        }
        const entries = [
            { content: 'prompt', id: 'user-1', kind: 'message' as const, role: 'user' as const, sequence: 1, timestamp: 'now' },
            assistant,
            providerEvent,
        ]
        entries.findIndex = vi.fn(() => { throw new Error('conversation history was scanned') })

        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation(entries), kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { content: ' complete', entryIndex: 1, kind: 'agentOutput', messageId: 'assistant-1', sequence: 2 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                entryIndex: 2,
                event: { ...providerEvent, content: 'completed', status: 'completed' },
                kind: 'agentEvent',
            },
        })

        expect(entries.findIndex).not.toHaveBeenCalled()
        expect(getRun(service).conversation?.entries[1]).toMatchObject({ content: 'draft complete', id: 'assistant-1' })
        expect(getRun(service).conversation?.entries[2]).toMatchObject({ content: 'completed', providerItemId: 'tool-1' })
        service.stop()
    })

    it('rejects malformed indexed transcript updates clearly', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const assistant = {
            content: 'draft', id: 'assistant-1', kind: 'message' as const, role: 'assistant' as const,
            sequence: 1, timestamp: 'now',
        }
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation([assistant]), kind: 'agentStarted' },
        })
        const base = {
            actionId: 'review', context, runId: 'run-1', phase: 'main' as const, rootActionId: 'review',
            status: 'running' as const, type: 'update' as const,
        }

        expect(() => emit({
            ...base,
            update: { content: 'x', kind: 'agentOutput', messageId: 'assistant-1', sequence: 1 },
        } as unknown as ActionRunEvent)).toThrow('Invalid conversation entry index: undefined')
        expect(() => emit({
            ...base,
            update: { content: 'x', entryIndex: 4, kind: 'agentOutput', messageId: 'assistant-1', sequence: 1 },
        })).toThrow('Conversation entry index out of range: 4')
        expect(() => emit({
            ...base,
            update: { content: 'x', entryIndex: 0, kind: 'agentOutput', messageId: 'wrong', sequence: 1 },
        })).toThrow('Assistant message identity mismatch at conversation entry index 0')
        expect(() => emit({
            ...base,
            update: {
                entryIndex: 0,
                event: {
                    content: '', id: 'event-1', kind: 'event', providerItemId: 'tool-1',
                    status: 'completed', timestamp: 'now', type: 'commandExecution',
                },
                kind: 'agentEvent',
            },
        })).toThrow('Provider event identity mismatch at conversation entry index 0')
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

    it('replaces live usage immutably without changing other run state', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const entries = [{ content: 'Review', id: 'message-1', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }]
        const approval = {
            filePaths: [], itemId: 'command-1', kind: 'commandExecution' as const, provider: 'codex' as const,
            requestId: 41, startedAtMs: 0, threadId: 'thread-1', turnId: 'turn-1',
        }

        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation(entries), kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'waitingForInput', type: 'update',
            update: { approval, kind: 'agentApproval' },
        })
        const previous = getRun(service)

        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
                kind: 'agentUsage',
                usage: { cachedInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 4, totalTokens: 10 },
            },
        })

        const current = getRun(service)
        const expectedUsage = { cachedInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 4, totalTokens: 10 }
        expect(current.conversation).not.toBe(previous.conversation)
        expect(current.conversation?.entries).toBe(previous.conversation?.entries)
        expect(current.conversation?.contextWindowUsage).toEqual({ capacityTokens: 258_400, usedTokens: 42_000 })
        expect(current.conversation?.usage).toEqual(expectedUsage)
        expect(current.approvals).toBe(previous.approvals)
        expect(current.logs).toBe(previous.logs)
        expect(current.status).toBe('waitingForInput')
        expect(current.conversation?.status).toBe('waitingForInput')

        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: {
                contextWindowUsage: { capacityTokens: 100_000, usedTokens: 25_000 },
                kind: 'agentUsage',
                usage: { cachedInputTokens: 2, inputTokens: 4, outputTokens: 6, reasoningTokens: 8, totalTokens: 20 },
            },
        })

        const replaced = getRun(service)
        expect(replaced.conversation).not.toBe(current.conversation)
        expect(current.conversation?.contextWindowUsage).toEqual({ capacityTokens: 258_400, usedTokens: 42_000 })
        expect(replaced.conversation?.contextWindowUsage).toEqual({ capacityTokens: 100_000, usedTokens: 25_000 })
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
            update: { kind: 'agentQuestionAnswer', requestId: 7, userMessage: nextMessage },
        })

        expect(getRun(service)).toMatchObject({
            conversation: { entries: [firstMessage, nextMessage], status: 'running' },
            question: null,
            status: 'running',
        })
        service.stop()
    })

    it('logs dismissal and clears only the matching question request', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const questions = [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }]
        const dismissedEvent = {
            content: '',
            id: 'dismissed-1',
            kind: 'event' as const,
            label: 'Questions dismissed',
            status: 'completed',
            timestamp: 'later',
            type: 'questionsDismissed',
        }

        emit({ actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'run' })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation([]), kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'waitingForInput', type: 'update',
            update: { kind: 'agentQuestion', questions, requestId: 8 },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'waitingForInput', type: 'update',
            update: { event: dismissedEvent, kind: 'agentQuestionDismissed', requestId: 7 },
        })

        expect(getRun(service)).toMatchObject({
            conversation: { entries: [dismissedEvent] },
            question: { questions, requestId: 8 },
            status: 'waitingForInput',
        })

        const matchingEvent = { ...dismissedEvent, id: 'dismissed-2' }
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { event: matchingEvent, kind: 'agentQuestionDismissed', requestId: 8 },
        })

        expect(getRun(service)).toMatchObject({
            conversation: { entries: [dismissedEvent, matchingEvent], status: 'running' },
            question: null,
            status: 'running',
        })
        service.stop()
    })

    it('keeps a newer question when a queued user message arrives', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        const questions = [{ header: 'Next', id: 'next', question: 'Next?' }]
        service.start()
        emit({ actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'run' })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { conversation: agentConversation([]), kind: 'agentStarted' },
        })
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'waitingForInput', type: 'update',
            update: { kind: 'agentQuestion', questions, requestId: 8 },
        })
        const queuedMessage = { content: 'Queued prompt', id: 'queued-1', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }
        emit({
            actionId: 'review', context, runId: 'run-1', phase: 'main', rootActionId: 'review', status: 'running', type: 'update',
            update: { kind: 'agentUserMessage', userMessage: queuedMessage },
        })

        expect(getRun(service)).toMatchObject({
            conversation: { entries: [queuedMessage], status: 'waitingForInput' },
            question: { questions, requestId: 8 },
            status: 'waitingForInput',
        })
        service.stop()
    })

    it('recovers an active waiting session and deduplicates events received during snapshot loading', async () => {
        let resolveSnapshot!: (events: ActionRunEvent[]) => void
        const snapshot = new Promise<ActionRunEvent[]>((resolve) => {
            resolveSnapshot = resolve
        })
        const { bridge, emit } = bridgeWithEvents({
            loadActionRunRecoverySnapshot: vi.fn(async () => ({
                activeRunEvents: await snapshot,
                terminalResults: [],
            })),
        })
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

    it('applies terminal result when run completes during disconnect and clears interaction state', async () => {
        const first = bridgeWithEvents({ startAction: vi.fn(async () => 'run-1') })
        setActionBridgeOverride(first.bridge)
        const service = new ActionRunRegistry()
        let resolveStarted!: (runId: string) => void
        const started = new Promise<string>((resolve) => {
            resolveStarted = resolve
        })
        const completion = service.startRun({ id: 'build' } as ActionDefinition, context, {}, resolveStarted)
        await started
        first.emit({ ...runEvent('running'), sequence: 1 })
        first.emit({
            actionId: 'build', context, interactionReady: true, runId: 'run-1', phase: 'main', rootActionId: 'build',
            sequence: 2, status: 'running', type: 'action',
        })
        first.emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', sequence: 3,
            status: 'waitingForInput', type: 'update',
            update: { kind: 'agentQuestion', questions: [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }], requestId: 7 },
        })
        const store = service.getRunStore('run-1')
        if (!store) throw new Error('Missing run store')
        const release = store.subscribe(vi.fn())
        const second = bridgeWithEvents({
            loadActionRunRecoverySnapshot: vi.fn(async () => ({
                activeRunEvents: [],
                terminalResults: [{
                    changedPaths: ['app/recovered.ts'], diagramPath: 'design/diagrams/recovered.json', failure: null,
                    runId: 'run-1', status: 'completed' as const,
                }],
            })),
        })

        setActionBridgeOverride(second.bridge)
        service.start()

        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({
            activeActionId: null,
            approvals: [],
            interactionReady: false,
            question: null,
            status: 'completed',
        }))
        expect(store.getSnapshot().logs[0]).toMatchObject({ message: 'build completed', status: 'completed' })
        expect(second.bridge.loadActionRunRecoverySnapshot).toHaveBeenCalledWith(['run-1'])
        await expect(completion).resolves.toMatchObject({changedPaths: ['app/recovered.ts'], diagramPath: 'design/diagrams/recovered.json', status: 'completed'})
        release()
        service.stop()
    })

    it('recovers tracked runs after the same bridge reconnects', async () => {
        const loadActionRunRecoverySnapshot = vi.fn()
            .mockResolvedValueOnce({ activeRunEvents: [], terminalResults: [] })
            .mockResolvedValue({
                activeRunEvents: [],
                terminalResults: [{ changedPaths: [], failure: null, runId: 'run-1', status: 'completed' }],
            })
        const { bridge, emit } = bridgeWithEvents({ loadActionRunRecoverySnapshot })
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        await vi.waitFor(() => expect(loadActionRunRecoverySnapshot).toHaveBeenCalledOnce())
        emit({ ...runEvent('running'), sequence: 1 })
        const store = service.getRunStore('run-1')
        if (!store) throw new Error('Missing run store')
        const release = store.subscribe(vi.fn())

        await service.recoverConnection()

        expect(bridge.onActionRun).toHaveBeenCalledOnce()
        expect(loadActionRunRecoverySnapshot).toHaveBeenLastCalledWith(['run-1'])
        expect(store.getSnapshot().status).toBe('completed')
        release()
        service.stop()
    })

    it('keeps live terminal event over older snapshot events during recovery', async () => {
        const first = bridgeWithEvents()
        setActionBridgeOverride(first.bridge)
        const service = new ActionRunRegistry()
        service.start()
        first.emit({ ...runEvent('running'), sequence: 1 })
        const store = service.getRunStore('run-1')
        if (!store) throw new Error('Missing run store')
        const release = store.subscribe(vi.fn())
        let resolveSnapshot!: (snapshot: Awaited<ReturnType<NonNullable<ElectronActionBridge['loadActionRunRecoverySnapshot']>>>) => void
        const snapshotPromise = new Promise<Awaited<ReturnType<NonNullable<ElectronActionBridge['loadActionRunRecoverySnapshot']>>>>((resolve) => {
            resolveSnapshot = resolve
        })
        const second = bridgeWithEvents({ loadActionRunRecoverySnapshot: vi.fn(() => snapshotPromise) })
        setActionBridgeOverride(second.bridge)
        service.start()
        second.emit({ ...runEvent('failed'), sequence: 3 })
        resolveSnapshot({
            activeRunEvents: [{ ...runEvent('running'), sequence: 1 }, { ...runEvent('waitingForInput'), sequence: 2 }],
            terminalResults: [],
        })

        await vi.waitFor(() => expect(store.getSnapshot().status).toBe('failed'))
        second.emit({ ...runEvent('running'), sequence: 4 })
        expect(store.getSnapshot().status).toBe('failed')
        release()
        service.stop()
    })

    it('fails and releases local interaction when authoritative recovery has no run state', async () => {
        const first = bridgeWithEvents()
        setActionBridgeOverride(first.bridge)
        const service = new ActionRunRegistry()
        service.start()
        first.emit({ ...runEvent('running'), sequence: 1 })
        const store = service.getRunStore('run-1')
        if (!store) throw new Error('Missing run store')
        const release = store.subscribe(vi.fn())
        const loadActionRunRecoverySnapshot = vi.fn(async () => ({ activeRunEvents: [], terminalResults: [] }))
        const second = bridgeWithEvents({ loadActionRunRecoverySnapshot })

        setActionBridgeOverride(second.bridge)
        service.start()

        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({
            activeActionId: null,
            interactionReady: false,
            question: null,
            status: 'failed',
        }))
        expect(store.getSnapshot().logs.at(-1)).toMatchObject({
            message: 'Action run state was lost during reconnection',
            stderr: 'Action run state was lost during reconnection',
        })
        release()
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

    it('replaces live conversation timer from authoritative agent state', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const runningTimer = { elapsedMs: 10_000, runningStartedAt: '2026-01-01T00:00:20.000Z' }

        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'update',
            update: {
                conversation: agentConversation([], {timer: { elapsedMs: 0, runningStartedAt: '2026-01-01T00:00:00.000Z' }}),
                kind: 'agentStarted',
            },
        })
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'waitingForInput',
            timer: { elapsedMs: 10_000, runningStartedAt: null }, type: 'agentState',
        })
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build', status: 'running',
            timer: runningTimer, type: 'agentState',
        })

        expect(getRun(service).conversation).toMatchObject({ status: 'running', timer: runningTimer })
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

    it('keeps a stable FIFO queue snapshot from granular events without changing waiting status', () => {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        const event = {
            actionId: 'build', context, runId: 'run-1', phase: 'main' as const, rootActionId: 'build',
            status: 'running' as const, type: 'update' as const,
        }
        const first = { content: 'First', dispatchState: 'queued' as const, id: 'prompt-1', revision: 0 }
        const second = { content: 'Second', dispatchState: 'queued' as const, id: 'prompt-2', revision: 0 }

        emit(runEvent('running'))
        emit({ ...event, update: { entry: first, kind: 'agentPromptQueued' } })
        emit({ ...event, update: { entry: second, kind: 'agentPromptQueued' } })
        emit({
            ...event,
            update: { entry: { ...second, content: 'Edited second', revision: 1 }, kind: 'agentPromptEdited' },
        })
        emit({
            actionId: 'build', context, runId: 'run-1', phase: 'main', rootActionId: 'build',
            status: 'waitingForInput', type: 'agentState',
        })
        emit({ ...event, update: { kind: 'agentPromptRemoved', promptId: first.id, revision: first.revision } })

        expect(getRun(service)).toMatchObject({
            queuedPrompts: [{ content: 'Edited second', id: 'prompt-2', revision: 1 }],
            status: 'waitingForInput',
        })

        const store = service.getRunStore('run-1')
        if (!store) throw new Error('Missing retained queue store')
        const release = store.subscribe(vi.fn())
        emit(runEvent('cancelled'))
        expect(store.getSnapshot().queuedPrompts).toEqual([])
        release()
        service.stop()
    })

})

describe('ActionRunRegistry prompt drafts', () => {
    afterEach(() => {
        actionPromptDraftService.clearAll()
        setActionBridgeOverride(null)
    })

    function startAgentRun() {
        const { bridge, emit } = bridgeWithEvents()
        setActionBridgeOverride(bridge)
        const service = new ActionRunRegistry()
        service.start()
        emit(runEvent('running'))
        emit({
            actionId: 'build', actionType: 'agent', context, interactionReady: true, phase: 'main',
            rootActionId: 'build', runId: 'run-1', status: 'running', type: 'action',
        })

        return { emit, service }
    }

    const endings: [string, ActionRunEvent][] = [
        ['an agent step ending in waitingForInput', {
            actionId: 'build', actionType: 'agent', context, interactionReady: false, phase: 'main',
            rootActionId: 'build', runId: 'run-1', status: 'waitingForInput', type: 'action',
        }],
        ['a completed run', runEvent('completed')],
        ['a failed run', runEvent('failed')],
        ['a cancelled run', runEvent('cancelled')],
    ]

    it.each(endings)('keeps user-edited prompt text after %s', (_name, endingEvent) => {
        const { emit } = startAgentRun()
        const draft = actionPromptDraftService.getDraft('build', context, 'run-1', { prepare: false })
        draft.edit('Typed while the agent was finishing')

        emit(endingEvent)

        expect(draft.getSnapshot()).toBe('Typed while the agent was finishing')
        expect(actionPromptDraftService.getDraft('build', context, 'run-1', { prepare: false })).toBe(draft)
    })

    it.each(endings)('drops an untouched prepared default after %s', async (_name, endingEvent) => {
        const { emit } = startAgentRun()
        const draft = actionPromptDraftService.getDraft('build', context, 'run-1', { prepare: true })
        await draft.prepare(async () => ({ prompt: 'Prepared default' }))

        emit(endingEvent)

        expect(draft.getSnapshot()).toBe('')
    })

    it('keeps text still buffered by the editor when a run ends', () => {
        const { emit } = startAgentRun()
        const draft = actionPromptDraftService.getDraft('build', context, 'run-1', { prepare: false })
        draft.markdownDraft.addEventListener('flushRequested', () => draft.edit('Buffered keystrokes'))

        emit(runEvent('completed'))

        expect(draft.getSnapshot()).toBe('Buffered keystrokes')
    })
})
