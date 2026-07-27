import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createAgentStreamingAdapter } = require('./agent_streaming_adapter');

function harness(agent, providerConversationId = null) {
    const events = [];
    const writes = [];
    const adapter = createAgentStreamingAdapter(
        agent,
        (message) => writes.push(message),
        (event) => events.push(event),
        'C:\\repo',
        providerConversationId,
    );

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

    it('correlates structured question answers through the Claude control protocol', () => {
        const { adapter, events, writes } = harness('claude');
        const questions = [{ header: 'Confirm', options: [{ label: 'Yes' }], question: 'Proceed?' }];

        adapter.handleMessage({
            request: {
                input: { questions },
                subtype: 'can_use_tool',
                tool_name: 'AskUserQuestion',
                tool_use_id: 'tool-1',
            },
            request_id: 'request-1',
            type: 'control_request',
        });
        adapter.answerQuestion('request-1', { 'claude-question-0': ['Yes'] });

        expect(events).toContainEqual({
            questions: [{ ...questions[0], id: 'claude-question-0' }],
            requestId: 'request-1',
            type: 'question',
        });
        expect(writes.at(-1)).toEqual({
            response: {
                request_id: 'request-1',
                response: {
                    behavior: 'allow',
                    toolUseID: 'tool-1',
                    updatedInput: { answers: { 'Proceed?': ['Yes'] }, questions },
                },
                subtype: 'success',
            },
            type: 'control_response',
        });
    });

    it('maps root-confined file changes and tool transcript events', () => {
        const { adapter, events } = harness('claude');

        adapter.handleMessage({
            message: {
                content: [
                    { input: { file_path: 'design\\feature.md' }, name: 'Write', type: 'tool_use' },
                    { input: { file_path: 'C:\\outside\\secret.md' }, name: 'Edit', type: 'tool_use' },
                ],
            },
            type: 'assistant',
        });
        adapter.handleMessage({
            message: { content: [{ content: 'written', tool_use_id: 'tool-1', type: 'tool_result' }] },
            type: 'user',
        });

        expect(events).toContainEqual({ paths: ['design/feature.md'], type: 'changedPaths' });
        expect(events).toContainEqual({
            content: '{"file_path":"design\\\\feature.md"}',
            eventType: 'tool.Write',
            type: 'transcript',
        });
        expect(events).toContainEqual({ content: 'written', eventType: 'tool.result', type: 'transcript' });
    });

    it('reports only structured pre-turn missing-session results as resumable', () => {
        const missing = harness('claude', 'session-missing');
        missing.adapter.handleMessage({
            errors: ['No conversation found with session ID: session-missing'],
            is_error: true,
            session_id: 'session-missing',
            subtype: 'error_during_execution',
            type: 'result',
        });
        const started = harness('claude', 'session-missing');
        started.adapter.handleMessage({ message: { content: [{ text: 'started', type: 'text' }] }, type: 'assistant' });
        started.adapter.handleMessage({
            errors: ['No conversation found with session ID: session-missing'],
            is_error: true,
            session_id: 'session-missing',
            subtype: 'error_during_execution',
            type: 'result',
        });

        expect(missing.events.at(-1)).toMatchObject({ missingSession: true, type: 'turnCompleted' });
        expect(started.events.at(-1)).toMatchObject({ missingSession: false, type: 'turnCompleted' });
        expect(started.events).toContainEqual({ type: 'turnStarted' });
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

    it('resumes a saved thread before sending the first turn', () => {
        const { adapter, events, writes } = harness('codex', 'thread-saved');

        adapter.start('new context');
        adapter.handleMessage({ id: 1, result: {} });
        expect(writes[2]).toMatchObject({
            id: 2,
            method: 'thread/resume',
            params: { cwd: 'C:\\repo', threadId: 'thread-saved' },
        });
        adapter.handleMessage({ id: 2, result: { thread: { id: 'thread-saved' } } });

        expect(events).toContainEqual({ conversationId: 'thread-saved', type: 'sessionStarted' });
        expect(writes[3]).toMatchObject({
            method: 'turn/start',
            params: { input: [{ text: 'new context', type: 'text' }], threadId: 'thread-saved' },
        });
    });

    it('reports a structured missing saved thread before any turn starts', () => {
        const { adapter, events } = harness('codex', 'thread-missing');

        adapter.start('new context');
        adapter.handleMessage({ id: 1, result: {} });
        adapter.handleMessage({
            error: {
                code: -32600,
                message: 'no rollout found for thread id thread-missing',
            },
            id: 2,
        });

        expect(events.at(-1)).toEqual({
            content: 'no rollout found for thread id thread-missing',
            missingSession: true,
            type: 'sessionFailed',
        });
    });

    it('reports request errors and rejects use before thread setup', () => {
        const { adapter, events } = harness('codex');

        expect(() => adapter.sendMessage('early')).toThrow('Codex streaming thread is not ready');
        adapter.start('plan');
        adapter.handleMessage({ error: { message: 'initialize failed' }, id: 1 });

        expect(events).toContainEqual({ content: 'initialize failed', type: 'error' });
    });
});
