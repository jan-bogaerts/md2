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
    it('writes multiple user turns and treats each result as a turn boundary', async () => {
        const { adapter, events, writes } = harness('claude');

        await adapter.start('plan');
        await adapter.handleMessage({ session_id: 'session-1', subtype: 'init', type: 'system' });
        await adapter.handleMessage({ message: { content: [{ text: 'proposal', type: 'text' }] }, type: 'assistant' });
        await adapter.handleMessage({ total_cost_usd: 0.01, type: 'result', usage: { input_tokens: 4, output_tokens: 2 } });
        await adapter.sendMessage('approved');

        expect(writes).toEqual([
            { message: { content: 'plan', role: 'user' }, type: 'user' },
            { message: { content: 'approved', role: 'user' }, type: 'user' },
        ]);
        expect(events).toContainEqual({ conversationId: 'session-1', type: 'sessionStarted' });
        expect(events).toContainEqual({ content: 'proposal', type: 'assistant' });
        expect(events.at(-1)).toMatchObject({ error: null, type: 'turnCompleted' });
    });

    it('correlates structured question answers through the Claude control protocol', async () => {
        const { adapter, events, writes } = harness('claude');
        const questions = [{ header: 'Confirm', options: [{ label: 'Yes' }], question: 'Proceed?' }];

        await adapter.handleMessage({
            request: {
                input: { questions },
                subtype: 'can_use_tool',
                tool_name: 'AskUserQuestion',
                tool_use_id: 'tool-1',
            },
            request_id: 'request-1',
            type: 'control_request',
        });
        await adapter.answerQuestion('request-1', { 'claude-question-0': ['Yes'] });

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

    it('maps root-confined file changes and tool transcript events', async () => {
        const { adapter, events } = harness('claude');

        await adapter.handleMessage({
            message: {
                content: [
                    { input: { file_path: 'design\\feature.md' }, name: 'Write', type: 'tool_use' },
                    { input: { file_path: 'C:\\outside\\secret.md' }, name: 'Edit', type: 'tool_use' },
                ],
            },
            type: 'assistant',
        });
        await adapter.handleMessage({
            message: { content: [{ content: 'written', tool_use_id: 'tool-1', type: 'tool_result' }] },
            type: 'user',
        });

        expect(events).toContainEqual({ paths: ['design/feature.md'], type: 'changedPaths' });
        expect(events).toContainEqual({
            content: '{"file_path":"design\\\\feature.md"}',
            toolType: 'tool.Write',
            type: 'transcript',
        });
        expect(events).toContainEqual({ content: 'written', toolType: 'tool.result', type: 'transcript' });
    });

    it('reports only structured pre-turn missing-session results as resumable', async () => {
        const missing = harness('claude', 'session-missing');
        await missing.adapter.handleMessage({
            errors: ['No conversation found with session ID: session-missing'],
            is_error: true,
            session_id: 'session-missing',
            subtype: 'error_during_execution',
            type: 'result',
        });
        const started = harness('claude', 'session-missing');
        await started.adapter.handleMessage({ message: { content: [{ text: 'started', type: 'text' }] }, type: 'assistant' });
        await started.adapter.handleMessage({
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

    it('separates assistant messages within a turn and restarts the separator each turn', async () => {
        const { adapter, events } = harness('claude');
        const assistantMessage = (text) => ({ message: { content: [{ text, type: 'text' }] }, type: 'assistant' });

        await adapter.handleMessage(assistantMessage('first'));
        await adapter.handleMessage(assistantMessage('second'));
        await adapter.handleMessage({ type: 'result' });
        await adapter.handleMessage(assistantMessage('next turn'));

        const assistantEvents = events.filter(({ type }) => type === 'assistant');
        expect(assistantEvents).toEqual([
            { content: 'first', type: 'assistant' },
            { content: '\n\nsecond', type: 'assistant' },
            { content: 'next turn', type: 'assistant' },
        ]);
    });
});

describe('CodexStreamingAdapter', () => {
    it('initializes, starts one thread, then starts and steers a turn', async () => {
        const { adapter, events, writes } = harness('codex');

        await adapter.start('plan');
        expect(writes[0]).toMatchObject({ id: 1, method: 'initialize' });
        await adapter.handleMessage({ id: 1, result: { userAgent: 'codex' } });
        expect(writes[1]).toEqual({ method: 'initialized', params: {} });
        expect(writes[2]).toMatchObject({ id: 2, method: 'thread/start', params: { cwd: 'C:\\repo' } });
        await adapter.handleMessage({ id: 2, result: { thread: { id: 'thread-1' } } });
        expect(writes[3]).toMatchObject({
            method: 'turn/start',
            params: { input: [{ text: 'plan', type: 'text' }], threadId: 'thread-1' },
        });
        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.sendMessage('extra detail');
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

    it('maps deltas, usage, file changes, questions, and turn completion', async () => {
        const { adapter, events, writes } = harness('codex');
        await adapter.start('plan');
        await adapter.handleMessage({ id: 1, result: {} });
        await adapter.handleMessage({ id: 2, result: { thread: { id: 'thread-1' } } });
        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.handleMessage({ method: 'item/agentMessage/delta', params: { delta: 'hello' } });
        const last = { cachedInputTokens: 2, inputTokens: 4, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 10 };
        await adapter.handleMessage({
            method: 'thread/tokenUsage/updated',
            params: { tokenUsage: { last } },
        });
        await adapter.handleMessage({
            method: 'item/completed',
            params: { item: { changes: [{ path: 'design\\feature.md' }], type: 'fileChange' } },
        });
        const questions = [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }];
        await adapter.handleMessage({ id: 99, method: 'item/tool/requestUserInput', params: { questions } });
        await adapter.answerQuestion(99, { confirm: ['Yes'] });
        await adapter.handleMessage({ method: 'turn/completed', params: { turn: { status: 'completed' } } });

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

    it('resumes a saved thread before sending the first turn', async () => {
        const { adapter, events, writes } = harness('codex', 'thread-saved');

        await adapter.start('new context');
        await adapter.handleMessage({ id: 1, result: {} });
        expect(writes[2]).toMatchObject({
            id: 2,
            method: 'thread/resume',
            params: { cwd: 'C:\\repo', threadId: 'thread-saved' },
        });
        await adapter.handleMessage({ id: 2, result: { thread: { id: 'thread-saved' } } });

        expect(events).toContainEqual({ conversationId: 'thread-saved', type: 'sessionStarted' });
        expect(writes[3]).toMatchObject({
            method: 'turn/start',
            params: { input: [{ text: 'new context', type: 'text' }], threadId: 'thread-saved' },
        });
    });

    it('reports a structured missing saved thread before any turn starts', async () => {
        const { adapter, events } = harness('codex', 'thread-missing');

        await adapter.start('new context');
        await adapter.handleMessage({ id: 1, result: {} });
        await adapter.handleMessage({
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

    it('reports request errors as fatal and rejects use before thread setup', async () => {
        const { adapter, events } = harness('codex');

        await expect(adapter.sendMessage('early')).rejects.toThrow('Codex streaming thread is not ready');
        await adapter.start('plan');
        await adapter.handleMessage({ error: { message: 'initialize failed' }, id: 1 });

        expect(events).toContainEqual({ content: 'initialize failed', type: 'fatal' });
    });

    it('reports server and turn request errors as fatal', async () => {
        const serverError = harness('codex');
        await serverError.adapter.handleMessage({ method: 'error', params: { error: { message: 'server failed' } } });
        const requestError = harness('codex');
        await requestError.adapter.handleMessage({ error: { message: 'turn failed' }, id: 99 });

        expect(serverError.events).toContainEqual({ content: 'server failed', type: 'fatal' });
        expect(requestError.events).toContainEqual({ content: 'turn failed', type: 'fatal' });
    });
});
