import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createAgentStreamingAdapter } = require('./agent_streaming_adapter');

function harness(agent) {
    const events = [];
    const writes = [];
    const adapter = createAgentStreamingAdapter(agent, (message) => writes.push(message), (event) => events.push(event), 'C:\\repo');

    return { adapter, events, writes };
}

describe('ClaudeStreamingAdapter', () => {
    it('writes multiple user turns and treats each result as a turn boundary', () => {
        const { adapter, events, writes } = harness('claude');

        adapter.start('plan');
        adapter.handleMessage({ session_id: 'session-1', subtype: 'init', type: 'system' });
        adapter.handleMessage({ message: { content: [{ text: 'proposal', type: 'text' }] }, type: 'assistant' });
        adapter.handleMessage({ total_cost_usd: 0.01, type: 'result', usage: { input_tokens: 4, output_tokens: 2 } });
        adapter.sendMessage('approved');

        expect(writes).toEqual([
            { message: { content: 'plan', role: 'user' }, type: 'user' },
            { message: { content: 'approved', role: 'user' }, type: 'user' },
        ]);
        expect(events).toContainEqual({ conversationId: 'session-1', type: 'sessionStarted' });
        expect(events).toContainEqual({ content: 'proposal', type: 'assistant' });
        expect(events.at(-1)).toMatchObject({ error: null, type: 'turnCompleted' });
    });

    it('maps structured questions and sends answers as a user turn', () => {
        const { adapter, events, writes } = harness('claude');
        const questions = [{ header: 'Confirm', id: 'confirm', options: [{ label: 'Yes' }], question: 'Proceed?' }];

        adapter.handleMessage({
            message: { content: [{ id: 'tool-1', input: { questions }, name: 'AskUserQuestion', type: 'tool_use' }], id: 'message-1' },
            type: 'assistant',
        });
        adapter.answerQuestion('message-1', { confirm: ['Yes'] });

        expect(events).toContainEqual({ questions, requestId: 'message-1', type: 'question' });
        expect(writes.at(-1)).toEqual({ message: { content: 'confirm: Yes', role: 'user' }, type: 'user' });
    });
});

describe('CodexStreamingAdapter', () => {
    it('initializes, starts one thread, then starts and steers a turn', () => {
        const { adapter, events, writes } = harness('codex');

        adapter.start('plan');
        expect(writes[0]).toMatchObject({ id: 1, method: 'initialize' });
        adapter.handleMessage({ id: 1, result: { userAgent: 'codex' } });
        expect(writes[1]).toEqual({ method: 'initialized', params: {} });
        expect(writes[2]).toMatchObject({ id: 2, method: 'thread/start', params: { cwd: 'C:\\repo' } });
        adapter.handleMessage({ id: 2, result: { thread: { id: 'thread-1' } } });
        expect(writes[3]).toMatchObject({
            method: 'turn/start',
            params: { input: [{ text: 'plan', type: 'text' }], threadId: 'thread-1' },
        });
        adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        adapter.sendMessage('extra detail');
        expect(writes[4]).toMatchObject({
            method: 'turn/steer',
            params: {
                expectedTurnId: 'turn-1',
                input: [{ text: 'extra detail', type: 'text' }],
                threadId: 'thread-1',
            },
        });
        expect(events).toContainEqual({ conversationId: 'thread-1', type: 'sessionStarted' });
    });

    it('maps deltas, usage, file changes, questions, and turn completion', () => {
        const { adapter, events, writes } = harness('codex');
        adapter.start('plan');
        adapter.handleMessage({ id: 1, result: {} });
        adapter.handleMessage({ id: 2, result: { thread: { id: 'thread-1' } } });
        adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        adapter.handleMessage({ method: 'item/agentMessage/delta', params: { delta: 'hello' } });
        const last = { cachedInputTokens: 2, inputTokens: 4, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 10 };
        adapter.handleMessage({
            method: 'thread/tokenUsage/updated',
            params: { tokenUsage: { last } },
        });
        adapter.handleMessage({
            method: 'item/completed',
            params: { item: { changes: [{ path: 'design\\feature.md' }], type: 'fileChange' } },
        });
        const questions = [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }];
        adapter.handleMessage({ id: 99, method: 'item/tool/requestUserInput', params: { questions } });
        adapter.answerQuestion(99, { confirm: ['Yes'] });
        adapter.handleMessage({ method: 'turn/completed', params: { turn: { status: 'completed' } } });

        expect(events).toContainEqual({ content: 'hello', type: 'assistant' });
        expect(events).toContainEqual({ paths: ['design/feature.md'], type: 'changedPaths' });
        expect(events).toContainEqual({ questions, requestId: 99, type: 'question' });
        expect(events.at(-1)).toMatchObject({
            error: null,
            type: 'turnCompleted',
            usage: { cachedInputTokens: 2, inputTokens: 4, outputTokens: 3, reasoningTokens: 1, totalTokens: 10 },
        });
        expect(writes.at(-1)).toEqual({ id: 99, result: { answers: { confirm: { answers: ['Yes'] } } } });
    });

    it('reports request errors and rejects use before thread setup', () => {
        const { adapter, events } = harness('codex');

        expect(() => adapter.sendMessage('early')).toThrow('Codex streaming thread is not ready');
        adapter.start('plan');
        adapter.handleMessage({ error: { message: 'initialize failed' }, id: 1 });

        expect(events).toContainEqual({ content: 'initialize failed', type: 'error' });
    });
});
