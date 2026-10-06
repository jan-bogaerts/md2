import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { parseAgentConversation } from '../../../../shared/agent_conversations.mjs';

const require = createRequire(import.meta.url);
const { attachRunProtocol } = require('./agent_run_state');
const { updateProviderSession } = require('./agent_conversation');

function completeWrite(_message, callback) {
    callback();
}

function accountingHarness(mode, conversation = null, providerConversationId = null) {
    const onEvent = vi.fn();
    const writeLine = vi.fn(completeWrite);
    const run = {
        agent: 'claude',
        child: { stdin: { write: writeLine } },
        conversation: conversation ?? {entries: [], id: 'conversation-1', providerSessions: [], startedAt: '2026-10-04T00:00:00.000Z', status: 'running'},
        request: {},
        streaming: mode === 'streaming',
    };
    attachRunProtocol(run, {
        onCodexRuntimeEvent: vi.fn(),
        onMalformedOutput: vi.fn(),
        onProviderEvent: onEvent,
        onStreamingEvent: onEvent,
        onStreamingLine: vi.fn(),
        providerConversationId,
        rootPath: '/repo',
    });

    return { instance: run.streamingAdapter ?? run.parser, mode, onEvent, run, writeLine };
}

async function deliver(harness, message) {
    if (harness.mode === 'one-shot') {
        harness.instance.push(`${JSON.stringify(message)}\n`);
        return;
    }
    await harness.instance.handleMessage(message);
    if (message.type !== 'result' || message.is_error || message.parent_tool_use_id) return;
    const request = harness.writeLine.mock.calls.map(([value]) => JSON.parse(value))
        .findLast(({ request }) => request?.subtype === 'get_context_usage');
    if (!request) return;
    await harness.instance.handleMessage({
        response: { request_id: request.request_id, response: { maxTokens: 100_000, totalTokens: 100 }, subtype: 'success' },
        type: 'control_response',
    });
}

function resultMessage(mainInputTokens, mainOutputTokens, costUsd, uuid) {
    return {
        modelUsage: {
            main: { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: mainInputTokens, outputTokens: mainOutputTokens },
            child: { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 200, outputTokens: 30 },
        },
        session_id: 'session-1',
        total_cost_usd: costUsd,
        type: 'result',
        usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, input_tokens: 100, output_tokens: 20 },
        uuid,
    };
}

function reportedUsages(harness) {
    return harness.onEvent.mock.calls.map(([event]) => event.usage).filter((usage) => !!usage);
}

describe.each(['one-shot', 'streaming'])('Claude accounting through %s execution', (mode) => {
    it('includes subagent tokens even when main-agent result usage is complete', async () => {
        const harness = accountingHarness(mode);

        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));

        expect(reportedUsages(harness)).toEqual([{
            cachedInputTokens: 0,
            costUsd: 0.10,
            inputTokens: 300,
            outputTokens: 50,
            reasoningTokens: 0,
            totalTokens: 350,
        }]);
    });

    it('emits only new tokens and spending from successive cumulative results', async () => {
        const harness = accountingHarness(mode);

        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));
        await deliver(harness, resultMessage(200, 40, 0.25, 'result-2'));

        const usages = reportedUsages(harness);
        expect(usages.map(({ costUsd }) => costUsd)).toEqual([0.10, 0.15]);
        expect(usages.map(({ totalTokens }) => totalTokens)).toEqual([350, 120]);
        expect(usages.reduce((total, { costUsd }) => total + costUsd, 0)).toBe(0.25);
    });


    it('round trips the raw provider baseline and excludes restored spend on resume', async () => {
        const original = accountingHarness(mode);
        await deliver(original, resultMessage(100, 20, 0.10, 'result-1'));
        original.run.providerConversationId = 'session-1';
        updateProviderSession(original.run, 'assistant-1', '2026-10-04T00:00:01.000Z');
        const saved = parseAgentConversation(JSON.stringify(original.run.conversation), 'activity.json');
        const resumed = accountingHarness(mode, saved, 'session-1');

        await deliver(resumed, { session_id: 'session-1', subtype: 'init', type: 'system' });
        await deliver(resumed, resultMessage(200, 40, 0.25, 'result-2'));

        expect(reportedUsages(resumed)).toEqual([{
            cachedInputTokens: 0,
            costUsd: 0.15,
            inputTokens: 100,
            outputTokens: 20,
            reasoningTokens: 0,
            totalTokens: 120,
        }]);
        expect(saved.providerSessions[0].usageBaseline.costUsd).toBe(0.10);
        expect(saved.providerSessions[0].usageBaseline.tokens.totalTokens).toBe(350);
    });

    it('seeds an unmeasured resumed session without counting its historical subtree or cost again', async () => {
        const harness = accountingHarness(mode, null, 'session-1');

        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));
        await deliver(harness, resultMessage(200, 40, 0.25, 'result-2'));

        const usages = reportedUsages(harness);
        expect(usages.map(({ totalTokens }) => totalTokens)).toEqual([120, 120]);
        expect(usages[0]).not.toHaveProperty('costUsd');
        expect(usages[1].costUsd).toBe(0.15);
    });

    it('counts new models and merges both cache buckets without adding thinking twice', async () => {
        const harness = accountingHarness(mode);
        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));
        const second = resultMessage(200, 40, 0.25, 'result-2');
        second.modelUsage.additional = {
            cacheCreationInputTokens: 5,
            cacheReadInputTokens: 10,
            inputTokens: 30,
            outputTokens: 15,
            thinkingTokens: 10,
        };

        await deliver(harness, second);

        expect(reportedUsages(harness).at(-1)).toEqual({
            cachedInputTokens: 15,
            costUsd: 0.15,
            inputTokens: 130,
            outputTokens: 35,
            reasoningTokens: 0,
            totalTokens: 180,
        });
    });

    it('starts a new baseline after a conversation reset even when the previous counters were larger', async () => {
        const harness = accountingHarness(mode);
        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));
        await deliver(harness, { new_conversation_id: 'session-2', session_id: 'session-1', type: 'conversation_reset' });
        const reset = { ...resultMessage(10, 2, 0.04, 'result-2'), session_id: 'session-2' };
        delete reset.modelUsage.child;
        await deliver(harness, reset);

        expect(reportedUsages(harness).at(-1)).toEqual({
            cachedInputTokens: 0,
            costUsd: 0.04,
            inputTokens: 10,
            outputTokens: 2,
            reasoningTokens: 0,
            totalTokens: 12,
        });
        expect(harness.run.claudeUsageTracker.conversationId).toBe('session-2');
    });

    it('does not reset the parent baseline when a child result has its own session id', async () => {
        const harness = accountingHarness(mode);
        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));
        await deliver(harness, {...resultMessage(900, 90, 9, 'child-result'), parent_tool_use_id: 'child-1', session_id: 'child-session'});
        await deliver(harness, resultMessage(200, 40, 0.25, 'result-2'));

        expect(reportedUsages(harness).map(({ costUsd }) => costUsd)).toEqual([0.10, 0.15]);
        expect(reportedUsages(harness).map(({ totalTokens }) => totalTokens)).toEqual([350, 120]);
    });

    it('ignores repeated completion ids before emitting another turn boundary', async () => {
        const harness = accountingHarness(mode);
        const result = resultMessage(100, 20, 0.10, 'result-1');
        await deliver(harness, result);
        const eventCount = harness.onEvent.mock.calls.length;

        await deliver(harness, result);

        expect(harness.onEvent).toHaveBeenCalledTimes(eventCount);
        expect(reportedUsages(harness)).toHaveLength(1);
    });

    it('keeps the previous baseline when a crash reports zeroed counters', async () => {
        const harness = accountingHarness(mode);
        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));
        await deliver(harness, {
            is_error: true, modelUsage: {}, session_id: 'session-1', subtype: 'error_during_execution',
            total_cost_usd: 0, type: 'result', uuid: 'crash',
        });
        await deliver(harness, resultMessage(200, 40, 0.25, 'result-2'));

        expect(reportedUsages(harness).map(({ totalTokens }) => totalTokens)).toEqual([350, 120]);
        expect(reportedUsages(harness).map(({ costUsd }) => costUsd)).toEqual([0.10, 0.15]);
    });

    it('retains per-turn token usage while differencing cumulative cost when model counters are absent', async () => {
        const harness = accountingHarness(mode);
        const first = resultMessage(100, 20, 0.10, 'result-1');
        const second = resultMessage(200, 40, 0.25, 'result-2');
        delete first.modelUsage;
        delete second.modelUsage;

        await deliver(harness, first);
        await deliver(harness, second);

        expect(reportedUsages(harness).map(({ totalTokens }) => totalTokens)).toEqual([120, 120]);
        expect(reportedUsages(harness).map(({ costUsd }) => costUsd)).toEqual([0.10, 0.15]);
    });

    it('rejects malformed whole-tree counters instead of falling back to main-agent counts', async () => {
        const harness = accountingHarness(mode);
        const result = resultMessage(100, 20, 0.10, 'result-1');
        result.modelUsage.child.cacheCreationInputTokens = -1;
        result.modelUsage.child.cacheReadInputTokens = 10;

        await expect(deliver(harness, result)).rejects.toThrow('Invalid provider token usage');
    });

    it('rejects counter regression within a session without replacing its last valid baseline', async () => {
        const harness = accountingHarness(mode);
        await deliver(harness, resultMessage(100, 20, 0.10, 'result-1'));

        await expect(deliver(harness, resultMessage(10, 2, 0.04, 'regressed'))).rejects.toThrow('Invalid provider token usage');

        expect(harness.run.claudeUsageTracker.usageBaseline.costUsd).toBe(0.10);
    });
});
