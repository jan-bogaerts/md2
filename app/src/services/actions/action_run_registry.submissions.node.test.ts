import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../data/action_context';
import type { ActionDefinition } from '../../data/action_types';
import type { ActionRunEvent } from '../../data/action_run_types';
import type { AgentConversation } from '../../data/data_types';
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge';
import { actionPromptDraftService } from './action_prompt_draft_service';
import { ActionRunRegistry } from './action_run_registry';

const context: ActionContext = { cardInternalId: 'card-1', file: 'design/card.md', kind: 'card' };
const action = { id: 'review', type: 'agent' } as ActionDefinition;
const conversation: AgentConversation = {
    actionId: action.id, cardInternalId: 'card-1', cardPath: context.file!, completedAt: null, entries: [],
    hasExplicitTitle: true, id: 'conversation-1', path: 'activity.json', providerSessions: [], startedAt: 'now',
    status: 'running', title: 'Review', viewed: true,
};
const eventBase = { actionId: action.id, context, phase: 'main' as const, rootActionId: action.id, runId: 'run-1' };

function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
    return { promise, resolve };
}

function setup(overrides: Partial<ElectronActionBridge> = {}) {
    let listener: ((event: ActionRunEvent) => void) | null = null;
    const bridge = {
        onActionRun: vi.fn((nextListener) => { listener = nextListener; return vi.fn(); }),
        ...overrides,
    } as unknown as ElectronActionBridge;
    setActionBridgeOverride(bridge);
    const registry = new ActionRunRegistry();
    registry.start();
    const emit = (event: ActionRunEvent) => {
        if (!listener) throw new Error('Missing run listener');
        listener(event);
    };
    return { bridge, emit, registry };
}

describe('registry-owned submissions', () => {
    afterEach(() => {
        setActionBridgeOverride(null);
        actionPromptDraftService.clearAll();
        vi.restoreAllMocks();
    });

    it('keeps submissions when observers detach and the same card context is replaced', () => {
        const { registry } = setup();
        const originalListener = vi.fn();
        const detach = registry.subscribeSubmissions(action.id, context, originalListener);
        const id = registry.beginSubmission(action.id, context, 'Start now', null, conversation.id);
        detach();
        const replacement = { ...context, file: 'design/renamed.md', state: 'ready', title: 'Renamed' };
        const nextListener = vi.fn();
        const unrelatedListener = vi.fn();
        const detachNext = registry.subscribeSubmissions(action.id, replacement, nextListener);
        const detachOther = registry.subscribeSubmissions(action.id, { ...context, cardInternalId: 'card-2' }, unrelatedListener);
        expect(registry.getSubmissions(action.id, replacement)).toBe(registry.getSubmissions(action.id, context));
        expect(registry.getVisibleSubmissions(action.id, replacement, null, 'run-1')).toMatchObject([{ id, content: 'Start now' }]);
        expect(registry.getVisibleSubmissions(action.id, replacement, 'other-conversation', 'run-1')).toEqual([]);
        registry.failSubmission(id, 'Backend unavailable');
        expect(originalListener).toHaveBeenCalledTimes(1);
        expect(nextListener).toHaveBeenCalledTimes(1);
        expect(unrelatedListener).not.toHaveBeenCalled();
        expect(registry.getSubmissions(action.id, replacement)).toMatchObject([{ error: 'Backend unavailable', state: 'failed' }]);
        detachNext();
        detachOther();
        registry.stop();
    });

    it.each(['start', 'restart'] as const)('accepts an early user-message acknowledgement before %s returns', async (operation) => {
        const response = deferred<string>();
        const { registry, emit } = setup({ startAction: vi.fn(() => response.promise), restartActionRun: vi.fn(() => response.promise) });
        const id = registry.beginSubmission(action.id, context, 'Continue', null, conversation.id);
        const input = { conversationId: conversation.id, prompt: 'Continue', submissionId: id };
        const started = vi.fn();
        const completion = operation === 'start'
            ? registry.startRun(action, context, input, started)
            : registry.restartRun('previous-run', action, context, input, started);
        emit({ ...eventBase, status: 'running', type: 'update', update: { continued: true, conversation, kind: 'agentStarted' } });
        const release = registry.getRunStore('run-1')!.subscribe(vi.fn());
        emit({
            ...eventBase, status: 'running', type: 'update',
            update: { kind: 'agentUserMessage', userMessage: { content: 'Continue', id, kind: 'message', role: 'user', timestamp: 'now' } },
        });
        expect(registry.getSubmissions(action.id, context)).toEqual([]);
        response.resolve('run-1');
        await response.promise;
        expect(started).toHaveBeenCalledWith('run-1');
        emit({ ...eventBase, status: 'completed', type: 'run' });
        await expect(completion).resolves.toMatchObject({ status: 'completed' });
        expect(registry.getRunStore('run-1')?.getSnapshot().conversation?.entries).toMatchObject([{ id, content: 'Continue' }]);
        release();
        registry.stop();
    });

    it('keeps a submission visible when startup returns before its acknowledgement', async () => {
        const response = deferred<string>();
        const { registry, emit } = setup({ startAction: vi.fn(() => response.promise) });
        const id = registry.beginSubmission(action.id, context, 'Start now', null, conversation.id);
        const completion = registry.startRun(action, context, { conversationId: conversation.id, prompt: 'Start now', submissionId: id });
        response.resolve('run-1');
        await response.promise;
        expect(registry.getVisibleSubmissions(action.id, context, conversation.id, 'run-1')).toMatchObject([{ id, state: 'transmitting' }]);
        emit({ ...eventBase, status: 'running', type: 'update', update: { continued: false, conversation, kind: 'agentStarted' } });
        emit({
            ...eventBase, status: 'running', type: 'update',
            update: { kind: 'agentUserMessage', userMessage: { content: 'Start now', id, kind: 'message', role: 'user', timestamp: 'now' } },
        });
        expect(registry.getSubmissions(action.id, context)).toEqual([]);
        emit({ ...eventBase, status: 'completed', type: 'run' });
        await completion;
        registry.stop();
    });

    it('matches identical queued submissions by ID and preserves each until acknowledged or deleted', async () => {
        const { registry, emit } = setup({enqueueActionPrompt: vi.fn(async (_runId, content, id) => ({ content, dispatchState: 'queued' as const, id, revision: 0 }))});
        const first = registry.beginSubmission(action.id, context, 'Repeat', 'run-1', conversation.id);
        const second = registry.beginSubmission(action.id, context, 'Repeat', 'run-1', conversation.id);
        await registry.enqueueSubmission(second);
        await registry.enqueueSubmission(first);
        expect(registry.getSubmissions(action.id, context).map(({ id, prompt }) => [id, prompt?.id])).toEqual([
            [first, first], [second, second],
        ]);
        emit({ ...eventBase, status: 'running', type: 'update', update: { kind: 'agentPromptDispatched', promptId: first, revision: 0 } });
        expect(registry.getSubmissions(action.id, context)[0].state).toBe('queued');
        emit({
            ...eventBase, status: 'running', type: 'update',
            update: { kind: 'agentUserMessage', userMessage: { content: 'Repeat', id: first, kind: 'message', role: 'user', timestamp: 'now' } },
        });
        expect(registry.getSubmissions(action.id, context).map(({ id }) => id)).toEqual([second]);
        emit({ ...eventBase, status: 'running', type: 'update', update: { kind: 'agentPromptDeleted', promptId: second, revision: 0 } });
        expect(registry.getSubmissions(action.id, context)).toEqual([]);
        registry.stop();
    });

    it('does not resurrect a sent submission when the queue response arrives later', async () => {
        const response = deferred<void>();
        const { registry, emit } = setup({
            enqueueActionPrompt: vi.fn(async (_runId, content, id) => {
                await response.promise;
                return { content, dispatchState: 'queued' as const, id, revision: 0 };
            }),
        });
        const id = registry.beginSubmission(action.id, context, 'Send', 'run-1', conversation.id);
        const sending = registry.enqueueSubmission(id);
        emit({
            ...eventBase, status: 'running', type: 'update',
            update: { kind: 'agentUserMessage', userMessage: { content: 'Send', id, kind: 'message', role: 'user', timestamp: 'now' } },
        });
        response.resolve();
        await sending;
        expect(registry.getSubmissions(action.id, context)).toEqual([]);
        registry.stop();
    });

    it('retains failed text after a queue rejection or a run ending before sending', async () => {
        const { registry, emit } = setup({ enqueueActionPrompt: vi.fn(async () => { throw new Error('Queue unavailable'); }) });
        const first = registry.beginSubmission(action.id, context, 'First', 'run-1', conversation.id);
        const second = registry.beginSubmission(action.id, context, 'Second', 'run-1', conversation.id);
        await registry.enqueueSubmission(first);
        emit({ ...eventBase, status: 'failed', type: 'run' });
        expect(registry.getSubmissions(action.id, context)).toMatchObject([
            { content: 'First', error: 'Queue unavailable', id: first, state: 'failed' },
            { content: 'Second', error: 'Run ended before the prompt was sent', id: second, state: 'failed' },
        ]);
        registry.stop();
    });

    it('marks an unacknowledged submission failed when the run ends before the startup response', async () => {
        const response = deferred<string>();
        const { registry, emit } = setup({ startAction: vi.fn(() => response.promise) });
        const id = registry.beginSubmission(action.id, context, 'Start now', null, conversation.id);
        const completion = registry.startRun(action, context, { conversationId: conversation.id, prompt: 'Start now', submissionId: id });
        emit({ ...eventBase, status: 'cancelled', type: 'run' });
        response.resolve('run-1');
        await completion;
        expect(registry.getSubmissions(action.id, context)).toMatchObject([{ id, state: 'failed' }]);
        registry.stop();
    });

    it('retains submitted text when the startup request rejects', async () => {
        const failure = new Error('Startup unavailable');
        const { registry } = setup({ startAction: vi.fn(async () => { throw failure; }) });
        const id = registry.beginSubmission(action.id, context, 'Start now', null, conversation.id);
        await expect(registry.startRun(action, context, { prompt: 'Start now', submissionId: id })).rejects.toBe(failure);
        expect(registry.getSubmissions(action.id, context)).toMatchObject([{ content: 'Start now', error: failure.message, id, state: 'failed' }]);
        registry.stop();
    });

    it('retains failed text when recovery reports that its run ended', async () => {
        const { bridge, emit, registry } = setup();
        emit({ ...eventBase, status: 'running', type: 'run' });
        const id = registry.beginSubmission(action.id, context, 'Send', 'run-1', conversation.id);
        bridge.loadActionRunRecoverySnapshot = vi.fn(async () => ({
            activeRunEvents: [],
            terminalResults: [{ changedPaths: [], failure: 'Connection lost', runId: 'run-1', status: 'failed' as const }],
        }));
        await registry.recoverConnection();
        expect(registry.getSubmissions(action.id, context)).toMatchObject([{ content: 'Send', error: 'Connection lost', id, state: 'failed' }]);
        registry.stop();
    });

    it('does not restore submissions from a late queue response after the registry stops', async () => {
        const response = deferred<void>();
        const { registry } = setup({
            enqueueActionPrompt: vi.fn(async (_runId, content, id) => {
                await response.promise;
                return { content, dispatchState: 'queued' as const, id, revision: 0 };
            }),
        });
        const id = registry.beginSubmission(action.id, context, 'Send', 'run-1', conversation.id);
        const sending = registry.enqueueSubmission(id);
        registry.stop();
        response.resolve();
        await sending;
        expect(registry.getSubmissions(action.id, context)).toEqual([]);
    });
});
