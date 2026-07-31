import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { claudeAssistantText, claudeChangedPaths, claudeTranscriptEvents, claudeUsage } = require('./agent_claude_events');
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
        const changedPaths = claudeChangedPaths(assistant([
            { input: { file_path: 'design\\card.md' }, name: 'Write', type: 'tool_use' },
            { input: { file_path: 'design/card.md' }, name: 'Edit', type: 'tool_use' },
            { input: { file_path: 'C:\\outside\\secret.md' }, name: 'MultiEdit', type: 'tool_use' },
            { input: { notebook_path: 'notes/review.ipynb' }, name: 'NotebookEdit', type: 'tool_use' },
            { input: { file_path: 'ignored.md' }, name: 'Read', type: 'tool_use' },
        ]), ROOT_PATH);

        expect(changedPaths).toEqual(['design/card.md', 'notes/review.ipynb']);
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

    it('clamps unusable provider counters instead of poisoning running totals', () => {
        expect(claudeUsage({ type: 'result', usage: { input_tokens: -4, output_tokens: 'many' } })).toEqual({
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
        });
        expect(claudeUsage({ type: 'assistant', usage: { input_tokens: 5 } })).toBeNull();
    });
});
