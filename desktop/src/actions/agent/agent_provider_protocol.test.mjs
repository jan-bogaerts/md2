import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createAgentProviderProtocolParser } = require('./agent_provider_protocol');
const ROOT_PATH = 'C:\\repo';

function parser(agent) {
    const events = [];
    const malformed = vi.fn();
    const instance = createAgentProviderProtocolParser(agent, (event) => events.push(event), malformed, ROOT_PATH);

    return { events, instance, malformed };
}

describe('agent provider protocol', () => {
    it('extracts Codex thread ids and completed assistant messages', () => {
        const { events, instance } = parser('codex');

        instance.push('{"type":"thread.started","thread_id":"thread-1"}\n');
        instance.push('{"type":"turn.started"}\n{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n');
        instance.finish();

        expect(events[0].conversationId).toBe('thread-1');
        expect(events[2].assistantText).toBe('done');
    });

    it('extracts nested Codex failure messages from structured events', () => {
        const { events, instance } = parser('codex');
        const providerFailure = JSON.stringify({
            error: { message: "The 'GPT' model is not supported when using Codex with a ChatGPT account." },
            status: 400,
            type: 'error',
        });

        instance.push(`${JSON.stringify({ type: 'error', message: providerFailure })}\n`);
        instance.push(`${JSON.stringify({ type: 'turn.failed', error: { message: providerFailure } })}\n`);
        instance.finish();

        expect(events.map(({ errorText }) => errorText)).toEqual([
            "The 'GPT' model is not supported when using Codex with a ChatGPT account.",
            "The 'GPT' model is not supported when using Codex with a ChatGPT account.",
        ]);
    });

    it('extracts Codex item errors and Claude error results', () => {
        const codex = parser('codex');
        const claude = parser('claude');

        codex.instance.push('{"type":"item.completed","item":{"type":"error","message":"model warning"}}\n');
        claude.instance.push('{"type":"result","is_error":true,"result":"permission denied"}\n');
        codex.instance.finish();
        claude.instance.finish();

        expect(codex.events[0].errorText).toBe('model warning');
        expect(claude.events[0].errorText).toBe('permission denied');
    });

    it('extracts Claude session ids and assistant text', () => {
        const { events, instance } = parser('claude');

        instance.push('{"type":"system","subtype":"init","session_id":"session-1"}\n');
        instance.push('{"type":"assistant","message":{"content":[{"type":"text","text":"hello"},{"type":"tool_use","name":"Read"}]}}\n');
        instance.finish();

        expect(events[0]).toMatchObject({ conversationId: 'session-1', transcriptEvents: [] });
        expect(events[1].assistantText).toBe('hello');
    });

    it('records Claude tool calls in the transcript, matching the streaming path', () => {
        const { events, instance } = parser('claude');

        instance.push('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"design/card.md"}}]}}\n');
        instance.push('{"type":"user","message":{"content":[{"type":"tool_result","content":"written"}]}}\n');
        instance.finish();

        expect(events[0].transcriptEvents).toEqual([{ content: '{"file_path":"design/card.md"}', toolType: 'tool.Write' }]);
        expect(events[1].transcriptEvents).toEqual([{ content: 'written', toolType: 'tool.result' }]);
    });

    it('normalizes one-shot Claude file results to canonical provider events', () => {
        const { events, instance } = parser('claude');

        instance.push(`${JSON.stringify({
            message: {content: [{ id: 'edit-1', input: { file_path: 'design/card.md' }, name: 'Edit', type: 'tool_use' }]},
            type: 'assistant',
        })}\n`);
        instance.push(`${JSON.stringify({
            message: { content: [{ content: 'updated', tool_use_id: 'edit-1', type: 'tool_result' }] },
            tool_use_result: { structuredPatch: [{ lines: [' context', '-old', '+new'] }] },
            type: 'user',
        })}\n`);
        instance.finish();

        expect(events[0].providerEvents).toEqual([expect.objectContaining({
            content: 'design/card.md',
            paths: ['design/card.md'],
            providerItemId: 'edit-1',
            status: 'inProgress',
            type: 'fileChange',
        })]);
        expect(events[1].providerEvents).toEqual([expect.objectContaining({
            deletions: 1,
            insertions: 1,
            output: 'updated',
            paths: ['design/card.md'],
            providerItemId: 'edit-1',
            status: 'completed',
            type: 'fileChange',
        })]);
    });

    it('normalizes Codex usage from the completed turn, splitting cached out of input', () => {
        const { events, instance } = parser('codex');

        instance.push('{"type":"turn.completed","usage":{"input_tokens":120,"cached_input_tokens":40,"output_tokens":15,"reasoning_output_tokens":5}}\n');
        instance.finish();

        expect(events[0].usage).toEqual({
            cachedInputTokens: 40,
            inputTokens: 80,
            outputTokens: 10,
            reasoningTokens: 5,
            totalTokens: 135,
        });
    });

    it('normalizes authoritative Claude result usage and cost', () => {
        const { events, instance } = parser('claude');

        instance.push('{"type":"assistant","message":{"content":[],"usage":{"input_tokens":999}}}\n');
        instance.push('{"type":"result","usage":{"input_tokens":20,"output_tokens":7,"cache_creation_input_tokens":8,"cache_read_input_tokens":5},"total_cost_usd":0.012}\n');
        instance.finish();

        expect(events[0].usage).toBeNull();
        expect(events[1].usage).toEqual({
            cachedInputTokens: 13,
            costUsd: 0.012,
            inputTokens: 20,
            outputTokens: 7,
            reasoningTokens: 0,
            totalTokens: 40,
        });
    });

    it('uses deduplicated Claude assistant usage when the result omits cache counters', () => {
        const { events, instance } = parser('claude');
        const rootAssistant = JSON.stringify({
            message: {
                content: [],
                id: 'message-1',
                usage: { cache_creation_input_tokens: 3, cache_read_input_tokens: 10, input_tokens: 5, output_tokens: 7 },
            },
            type: 'assistant',
        });
        const subAgentAssistant = JSON.stringify({
            message: {
                content: [],
                id: 'message-1',
                usage: { cache_creation_input_tokens: 2, cache_read_input_tokens: 20, input_tokens: 4, output_tokens: 6 },
            },
            parent_tool_use_id: 'agent-1',
            type: 'assistant',
        });

        instance.push(`${rootAssistant}\n${rootAssistant}\n${subAgentAssistant}\n`);
        instance.push('{"type":"result","usage":{"input_tokens":9,"output_tokens":13},"total_cost_usd":0.25}\n');
        instance.finish();

        expect(events.at(-1).usage).toEqual({
            cachedInputTokens: 35,
            costUsd: 0.25,
            inputTokens: 9,
            outputTokens: 13,
            reasoningTokens: 0,
            totalTokens: 57,
        });
    });

    it('rejects malformed terminal usage fields', () => {
        const { events, instance } = parser('codex');

        expect(() => instance.push('{"type":"turn.completed","usage":{"input_tokens":"bad","output_tokens":null}}\n'))
            .toThrow('Invalid provider token usage inputTokens');
        expect(events).toEqual([]);
    });

    it('reports no usage when the terminal event carries no usage object', () => {
        const { events, instance } = parser('codex');

        instance.push('{"type":"turn.completed"}\n');
        instance.finish();

        expect(events[0].usage).toBeNull();
    });

    it('rejects overlapping or inconsistent Codex totals', () => {
        const overlapping = parser('codex');
        const inconsistent = parser('codex');

        expect(() => overlapping.instance.push(
            '{"type":"turn.completed","usage":{"input_tokens":4,"cached_input_tokens":5,"output_tokens":3,"reasoning_output_tokens":1}}\n',
        )).toThrow('Invalid provider token usage inputTokens');
        expect(() => inconsistent.instance.push(
            '{"type":"turn.completed","usage":{"input_tokens":4,"cached_input_tokens":1,"output_tokens":3,"reasoning_output_tokens":1,"total_tokens":99}}\n',
        )).toThrow('Inconsistent provider token usage total');
    });

    it('extracts normalized root-confined Claude file tool paths', () => {
        const { events, instance } = parser('claude');
        const content = [
            { id: 'write-1', input: { file_path: 'design\\card.md' }, name: 'Write', type: 'tool_use' },
            { id: 'edit-1', input: { file_path: 'design/card.md' }, name: 'Edit', type: 'tool_use' },
            { id: 'edit-2', input: { file_path: 'C:\\outside\\secret.md' }, name: 'MultiEdit', type: 'tool_use' },
            { id: 'notebook-1', input: { notebook_path: 'notes/review.ipynb' }, name: 'NotebookEdit', type: 'tool_use' },
            { id: 'read-1', input: { file_path: 'ignored.md' }, name: 'Read', type: 'tool_use' },
        ];

        instance.push(`${JSON.stringify({ message: { content }, type: 'assistant' })}\n`);
        instance.finish();

        expect(events[0].providerEvents.map(({ paths }) => paths)).toEqual([
            ['design/card.md'],
            ['design/card.md'],
            [],
            ['notes/review.ipynb'],
        ]);
    });

    it('extracts Codex patch paths and rejects escapes', () => {
        const { events, instance } = parser('codex');

        instance.push(`${JSON.stringify({
            item: {
                changes: [
                    { kind: 'update', path: 'app/src/app.tsx' },
                    { kind: 'delete', path: '../outside.md' },
                    { kind: 'update', path: 'app/src/app.tsx' },
                ],
                path: 'desktop/src/main.js',
                id: 'file-1',
                type: 'file_change',
            },
            type: 'item.completed',
        })}\n`);
        instance.finish();

        expect(events[0].providerEvents[0]).toMatchObject({
            paths: ['desktop/src/main.js', 'app/src/app.tsx'],
            status: 'completed',
            type: 'fileChange',
        });
    });

    it('tolerates unknown and malformed changed-path shapes', () => {
        const { events, instance } = parser('codex');

        instance.push('{"type":"item.completed","item":{"id":"future","type":"future_patch","changes":"bad"}}\n');
        instance.push('{"type":"item.completed","item":{"id":"patch","type":"patch","changes":[null,{"kind":"update"}]}}\n');
        instance.finish();

        expect(events.map(({ providerEvents }) => providerEvents)).toEqual([[], []]);
    });

    it('recognizes structured missing-session failures only before turn events', () => {
        const first = parser('codex');
        first.instance.push('{"type":"error","code":"thread_not_found","message":"thread does not exist"}\n');
        first.instance.finish();

        const second = parser('codex');
        second.instance.push('{"type":"turn.started"}\n{"type":"error","code":"thread_not_found","message":"thread does not exist"}\n');
        second.instance.finish();

        expect(first.events[0].missingSession).toBe(true);
        expect(second.events[1].missingSession).toBe(false);
    });

    it('does not replay ambiguous free-text failures', () => {
        const { events, instance } = parser('claude');

        instance.push('{"type":"result","is_error":true,"message":"conversation invalid because permission was denied"}\n');
        instance.finish();

        expect(events[0].missingSession).toBe(false);
    });

    it('reports malformed JSONL instead of treating it as assistant text', () => {
        const { events, instance, malformed } = parser('claude');

        instance.push('not-json\n');
        instance.finish();

        expect(events).toEqual([]);
        expect(malformed).toHaveBeenCalledWith('not-json');
    });
});
