import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createAgentStreamingAdapter } = require('./agent_streaming_adapter');

function harness(agent, providerConversationId = null) {
    const events = [];
    const runtimeEvents = [];
    const writes = [];
    const adapter = createAgentStreamingAdapter(
        agent,
        (message) => writes.push(message),
        (event) => events.push(event),
        'C:\\repo',
        providerConversationId,
        (event) => runtimeEvents.push(event),
    );

    return { adapter, events, runtimeEvents, writes };
}

describe('ClaudeStreamingAdapter', () => {
    it('writes multiple user turns and treats each result as a turn boundary', async () => {
        const { adapter, events, writes } = harness('claude');

        await adapter.start('plan');
        await adapter.handleMessage({ session_id: 'session-1', subtype: 'init', type: 'system' });
        await adapter.handleMessage({ message: { content: [{ text: 'proposal', type: 'text' }], id: 'message-1' }, type: 'assistant' });
        await adapter.handleMessage({ total_cost_usd: 0.01, type: 'result', usage: { input_tokens: 4, output_tokens: 2 } });
        await adapter.sendMessage('approved');

        expect(writes).toEqual([
            { message: { content: 'plan', role: 'user' }, type: 'user' },
            { message: { content: 'approved', role: 'user' }, type: 'user' },
        ]);
        expect(events).toContainEqual({ conversationId: 'session-1', type: 'sessionStarted' });
        expect(events).toContainEqual({ content: 'proposal', itemId: 'message-1:text:0', type: 'assistantCompleted' });
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

    it('maps root-confined file changes and tool lifecycle events', async () => {
        const { adapter, events } = harness('claude');

        await adapter.handleMessage({
            message: {
                content: [
                    { id: 'tool-1', input: { file_path: 'design\\feature.md' }, name: 'Write', type: 'tool_use' },
                    { id: 'tool-2', input: { file_path: 'C:\\outside\\secret.md' }, name: 'Edit', type: 'tool_use' },
                ],
                id: 'message-1',
            },
            type: 'assistant',
        });
        await adapter.handleMessage({
            message: { content: [{ content: 'written', tool_use_id: 'tool-1', type: 'tool_result' }] },
            type: 'user',
        });

        expect(events).toContainEqual({ paths: ['design/feature.md'], type: 'changedPaths' });
        expect(events).toContainEqual({
            event: expect.objectContaining({ content: 'design\\feature.md', providerItemId: 'tool-1', type: 'fileChange' }),
            type: 'event',
        });
        expect(events).toContainEqual({
            event: expect.objectContaining({ output: 'written', providerItemId: 'tool-1', status: 'completed' }),
            type: 'event',
        });
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
        await started.adapter.handleMessage({ message: { content: [{ text: 'started', type: 'text' }], id: 'message-1' }, type: 'assistant' });
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
        let messageIndex = 0;
        const assistantMessage = (text) => {
            messageIndex += 1;

            return { message: { content: [{ text, type: 'text' }], id: `message-${messageIndex}` }, type: 'assistant' };
        };

        await adapter.handleMessage(assistantMessage('first'));
        await adapter.handleMessage(assistantMessage('second'));
        await adapter.handleMessage({ type: 'result' });
        await adapter.handleMessage(assistantMessage('next turn'));

        const assistantEvents = events.filter(({ type }) => type === 'assistantCompleted');
        expect(assistantEvents).toEqual([
            { content: 'first', itemId: 'message-1:text:0', type: 'assistantCompleted' },
            { content: '\n\nsecond', itemId: 'message-2:text:0', type: 'assistantCompleted' },
            { content: 'next turn', itemId: 'message-3:text:0', type: 'assistantCompleted' },
        ]);
    });

    it('streams ordered text, thinking, and tool activity then replaces text with authoritative completion', async () => {
        const { adapter, events } = harness('claude');

        await adapter.handleMessage({
            event: { message: { id: 'message-1' }, type: 'message_start' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { content_block: { thinking: '', type: 'thinking' }, index: 0, type: 'content_block_start' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { delta: { thinking: 'check', type: 'thinking_delta' }, index: 0, type: 'content_block_delta' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { content_block: { text: '', type: 'text' }, index: 1, type: 'content_block_start' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { delta: { text: 'dra', type: 'text_delta' }, index: 1, type: 'content_block_delta' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { content_block: { id: 'tool-1', input: {}, name: 'Bash', type: 'tool_use' }, index: 2, type: 'content_block_start' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { delta: { partial_json: '{"command":"npm test"}', type: 'input_json_delta' }, index: 2, type: 'content_block_delta' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            message: {
                content: [
                    { thinking: 'check carefully', type: 'thinking' },
                    { text: 'draft', type: 'text' },
                    { id: 'tool-1', input: { command: 'npm test' }, name: 'Bash', type: 'tool_use' },
                ],
                id: 'message-1',
            },
            type: 'assistant',
        });

        expect(events.map(({ type }) => type)).toEqual([
            'turnStarted', 'event', 'event', 'assistantStarted', 'assistant', 'event', 'event', 'event', 'assistantCompleted', 'event',
        ]);
        expect(events).toContainEqual({ content: 'dra', itemId: 'message-1:text:1', type: 'assistant' });
        expect(events).toContainEqual({ content: 'draft', itemId: 'message-1:text:1', type: 'assistantCompleted' });
        expect(events.at(-1)).toEqual({
            event: expect.objectContaining({ command: 'npm test', providerItemId: 'tool-1', status: 'inProgress' }),
            type: 'event',
        });
    });

    it('reconciles an aggregated assistant message that arrives after the next step cleared active blocks', async () => {
        const { adapter, events } = harness('claude');
        const messageStart = (id) => ({ event: { message: { id }, type: 'message_start' }, type: 'stream_event' });
        const textStart = (index) => ({
            event: { content_block: { text: '', type: 'text' }, index, type: 'content_block_start' },
            type: 'stream_event',
        });
        const textDelta = (index, text) => ({
            event: { delta: { text, type: 'text_delta' }, index, type: 'content_block_delta' },
            type: 'stream_event',
        });
        const aggregated = (id, text) => ({ message: { content: [{ text, type: 'text' }], id }, type: 'assistant' });

        // Step A streams fully, then step B's message_start clears activeBlocks before A's aggregated copy lands.
        await adapter.handleMessage(messageStart('message-1'));
        await adapter.handleMessage(textStart(0));
        await adapter.handleMessage(textDelta(0, 'first step'));
        await adapter.handleMessage(messageStart('message-2'));
        await adapter.handleMessage(textStart(0));
        await adapter.handleMessage(textDelta(0, 'second step'));
        await adapter.handleMessage(aggregated('message-1', 'first step'));
        await adapter.handleMessage(aggregated('message-2', 'second step'));
        await adapter.handleMessage({ type: 'result' });

        expect(events.filter(({ type }) => type === 'assistantStarted')).toEqual([
            { itemId: 'message-1:text:0', type: 'assistantStarted' },
            { itemId: 'message-2:text:0', type: 'assistantStarted' },
        ]);
        expect(events.filter(({ type }) => type === 'assistantCompleted')).toEqual([
            { content: 'first step', itemId: 'message-1:text:0', type: 'assistantCompleted' },
            { content: '\n\nsecond step', itemId: 'message-2:text:0', type: 'assistantCompleted' },
        ]);
    });

    it('suppresses routine Claude protocol noise', async () => {
        const { adapter, events } = harness('claude');

        await adapter.handleMessage({ subtype: 'rate_limit', type: 'system' });
        await adapter.handleMessage({ type: 'future_event' });
        await adapter.handleMessage({ event: { type: 'future_stream_event' }, type: 'stream_event' });
        await adapter.handleMessage({
            event: { message: { id: 'message-1' }, type: 'message_start' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { content_block: { text: '', type: 'text' }, index: 0, type: 'content_block_start' },
            type: 'stream_event',
        });
        await adapter.handleMessage({
            event: { delta: { type: 'future_delta' }, index: 0, type: 'content_block_delta' },
            type: 'stream_event',
        });

        expect(events.filter(({ type }) => type === 'event')).toEqual([]);
    });

    it.each([
        ['invalid stream event', { event: null, type: 'stream_event' }],
        ['message_start missing message id', { event: { message: {}, type: 'message_start' }, type: 'stream_event' }],
        ['invalid content_block_start', { event: { content_block: { type: 'text' }, index: 0, type: 'content_block_start' }, type: 'stream_event' }],
        ['invalid content_block_delta', { event: { delta: { text: 'orphan', type: 'text_delta' }, index: 0, type: 'content_block_delta' }, type: 'stream_event' }],
        ['assistant message missing content', { message: {}, type: 'assistant' }],
    ])('emits a failed protocol error for %s', async (content, message) => {
        const { adapter, events } = harness('claude');

        await adapter.handleMessage(message);

        expect(events.filter(({ type }) => type === 'event')).toEqual([{
            event: {
                content,
                label: 'Claude protocol error',
                providerItemId: 'error:unknown-message:1',
                status: 'failed',
                type: 'error',
            },
            type: 'event',
        }]);
    });

    it('keeps concurrent approvals isolated and maps Claude decisions to control responses', async () => {
        const { adapter, events, writes } = harness('claude');
        const permissionSuggestions = [{ behavior: 'allow', destination: 'session', tool: 'Bash' }];
        const approvalRequest = (requestId, toolUseId, command, suggestions = permissionSuggestions) => ({
            request: {
                decision_reason: 'Command needs permission',
                input: { command },
                permission_suggestions: suggestions,
                subtype: 'can_use_tool',
                tool_name: 'Bash',
                tool_use_id: toolUseId,
            },
            request_id: requestId,
            type: 'control_request',
        });

        await adapter.handleMessage(approvalRequest('request-1', 'tool-1', 'npm test'));
        await adapter.handleMessage(approvalRequest('request-2', 'tool-2', 'npm run lint', []));
        await adapter.answerApproval('request-1', 'acceptForSession');
        await adapter.answerApproval('request-2', 'cancel');

        expect(events.filter(({ type }) => type === 'approval')).toEqual([
            { approval: expect.objectContaining({ command: 'npm test', provider: 'claude', requestId: 'request-1', toolName: 'Bash' }), type: 'approval' },
            { approval: expect.objectContaining({ availableDecisions: ['accept', 'decline', 'cancel'], requestId: 'request-2' }), type: 'approval' },
        ]);
        expect(writes.at(-2)).toEqual({
            response: {
                request_id: 'request-1',
                response: {
                    behavior: 'allow',
                    toolUseID: 'tool-1',
                    updatedInput: { command: 'npm test' },
                    updatedPermissions: permissionSuggestions,
                },
                subtype: 'success',
            },
            type: 'control_response',
        });
        expect(writes.at(-1)).toEqual({
            response: {
                request_id: 'request-2',
                response: { behavior: 'deny', interrupt: true, message: 'User stopped the turn', toolUseID: 'tool-2' },
                subtype: 'success',
            },
            type: 'control_response',
        });
        expect(events.filter(({ type }) => type === 'approvalResolved')).toEqual([
            { requestId: 'request-1', type: 'approvalResolved' },
            { requestId: 'request-2', type: 'approvalResolved' },
        ]);
    });

    it.each([
        ['accept', { behavior: 'allow', toolUseID: 'tool-1', updatedInput: { command: 'npm test' } }],
        ['decline', { behavior: 'deny', message: 'User declined this tool request', toolUseID: 'tool-1' }],
    ])('maps Claude %s approval decisions exactly', async (decision, response) => {
        const { adapter, writes } = harness('claude');
        await adapter.handleMessage({
            request: {
                input: { command: 'npm test' },
                subtype: 'can_use_tool',
                tool_name: 'Bash',
                tool_use_id: 'tool-1',
            },
            request_id: 'request-1',
            type: 'control_request',
        });

        await adapter.answerApproval('request-1', decision);

        expect(writes.at(-1)).toEqual({
            response: { request_id: 'request-1', response, subtype: 'success' },
            type: 'control_response',
        });
    });
});

describe('CodexStreamingAdapter', () => {
    it('initializes, starts one thread, then starts and steers a turn', async () => {
        const { adapter, events, writes } = harness('codex');

        await adapter.start('plan');
        expect(writes[0]).toMatchObject({ id: 1, method: 'initialize' });
        await adapter.handleMessage({ id: 1, result: { userAgent: 'codex' } });
        expect(writes[1]).toEqual({ method: 'initialized', params: {} });
        expect(writes[2]).toMatchObject({ id: 2, method: 'account/rateLimits/read' });
        expect(writes[3]).toMatchObject({ id: 3, method: 'thread/start', params: { cwd: 'C:\\repo' } });
        await adapter.handleMessage({ id: 3, result: { thread: { id: 'thread-1' } } });
        expect(writes[4]).toMatchObject({
            method: 'turn/start',
            params: { input: [{ text: 'plan', type: 'text' }], threadId: 'thread-1' },
        });
        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.sendMessage('extra detail');
        expect(writes[5]).toMatchObject({
            method: 'turn/steer',
            params: {
                expectedTurnId: 'turn-1',
                input: [{ text: 'extra detail', type: 'text' }],
                threadId: 'thread-1',
            },
        });
        expect(events).toContainEqual({ conversationId: 'thread-1', type: 'sessionStarted' });
    });

    it('publishes initial, updated, and unavailable account rate-limit runtime events', async () => {
        const { adapter, runtimeEvents } = harness('codex');
        const rateLimits = {
            credits: null,
            individualLimit: null,
            limitId: 'codex',
            limitName: 'Codex',
            planType: 'plus',
            primary: { resetsAt: 100, usedPercent: 20, windowDurationMins: 300 },
            rateLimitReachedType: null,
            secondary: null,
        };

        await adapter.start('plan');
        await adapter.handleMessage({ id: 1, result: {} });
        await adapter.handleMessage({
            id: 2,
            result: { rateLimitResetCredits: null, rateLimits, rateLimitsByLimitId: null },
        });
        await adapter.handleMessage({
            method: 'account/rateLimits/updated',
            params: { rateLimits: { ...rateLimits, primary: { ...rateLimits.primary, usedPercent: 30 } } },
        });

        expect(runtimeEvents).toEqual([
            expect.objectContaining({ kind: 'snapshot', payload: expect.objectContaining({ rateLimits }) }),
            expect.objectContaining({ kind: 'update', payload: expect.objectContaining({ rateLimits: expect.any(Object) }) }),
        ]);

        const unavailable = harness('codex');
        await unavailable.adapter.start('plan');
        await unavailable.adapter.handleMessage({ id: 1, result: {} });
        await unavailable.adapter.handleMessage({ error: { message: 'not logged in' }, id: 2 });
        expect(unavailable.runtimeEvents).toEqual([expect.objectContaining({ kind: 'unavailable' })]);
        expect(unavailable.events).toEqual([]);
    });

    it('maps deltas, usage, file changes, questions, and turn completion', async () => {
        const { adapter, events, writes } = harness('codex');
        await adapter.start('plan');
        await adapter.handleMessage({ id: 1, result: {} });
        await adapter.handleMessage({ id: 3, result: { thread: { id: 'thread-1' } } });
        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.handleMessage({
            method: 'item/started',
            params: { item: { id: 'message-1', phase: null, text: '', type: 'agentMessage' } },
        });
        await adapter.handleMessage({ method: 'item/agentMessage/delta', params: { delta: 'hello', itemId: 'message-1' } });
        await adapter.handleMessage({
            method: 'item/completed',
            params: { item: { id: 'message-1', phase: null, text: 'hello', type: 'agentMessage' } },
        });
        const last = { cachedInputTokens: 2, inputTokens: 4, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 10 };
        await adapter.handleMessage({
            method: 'thread/tokenUsage/updated',
            params: { tokenUsage: { last, modelContextWindow: 258_400 } },
        });
        await adapter.handleMessage({ method: 'thread/tokenUsage/updated', params: {} });
        await adapter.handleMessage({
            method: 'item/started',
            params: { item: { changes: [{ diff: '', kind: 'update', path: 'design\\feature.md' }], id: 'file-1', status: 'inProgress', type: 'fileChange' } },
        });
        await adapter.handleMessage({
            method: 'item/completed',
            params: { item: { changes: [{ diff: '', kind: 'update', path: 'design\\feature.md' }], id: 'file-1', status: 'completed', type: 'fileChange' } },
        });
        const questions = [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }];
        await adapter.handleMessage({ id: 99, method: 'item/tool/requestUserInput', params: { questions } });
        await adapter.answerQuestion(99, { confirm: ['Yes'] });
        await adapter.handleMessage({ method: 'turn/completed', params: { turn: { status: 'completed' } } });

        expect(events).toContainEqual({ content: 'hello', itemId: 'message-1', type: 'assistant' });
        expect(events).toContainEqual({ itemId: 'message-1', type: 'assistantStarted' });
        expect(events).toContainEqual({ content: '\n\n', itemId: 'message-1', type: 'assistant' });
        expect(events).toContainEqual({ paths: ['design/feature.md'], type: 'changedPaths' });
        expect(events).toContainEqual({ questions, requestId: 99, type: 'question' });
        expect(events).toContainEqual({
            type: 'usage',
            usage: { cachedInputTokens: 2, inputTokens: 4, outputTokens: 3, reasoningTokens: 1, totalTokens: 10 },
        });
        expect(events.filter(({ type }) => type === 'usage')).toHaveLength(1);
        expect(events.at(-1)).toMatchObject({
            contextWindowUsage: { capacityTokens: 258_400, usedTokens: 10 },
            error: null,
            type: 'turnCompleted',
            usage: { cachedInputTokens: 2, inputTokens: 4, outputTokens: 3, reasoningTokens: 1, totalTokens: 10 },
        });
        expect(writes.at(-1)).toEqual({ id: 99, result: { answers: { confirm: { answers: ['Yes'] } } } });
    });

    it('keeps only latest valid context-window snapshot for completed Codex turn', async () => {
        const { adapter, events } = harness('codex');
        const firstLast = { cachedInputTokens: 0, inputTokens: 4, outputTokens: 1, totalTokens: 5 };
        const latestLast = { cachedInputTokens: 0, inputTokens: 41_000, outputTokens: 1_000, totalTokens: 42_000 };

        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.handleMessage({
            method: 'thread/tokenUsage/updated',
            params: { tokenUsage: { last: firstLast, modelContextWindow: 100_000 } },
        });
        await adapter.handleMessage({
            method: 'thread/tokenUsage/updated',
            params: { tokenUsage: { last: latestLast, modelContextWindow: 258_400 } },
        });
        await adapter.handleMessage({ method: 'turn/completed', params: { turn: { status: 'completed' } } });

        expect(events.at(-1)).toMatchObject({
            contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
            type: 'turnCompleted',
        });
    });

    it('tracks concurrent approval requests and writes only supported decisions', async () => {
        const { adapter, events, writes } = harness('codex');
        const policyDecision = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['npm', 'test'] } };
        await adapter.start('plan');
        await adapter.handleMessage({ id: 1, result: {} });
        await adapter.handleMessage({ id: 3, result: { thread: { id: 'thread-1' } } });
        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.handleMessage({
            method: 'item/started',
            params: { item: { command: 'npm test', cwd: 'C:\\repo', id: 'command-1', type: 'commandExecution' } },
        });
        await adapter.handleMessage({
            method: 'item/started',
            params: { item: { changes: [{ kind: 'update', path: 'app/src/main.ts' }], id: 'file-1', type: 'fileChange' } },
        });
        await adapter.handleMessage({
            id: 41,
            method: 'item/commandExecution/requestApproval',
            params: {
                availableDecisions: ['decline', policyDecision],
                command: 'npm test',
                commandActions: [{ command: 'npm test', type: 'unknown' }],
                cwd: 'C:\\repo',
                itemId: 'command-1',
                networkApprovalContext: { host: 'registry.npmjs.org', protocol: 'https' },
                reason: 'Needs network',
                startedAtMs: 1,
                threadId: 'thread-1',
                turnId: 'turn-1',
            },
        });
        await adapter.handleMessage({
            id: 'file-request',
            method: 'item/fileChange/requestApproval',
            params: { itemId: 'file-1', reason: 'Write file', startedAtMs: 2, threadId: 'thread-1', turnId: 'turn-1' },
        });

        await expect(adapter.answerApproval(41, 'accept')).rejects.toThrow('Unsupported');
        await adapter.answerApproval(41, policyDecision);
        await expect(adapter.answerApproval(41, policyDecision)).rejects.toThrow('already submitted');
        await adapter.answerApproval('file-request', 'acceptForSession');
        await adapter.handleMessage({
            method: 'serverRequest/resolved',
            params: { requestId: 41, threadId: 'thread-1' },
        });
        await adapter.handleMessage({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } });

        expect(events).toContainEqual(expect.objectContaining({
            approval: expect.objectContaining({
                filePaths: ['app/src/main.ts'],
                kind: 'fileChange',
                requestId: 'file-request',
            }),
            type: 'approval',
        }));
        expect(events.filter(({ type }) => type === 'approvalResolved')).toEqual([
            { requestId: 41, type: 'approvalResolved' },
            { requestId: 'file-request', type: 'approvalResolved' },
        ]);
        expect(writes).toContainEqual({ id: 41, result: { decision: policyDecision } });
        expect(writes).toContainEqual({ id: 'file-request', result: { decision: 'acceptForSession' } });
    });

    it('rejects approval requests that do not match the active turn item', async () => {
        const { adapter } = harness('codex');
        await adapter.start('plan');
        await adapter.handleMessage({ id: 1, result: {} });
        await adapter.handleMessage({ id: 3, result: { thread: { id: 'thread-1' } } });
        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });

        await expect(adapter.handleMessage({
            id: 41,
            method: 'item/fileChange/requestApproval',
            params: { itemId: 'missing', startedAtMs: 1, threadId: 'thread-1', turnId: 'turn-1' },
        })).rejects.toThrow('Mismatched Codex approval item id');
    });

    it('closes only matching streamed agent messages once', async () => {
        const { adapter, events } = harness('codex');
        const agentMessage = (id) => ({ id, phase: null, text: '', type: 'agentMessage' });

        await adapter.handleMessage({ method: 'item/started', params: { item: agentMessage('message-1') } });
        await adapter.handleMessage({ method: 'item/started', params: { item: agentMessage('message-2') } });
        await adapter.handleMessage({ method: 'item/started', params: { item: agentMessage('message-empty') } });
        await adapter.handleMessage({ method: 'item/agentMessage/delta', params: { delta: 'first', itemId: 'message-1' } });
        await adapter.handleMessage({ method: 'item/agentMessage/delta', params: { delta: 'second', itemId: 'message-2' } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: agentMessage('message-1') } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: agentMessage('message-1') } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: agentMessage('message-empty') } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: agentMessage('message-2') } });
        await adapter.handleMessage({ method: 'item/agentMessage/delta', params: { delta: 'late', itemId: 'message-2' } });

        expect(events.filter(({ type }) => type === 'assistant')).toEqual([
            { content: 'first', itemId: 'message-1', type: 'assistant' },
            { content: '\n\n', itemId: 'message-1', type: 'assistant' },
            { content: 'second', itemId: 'message-2', type: 'assistant' },
            { content: '\n\n', itemId: 'message-2', type: 'assistant' },
        ]);
        expect(events.filter(({ event }) => event?.type === 'diagnostic')).toHaveLength(2);
    });

    it('streams reasoning sections and replaces them with authoritative completion', async () => {
        const { adapter, events } = harness('codex');
        await adapter.handleMessage({
            method: 'item/started',
            params: { item: { content: [], id: 'reasoning-1', summary: [], type: 'reasoning' } },
        });
        await adapter.handleMessage({
            method: 'item/reasoning/summaryPartAdded',
            params: { itemId: 'reasoning-1', summaryIndex: 0 },
        });
        await adapter.handleMessage({
            method: 'item/reasoning/summaryTextDelta',
            params: { delta: 'Inspect', itemId: 'reasoning-1', summaryIndex: 0 },
        });
        await adapter.handleMessage({
            method: 'item/reasoning/summaryPartAdded',
            params: { itemId: 'reasoning-1', summaryIndex: 1 },
        });
        await adapter.handleMessage({
            method: 'item/reasoning/summaryTextDelta',
            params: { delta: 'Verify', itemId: 'reasoning-1', summaryIndex: 1 },
        });
        await adapter.handleMessage({
            method: 'item/reasoning/textDelta',
            params: { contentIndex: 0, delta: 'Raw detail', itemId: 'reasoning-1' },
        });
        await adapter.handleMessage({
            method: 'item/completed',
            params: { item: { content: ['Final detail'], id: 'reasoning-1', summary: ['Final summary'], type: 'reasoning' } },
        });

        const reasoning = events.filter(({ event }) => event?.providerItemId === 'reasoning-1').map(({ event }) => event);
        expect(reasoning[0]).toMatchObject({ status: 'inProgress', summary: [] });
        expect(reasoning.at(-1)).toMatchObject({
            content: 'Final summary',
            details: ['Final detail'],
            status: 'completed',
            summary: ['Final summary'],
        });
        expect(reasoning.some(({ details, summary }) => details[0] === 'Raw detail' && summary[1] === 'Verify')).toBe(true);
    });

    it('retains completed reasoning without text', async () => {
        const { adapter, events } = harness('codex');
        const reasoning = { content: [], id: 'reasoning-empty', summary: [], type: 'reasoning' };

        await adapter.handleMessage({ method: 'item/started', params: { item: reasoning } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: reasoning } });

        expect(events.at(-1)).toEqual({
            event: expect.objectContaining({
                content: '',
                providerItemId: 'reasoning-empty',
                status: 'completed',
            }),
            type: 'event',
        });
    });

    it('retains exact command and ordered output through authoritative completion', async () => {
        const { adapter, events } = harness('codex');
        const started = {
            aggregatedOutput: null,
            command: 'npm run test -- --grep "exact"',
            commandActions: [],
            cwd: 'C:\\repo',
            durationMs: null,
            exitCode: null,
            id: 'command-1',
            processId: 'process-1',
            source: 'agent',
            status: 'inProgress',
            type: 'commandExecution',
        };
        await adapter.handleMessage({ method: 'item/started', params: { item: started } });
        await adapter.handleMessage({
            method: 'item/commandExecution/outputDelta',
            params: { delta: 'first\n', itemId: 'command-1' },
        });
        await adapter.handleMessage({
            method: 'item/commandExecution/outputDelta',
            params: { delta: 'second', itemId: 'command-1' },
        });
        await adapter.handleMessage({
            method: 'item/completed',
            params: { item: { ...started, aggregatedOutput: 'final output', durationMs: 25, exitCode: 1, status: 'failed' } },
        });

        const command = events.filter(({ event }) => event?.providerItemId === 'command-1').map(({ event }) => event);
        expect(command[0]).toMatchObject({ command: started.command, content: '', status: 'inProgress', workingDirectory: 'C:\\repo' });
        expect(command[2].content).toBe('first\nsecond');
        expect(command.at(-1)).toMatchObject({
            command: started.command,
            content: 'final output',
            durationMs: 25,
            exitCode: 1,
            status: 'failed',
        });
        expect(command.every((event) => !Object.hasOwn(event, 'output'))).toBe(true);
    });

    it('retains declined command state', async () => {
        const { adapter, events } = harness('codex');
        const command = {
            aggregatedOutput: '',
            command: 'npm publish',
            commandActions: [],
            cwd: 'C:\\repo',
            durationMs: 5,
            exitCode: null,
            id: 'command-declined',
            processId: null,
            source: 'agent',
            status: 'declined',
            type: 'commandExecution',
        };

        await adapter.handleMessage({ method: 'item/started', params: { item: { ...command, status: 'inProgress' } } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: command } });

        expect(events.at(-1)).toEqual({
            event: expect.objectContaining({
                command: 'npm publish',
                providerItemId: 'command-declined',
                status: 'declined',
            }),
            type: 'event',
        });
    });

    it('replaces plan deltas, records compaction and system events, and omits terminal input', async () => {
        const { adapter, events } = harness('codex');
        const plan = { id: 'plan-1', text: '', type: 'plan' };

        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.handleMessage({ method: 'item/started', params: { item: plan } });
        await adapter.handleMessage({ method: 'item/plan/delta', params: { delta: 'draft', itemId: 'plan-1' } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: { ...plan, text: 'final' } } });
        await adapter.handleMessage({
            method: 'item/started',
            params: { item: { id: 'compaction-1', type: 'contextCompaction' } },
        });
        await adapter.handleMessage({
            method: 'item/completed',
            params: { item: { id: 'compaction-1', type: 'contextCompaction' } },
        });
        await adapter.handleMessage({
            method: 'model/rerouted',
            params: { fromModel: 'first', reason: 'capacity', toModel: 'second', turnId: 'turn-1' },
        });
        await adapter.handleMessage({
            method: 'item/commandExecution/terminalInteraction',
            params: { itemId: 'command-1', processId: 'process-1', stdin: 'secret terminal input' },
        });

        const conversationEvents = events.filter(({ event }) => event).map(({ event }) => event);
        expect(conversationEvents).toContainEqual(expect.objectContaining({ content: 'final', providerItemId: 'plan-1' }));
        expect(conversationEvents).toContainEqual(expect.objectContaining({ label: 'Context compacted', providerItemId: 'compaction-1' }));
        expect(conversationEvents).toContainEqual(expect.objectContaining({ label: 'Model rerouted', type: 'system' }));
        expect(JSON.stringify(conversationEvents)).not.toContain('secret terminal input');
    });

    it('clears completed item tracking when next turn starts', async () => {
        const { adapter, events } = harness('codex');
        const message = { id: 'reused-item', phase: null, text: '', type: 'agentMessage' };

        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-1' } } });
        await adapter.handleMessage({ method: 'item/started', params: { item: message } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: message } });
        await adapter.handleMessage({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } });
        await adapter.handleMessage({ method: 'turn/started', params: { turn: { id: 'turn-2' } } });
        await adapter.handleMessage({ method: 'item/started', params: { item: message } });

        const diagnostics = events.filter(({ event }) => event?.type === 'diagnostic');
        expect(diagnostics).toHaveLength(0);
    });

    it('normalizes supported tool events and diagnoses unknown item types without failing', async () => {
        const { adapter, events } = harness('codex');
        const webSearch = { action: null, id: 'search-1', query: 'Codex schema', type: 'webSearch' };
        const unknown = { id: 'future-1', payload: { secret: 'not persisted' }, type: 'futureTool' };

        await adapter.handleMessage({ method: 'item/started', params: { item: webSearch } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: { ...webSearch, action: { type: 'search', query: 'Codex schema' } } } });
        await adapter.handleMessage({ method: 'item/started', params: { item: unknown } });
        await adapter.handleMessage({ method: 'item/completed', params: { item: unknown } });

        expect(events).toContainEqual({
            event: expect.objectContaining({
                content: 'Codex schema',
                label: 'Web search',
                providerItemId: 'search-1',
                status: 'completed',
            }),
            type: 'event',
        });
        const diagnostics = events.filter(({ event }) => event?.type === 'diagnostic').map(({ event }) => event.content);
        expect(diagnostics).toEqual(['item/started: futureTool (future-1)', 'item/completed: futureTool (future-1)']);
        expect(diagnostics.join('')).not.toContain('not persisted');
    });

    it('bounds structured tool result text without truncating command output', async () => {
        const { adapter, events } = harness('codex');
        const longText = 'x'.repeat(20_000);
        const dynamicTool = {
            arguments: { input: 'value' },
            contentItems: null,
            durationMs: null,
            id: 'dynamic-1',
            namespace: null,
            status: 'inProgress',
            success: null,
            tool: 'inspect',
            type: 'dynamicToolCall',
        };

        await adapter.handleMessage({ method: 'item/started', params: { item: dynamicTool } });
        await adapter.handleMessage({
            method: 'item/completed',
            params: { item: { ...dynamicTool, contentItems: [{ text: longText, type: 'inputText' }], status: 'completed', success: true } },
        });

        const event = events.at(-1).event;
        expect(event.output.length).toBeLessThan(longText.length);
        expect(event.output).toContain('[event content truncated]');
    });

    it('resumes a saved thread before sending the first turn', async () => {
        const { adapter, events, writes } = harness('codex', 'thread-saved');

        await adapter.start('new context');
        await adapter.handleMessage({ id: 1, result: {} });
        expect(writes[3]).toMatchObject({
            id: 3,
            method: 'thread/resume',
            params: { cwd: 'C:\\repo', threadId: 'thread-saved' },
        });
        await adapter.handleMessage({ id: 3, result: { thread: { id: 'thread-saved' } } });

        expect(events).toContainEqual({ conversationId: 'thread-saved', type: 'sessionStarted' });
        expect(writes[4]).toMatchObject({
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
            id: 3,
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
