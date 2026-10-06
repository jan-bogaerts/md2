import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createAgentStreamingAdapter } = require('./agent_streaming_adapter');
const { AgentRunnerService } = require('./agent_runner_service');
const { createRun } = require('./agent_run_state');

function adapterHarness(provider) {
    const writes = [];
    const events = [];
    const adapter = createAgentStreamingAdapter(provider, (message) => writes.push(message), (event) => events.push(event), 'C:/repo', 'session-1');
    return { adapter, events, writes };
}

async function initializeCodex(adapter) {
    await adapter.startSession();
    await adapter.handleMessage({ id: 1, result: {} });
    await adapter.handleMessage({ id: 3, result: { thread: { id: 'session-1' } } });
}

function compactRun() {
    const events = [];
    const persist = vi.fn(async () => undefined);
    const service = new AgentRunnerService({ persistConversationCheckpoint: persist });
    const conversation = {
        entries: [{ content: 'old transcript', id: 'message-1', kind: 'message', role: 'assistant' }],
        id: 'conversation-1', providerSessions: [], status: 'waitingForInput',
        usage: { cachedInputTokens: 0, inputTokens: 100, outputTokens: 20, reasoningTokens: 0, totalTokens: 120 },
    };
    const run = createRun({
        agent: 'codex', child: { stdin: { end: vi.fn() } }, conversation, id: 'run-1', nextSequence: 1,
        onEvent: (event) => events.push(event), request: {}, rootPath: 'C:/repo', streaming: true,
    });
    run.turnActive = false;
    run.sessionReady = true;
    run.streamingAdapter = { compact: vi.fn(async () => undefined) };
    service.processes.set(run.id, run);
    return { events, persist, run, service };
}

afterEach(() => vi.useRealTimers());

describe('provider compaction', () => {
    it('resumes Codex without a prompt and waits for lifecycle confirmation after acknowledgement', async () => {
        const { adapter, writes, events } = adapterHarness('codex');
        await initializeCodex(adapter);
        expect(writes.some(({ method }) => method === 'turn/start' || method === 'turn/steer')).toBe(false);
        await adapter.compact();
        const request = writes.at(-1);
        expect(request).toMatchObject({ method: 'thread/compact/start', params: { threadId: 'session-1' } });
        await adapter.handleMessage({ id: request.id, result: {} });
        expect(events.some(({ type }) => type === 'turnCompleted')).toBe(false);
        await adapter.handleMessage({ method: 'turn/started', params: { threadId: 'session-1', turn: { id: 'compact-turn' } } });
        const item = { id: 'compact-item', type: 'contextCompaction' };
        await adapter.handleMessage({ method: 'item/started', params: { threadId: 'session-1', item } });
        await adapter.handleMessage({ method: 'item/completed', params: { threadId: 'session-1', item } });
        await adapter.handleMessage({method: 'turn/completed', params: { threadId: 'session-1', turn: { id: 'compact-turn', status: 'completed' } }});
        expect(events.at(-1)).toMatchObject({ compaction: { confirmed: true }, type: 'turnCompleted' });
        await adapter.sendMessage('next prompt');
        expect(writes.at(-1)).toMatchObject({ method: 'turn/start', params: { threadId: 'session-1' } });
    });

    it('reports Codex rejection without claiming completion', async () => {
        const { adapter, events, writes } = adapterHarness('codex');
        await initializeCodex(adapter);
        await adapter.compact();
        await adapter.handleMessage({ id: writes.at(-1).id, error: { message: 'No history' } });
        expect(events.at(-1)).toEqual({ error: 'No history', type: 'compactRejected' });
    });

    it.each([true, false])('Claude waits for result and distinguishes boundary presence: %s', async (confirmed) => {
        vi.useFakeTimers();
        const { adapter, events, writes } = adapterHarness('claude');
        await adapter.startSession();
        expect(writes[0]).toMatchObject({ request: { subtype: 'initialize' }, type: 'control_request' });
        await adapter.handleMessage({ type: 'control_response', response: { request_id: 'compact-initialize', subtype: 'success' } });
        await adapter.compact();
        expect(writes.at(-1)).toEqual({ message: { content: '/compact', role: 'user' }, type: 'user' });
        if (confirmed) await adapter.handleMessage({ session_id: 'session-1', subtype: 'compact_boundary', type: 'system' });
        expect(events.some(({ type }) => type === 'turnCompleted')).toBe(false);
        await adapter.handleMessage({ type: 'result', subtype: 'success', result: confirmed ? 'Compacted' : 'Not enough messages to compact.' });
        const usageRequest = writes.at(-1);
        await adapter.handleMessage({type: 'control_response', response: {request_id: usageRequest.request_id, subtype: 'success', response: { maxTokens: 1000, totalTokens: 100 }}});
        expect(events.at(-1)).toMatchObject({
            compaction: { confirmed, explanation: confirmed ? 'Compacted' : 'Not enough messages to compact.' },
            contextWindowUsage: { capacityTokens: 1000, usedTokens: 100 }, type: 'turnCompleted',
        });
        expect(events.filter(({ type }) => type === 'event')).toHaveLength(confirmed ? 1 : 0);
    });

    it('Claude preserves provider failure for the scheduler', async () => {
        const { adapter, events } = adapterHarness('claude');
        await adapter.compact();
        await adapter.handleMessage({ type: 'result', is_error: true, result: 'Compaction rejected' });
        expect(events.at(-1)).toMatchObject({ error: 'Compaction rejected', compaction: { confirmed: false } });
    });
});

describe('AgentRunnerService compact dispatch', () => {
    it('rejects mismatched target and provider before writing a command', async () => {
        const { run, service } = compactRun();
        await expect(service.compact(run.id, { conversationId: 'another-conversation', provider: 'codex' }))
            .rejects.toThrow('Compact target does not match');
        await expect(service.compact(run.id, { conversationId: run.conversation.id, provider: 'claude' }))
            .rejects.toThrow('Compact target does not match');
        expect(run.streamingAdapter.compact).not.toHaveBeenCalled();
    });

    it('requires initialization, idle turn, and no question or approval', () => {
        const { run, service } = compactRun();
        expect(service.canCompact(run.id)).toBe(true);
        run.sessionReady = false;
        expect(service.canCompact(run.id)).toBe(false);
        run.sessionReady = true;
        run.turnActive = true;
        expect(service.canCompact(run.id)).toBe(false);
        run.turnActive = false;
        run.waitingForQuestion = true;
        expect(service.canCompact(run.id)).toBe(false);
        run.waitingForQuestion = false;
        run.pendingApprovals.set(1, {});
        expect(service.canCompact(run.id)).toBe(false);
    });

    it('persists confirmed event and usage before notifying completion, without removing transcript', async () => {
        const { events, persist, run, service } = compactRun();
        await service.compact(run.id, { conversationId: run.conversation.id, provider: run.agent, requestId: 'compact-1' });
        const checkpoint = Promise.withResolvers();
        persist.mockImplementation(async () => checkpoint.promise);
        await service.handleStreamingEvent(run.id, {
            type: 'event', event: {
                content: 'Context compacted', label: 'Context compacted', providerItemId: 'compact-1',
                status: 'completed', type: 'contextCompaction',
            },
        });
        const completion = service.handleStreamingEvent(run.id, {type: 'turnCompleted', compaction: { confirmed: true }, contextWindowUsage: { capacityTokens: 1000, usedTokens: 50 }});
        expect(events.some(({ type }) => type === 'compactSettled')).toBe(false);
        checkpoint.resolve();
        await completion;
        expect(events.at(-1)).toMatchObject({ error: null, requestId: 'compact-1', type: 'compactSettled' });
        expect(run.conversation.entries[0].content).toBe('old transcript');
        expect(run.conversation.entries.at(-1).type).toBe('contextCompaction');
        expect(run.conversation.usage.totalTokens).toBe(120);
        expect(run.conversation.contextWindowUsage.usedTokens).toBe(50);
        expect(run.activeCompact).toBeNull();
    });

    it('does not emit success when checkpoint persistence fails', async () => {
        const { events, persist, run, service } = compactRun();
        await service.compact(run.id, { conversationId: run.conversation.id, provider: run.agent, requestId: 'compact-1' });
        persist.mockRejectedValue(new Error('Checkpoint unavailable'));
        await expect(service.handleStreamingEvent(run.id, { type: 'turnCompleted', compaction: { confirmed: true } }))
            .rejects.toThrow('Checkpoint unavailable');
        expect(events.some(({ type }) => type === 'compactSettled')).toBe(false);
    });

    it('restores saved unanswered questions instead of allowing compact to bypass them', async () => {
        const { service, run } = compactRun();
        run.restoredQuestions = true;
        run.waitingForQuestion = true;
        run.pendingQuestionRequestId = 'restored:conversation-1';
        run.pendingQuestions = [{ id: 'question-1', question: 'Continue?' }];
        run.streamingAdapter.dismissQuestion = vi.fn();
        await service.handleStreamingEvent(run.id, { type: 'sessionReady' });
        expect(service.canCompact(run.id)).toBe(false);
        await service.dismissQuestions(run.id, 'restored:conversation-1');
        expect(run.streamingAdapter.dismissQuestion).not.toHaveBeenCalled();
        expect(service.canCompact(run.id)).toBe(true);
    });
});
