import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    ClaudeFileResultDecoder,
    accumulatedClaudeUsage,
    claudeAssistantText,
    claudeFileResultUsage,
    claudeTranscriptEvents,
    claudeUsage,
    recordClaudeAssistantUsage,
} = require('./agent_claude_events');
const ROOT_PATH = 'C:\\repo';

function assistant(content) {
    return { message: { content }, type: 'assistant' };
}

describe('claude event decoders', () => {
    it('joins assistant text blocks and ignores other block types', () => {
        expect(claudeAssistantText(assistant([
            { text: 'first', type: 'text' },
            { input: {}, name: 'Read', type: 'tool_use' },
            { text: ' second', type: 'text' },
        ]))).toBe('first second');
        expect(claudeAssistantText({ type: 'result' })).toBe('');
    });

    it('normalizes file tool paths and drops non-file tools and paths outside the root', () => {
        const decoder = new ClaudeFileResultDecoder(ROOT_PATH);
        const events = decoder.decode(assistant([
            { id: 'write-1', input: { file_path: 'design\\card.md' }, name: 'Write', type: 'tool_use' },
            { id: 'edit-1', input: { file_path: 'design/card.md' }, name: 'Edit', type: 'tool_use' },
            { id: 'edit-2', input: { file_path: 'C:\\outside\\secret.md' }, name: 'MultiEdit', type: 'tool_use' },
            { id: 'notebook-1', input: { notebook_path: 'notes/review.ipynb' }, name: 'NotebookEdit', type: 'tool_use' },
            { id: 'read-1', input: { file_path: 'ignored.md' }, name: 'Read', type: 'tool_use' },
        ]));

        expect(events.map(({ paths }) => paths)).toEqual([
            ['design/card.md'], ['design/card.md'], [], ['notes/review.ipynb'],
        ]);
    });

    it('reports both tool calls and tool results so the transcript shows what ran', () => {
        expect(claudeTranscriptEvents(assistant([
            { text: 'thinking', type: 'text' },
            { input: { file_path: 'design/card.md' }, name: 'Write', type: 'tool_use' },
        ]))).toEqual([{ content: '{"file_path":"design/card.md"}', toolType: 'tool.Write' }]);
        expect(claudeTranscriptEvents({
            message: { content: [{ content: 'written', type: 'tool_result' }, { content: '', type: 'tool_result' }] },
            type: 'user',
        })).toEqual([{ content: 'written', toolType: 'tool.result' }]);
    });

    it('folds both cache buckets into cachedInputTokens and recomputes the total', () => {
        expect(claudeUsage({
            total_cost_usd: 0.25,
            type: 'result',
            usage: { cache_creation_input_tokens: 3, cache_read_input_tokens: 10, input_tokens: 5, output_tokens: 7 },
        })).toEqual({
            cachedInputTokens: 13,
            costUsd: 0.25,
            inputTokens: 5,
            outputTokens: 7,
            reasoningTokens: 0,
            totalTokens: 25,
        });
    });

    it('rejects unusable provider counters instead of poisoning running totals', () => {
        expect(() => claudeUsage({ type: 'result', usage: { input_tokens: -4, output_tokens: 'many' } }))
            .toThrow('Invalid provider token usage inputTokens');
        expect(claudeUsage({ type: 'assistant', usage: { input_tokens: 5 } })).toBeNull();
    });

    it('falls back to complete deduplicated assistant usage when result cache counters are missing', () => {
        const messageUsages = new Map();
        const rootMessage = {
            message: {
                content: [],
                id: 'message-1',
                usage: { cache_creation_input_tokens: 3, cache_read_input_tokens: 10, input_tokens: 5, output_tokens: 7 },
            },
            type: 'assistant',
        };
        const subAgentMessage = {
            message: {
                content: [],
                id: 'message-1',
                usage: { cache_creation_input_tokens: 2, cache_read_input_tokens: 20, input_tokens: 4, output_tokens: 6 },
            },
            parent_tool_use_id: 'agent-1',
            type: 'assistant',
        };

        recordClaudeAssistantUsage(messageUsages, rootMessage);
        recordClaudeAssistantUsage(messageUsages, rootMessage);
        recordClaudeAssistantUsage(messageUsages, subAgentMessage);
        const fallbackUsage = accumulatedClaudeUsage(messageUsages);

        expect(claudeUsage({ total_cost_usd: 0.25, type: 'result', usage: { input_tokens: 9, output_tokens: 13 } }, fallbackUsage)).toEqual({
            cachedInputTokens: 35,
            costUsd: 0.25,
            inputTokens: 9,
            outputTokens: 13,
            reasoningTokens: 0,
            totalTokens: 57,
        });
    });

    it('does not fabricate zero cache usage from an incomplete result without a fallback', () => {
        expect(claudeUsage({ type: 'result', usage: { input_tokens: 5, output_tokens: 7 } })).toBeNull();
    });

    it.each(['Edit', 'MultiEdit', 'Write'])('counts %s structured patch lines', (toolName) => {
        const result = {
            structuredPatch: [
                { lines: [' context', '-old', '+new', '+++plus content', '\\ No newline at end of file'] },
                { lines: ['-removed'] },
            ],
        };

        expect(claudeFileResultUsage(toolName, result)).toEqual({ deletions: 2, insertions: 2 });
        expect(claudeFileResultUsage(toolName, { structuredPatch: [] })).toEqual({ deletions: 0, insertions: 0 });
    });

    it('counts NotebookEdit replace, insert, and delete modes by whole lines', () => {
        expect(claudeFileResultUsage('NotebookEdit', {
            edit_mode: 'replace',
            new_source: 'new\nshared\nlast',
            old_source: 'old\nshared\nremoved',
        })).toEqual({ deletions: 2, insertions: 2 });
        expect(claudeFileResultUsage('NotebookEdit', {
            edit_mode: 'insert',
            new_source: 'first\nsecond',
            old_source: 'ignored',
        })).toEqual({ deletions: 0, insertions: 2 });
        expect(claudeFileResultUsage('NotebookEdit', {
            edit_mode: 'delete',
            new_source: 'ignored',
            old_source: 'first\nsecond',
        })).toEqual({ deletions: 2, insertions: 0 });
    });

    it('rejects malformed patch and notebook result shapes', () => {
        expect(claudeFileResultUsage('Edit', {})).toBeNull();
        expect(claudeFileResultUsage('Write', { structuredPatch: [{ lines: ['missing prefix'] }] })).toBeNull();
        expect(claudeFileResultUsage('MultiEdit', { structuredPatch: [{ lines: '+not an array' }] })).toBeNull();
        expect(claudeFileResultUsage('NotebookEdit', { edit_mode: 'replace', new_source: 'new' })).toBeNull();
        expect(claudeFileResultUsage('NotebookEdit', { edit_mode: 'unknown', new_source: '', old_source: '' })).toBeNull();
        expect(claudeFileResultUsage('Read', { structuredPatch: [] })).toBeNull();
    });

    it('correlates successful applied results with file tool ids', () => {
        const decoder = new ClaudeFileResultDecoder(ROOT_PATH);
        const started = decoder.decode(assistant([
            { id: 'edit-1', input: { file_path: 'design/card.md' }, name: 'Edit', type: 'tool_use' },
        ]));
        const completed = decoder.decode({
            message: { content: [{ content: 'updated', tool_use_id: 'edit-1', type: 'tool_result' }] },
            tool_use_result: { structuredPatch: [{ lines: ['-old', '+new'] }] },
            type: 'user',
        });

        expect(started).toEqual([expect.objectContaining({ providerItemId: 'edit-1', status: 'inProgress', type: 'fileChange' })]);
        expect(completed).toEqual([expect.objectContaining({
            content: 'design/card.md',
            deletions: 1,
            insertions: 1,
            output: 'updated',
            paths: ['design/card.md'],
            providerItemId: 'edit-1',
            status: 'completed',
        })]);
    });

    it('keeps failed and malformed file results visible without counts', () => {
        const failedDecoder = new ClaudeFileResultDecoder();
        failedDecoder.decode(assistant([
            { id: 'write-failed', input: { file_path: 'failed.md' }, name: 'Write', type: 'tool_use' },
        ]));
        const failed = failedDecoder.decode({
            message: { content: [{ content: 'permission denied', is_error: true, tool_use_id: 'write-failed', type: 'tool_result' }] },
            tool_use_result: { structuredPatch: [{ lines: ['+must not count'] }] },
            type: 'user',
        });
        const malformedDecoder = new ClaudeFileResultDecoder();
        malformedDecoder.decode(assistant([
            { id: 'write-malformed', input: { file_path: 'malformed.md' }, name: 'Write', type: 'tool_use' },
        ]));
        const malformed = malformedDecoder.decode({
            message: { content: [{ content: 'done', tool_use_id: 'write-malformed', type: 'tool_result' }] },
            tool_use_result: { structuredPatch: [{ lines: ['bad'] }] },
            type: 'user',
        });

        expect(failed[0]).toMatchObject({ output: 'permission denied', status: 'failed' });
        expect(failed[0]).not.toHaveProperty('insertions');
        expect(malformed[0]).toMatchObject({ output: 'done', status: 'completed' });
        expect(malformed[0]).not.toHaveProperty('insertions');
    });

    it.each(['permission denied', 'cancelled'])('does not count %s file results', (content) => {
        const decoder = new ClaudeFileResultDecoder();
        decoder.decode(assistant([
            { id: `write-${content}`, input: { file_path: 'unchanged.md' }, name: 'Write', type: 'tool_use' },
        ]));
        const [completed] = decoder.decode({
            message: {content: [{ content, is_error: true, tool_use_id: `write-${content}`, type: 'tool_result' }]},
            tool_use_result: { structuredPatch: [{ lines: ['+must not count'] }] },
            type: 'user',
        });

        expect(completed).toMatchObject({ output: content, status: 'failed' });
        expect(completed).not.toHaveProperty('deletions');
        expect(completed).not.toHaveProperty('insertions');
    });

    it('retains explicit zero counts for a successful no-op', () => {
        const decoder = new ClaudeFileResultDecoder();
        decoder.decode(assistant([
            { id: 'edit-noop', input: { file_path: 'same.md' }, name: 'Edit', type: 'tool_use' },
        ]));
        const [completed] = decoder.decode({
            message: { content: [{ content: 'No changes', tool_use_id: 'edit-noop', type: 'tool_result' }] },
            tool_use_result: { structuredPatch: [] },
            type: 'user',
        });

        expect(completed).toMatchObject({ deletions: 0, insertions: 0, status: 'completed' });
    });

    it('ignores unsupported tools, incomplete results, and ambiguous multiple result payloads', () => {
        const decoder = new ClaudeFileResultDecoder();
        expect(decoder.decode(assistant([
            { id: 'read-1', input: { file_path: 'read.md' }, name: 'Read', type: 'tool_use' },
            { input: { file_path: 'missing-id.md' }, name: 'Write', type: 'tool_use' },
        ]))).toEqual([]);
        expect(decoder.decode({ message: { content: [] }, type: 'user' })).toEqual([]);

        decoder.decode(assistant([
            { id: 'first', input: { file_path: 'first.md' }, name: 'Write', type: 'tool_use' },
            { id: 'second', input: { file_path: 'second.md' }, name: 'Write', type: 'tool_use' },
        ]));
        const completed = decoder.decode({
            message: {
                content: [
                    { content: 'first', tool_use_id: 'first', type: 'tool_result' },
                    { content: 'second', tool_use_id: 'second', type: 'tool_result' },
                ],
            },
            tool_use_result: { structuredPatch: [{ lines: ['+ambiguous'] }] },
            type: 'user',
        });

        expect(completed).toHaveLength(2);
        expect(completed.every((event) => !Object.hasOwn(event, 'insertions'))).toBe(true);
    });
});
