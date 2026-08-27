import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    appendAssistantOutput,
    chunkSegment,
    completeAssistantOutput,
    createProviderEventEntryIndexes,
    lastMessageEntry,
    nextConversationSequence,
    nextRunSequence,
    replaceAssistantOutput,
    startAssistantItem,
} = require('./agent_run_transcript');

const TIMESTAMP = '2026-08-06T10:00:00.000Z';

function createTestRun({ entries = [], streaming = false } = {}) {
    return {
        agent: 'codex',
        assistantItemIndex: 0,
        assistantItems: new Map(),
        conversation: { entries },
        currentAssistantMessageId: null,
        id: 'run-1',
        nextSequence: 1,
        stdout: '',
        streaming,
        turnIndex: 1,
    };
}

describe('agent run transcript sequences', () => {
    it('continues past the highest sequence in a resumed conversation', () => {
        const conversation = { entries: [{ sequence: 4 }, { sequence: 9 }] };

        expect(nextConversationSequence(conversation)).toBe(10);
    });

    it('falls back to the entry count when entries carry no sequence', () => {
        const conversation = { entries: [{}, {}, {}] };

        expect(nextConversationSequence(conversation)).toBe(4);
    });

    it('hands out run sequences in order', () => {
        const run = createTestRun();

        expect([nextRunSequence(run), nextRunSequence(run)]).toEqual([1, 2]);
        expect(run.nextSequence).toBe(3);
    });

    it('indexes the first entry for each provider item id', () => {
        const indexes = createProviderEventEntryIndexes([
            { kind: 'message' },
            { kind: 'event', providerItemId: 'item-a' },
            { kind: 'event', providerItemId: 'item-b' },
            { kind: 'event', providerItemId: 'item-a' },
        ]);

        expect([...indexes]).toEqual([['item-a', 1], ['item-b', 2]]);
    });

    it('finds the last message entry past trailing events', () => {
        const conversation = {
            entries: [
                { content: 'first', kind: 'message' },
                { content: 'last', kind: 'message' },
                { kind: 'event' },
            ],
        };

        expect(lastMessageEntry(conversation)).toMatchObject({ content: 'last' });
    });
});

describe('agent run transcript chunk separators', () => {
    it('appends batch chunks as trimmed paragraphs', () => {
        expect(chunkSegment('', '\n\nfirst\n', false)).toBe('first');
        expect(chunkSegment('first', '\nsecond\n', false)).toBe('\n\nsecond');
        expect(chunkSegment('first', '\n\n', false)).toBe('');
    });

    it('appends streaming deltas verbatim so the adapter owns the separators', () => {
        expect(chunkSegment('first', '\n\n', true)).toBe('\n\n');
        expect(chunkSegment('', ' tail', true)).toBe(' tail');
    });
});

describe('agent run transcript assistant output', () => {
    it('creates one message and appends later chunks to it', () => {
        const run = createTestRun();

        const first = appendAssistantOutput(run, 'first', TIMESTAMP);
        const second = appendAssistantOutput(run, 'second', TIMESTAMP);

        expect(first.segment).toBe('first');
        expect(second.segment).toBe('\n\nsecond');
        expect(run.stdout).toBe('first\n\nsecond');
        expect(run.conversation.entries).toHaveLength(1);
        expect(run.conversation.entries[0]).toMatchObject({ content: 'first\n\nsecond', id: 'run-1-assistant', role: 'assistant' });
    });

    it('gives each streaming assistant item its own message', () => {
        const run = createTestRun({ streaming: true });
        const firstItem = startAssistantItem(run, 'item-1', TIMESTAMP);
        const secondItem = startAssistantItem(run, 'item-2', TIMESTAMP);
        run.conversation.entries.findIndex = vi.fn(() => { throw new Error('conversation history was scanned'); });

        appendAssistantOutput(run, 'one', TIMESTAMP, 'item-1');
        appendAssistantOutput(run, 'two', TIMESTAMP, 'item-2');

        expect([firstItem.entryIndex, secondItem.entryIndex]).toEqual([0, 1]);
        expect(run.conversation.entries.findIndex).not.toHaveBeenCalled();
        expect(run.conversation.entries.map(({ content, id }) => [id, content])).toEqual([
            ['run-1-turn-1-assistant-1', 'one'],
            ['run-1-turn-1-assistant-2', 'two'],
        ]);
        expect(run.stdout).toBe('onetwo');
    });

    it('rejects a duplicate assistant item', () => {
        const run = createTestRun({ streaming: true });
        startAssistantItem(run, 'item-1', TIMESTAMP);

        expect(() => startAssistantItem(run, 'item-1', TIMESTAMP)).toThrow('Duplicate assistant item item-1');
    });

    it('rejects output for an unknown assistant item', () => {
        const run = createTestRun({ streaming: true });

        expect(() => appendAssistantOutput(run, 'text', TIMESTAMP, 'missing')).toThrow('Missing assistant item missing');
    });

    it('replaces the final item text and reports the previous content', () => {
        const run = createTestRun({ streaming: true });
        startAssistantItem(run, 'item-1', TIMESTAMP);
        appendAssistantOutput(run, 'draft', TIMESTAMP, 'item-1');

        const replacement = replaceAssistantOutput(run, 'final', '2026-08-06T10:00:01.000Z', 'item-1');

        expect(replacement).toMatchObject({ previousContent: 'draft', replaced: true });
        expect(run.stdout).toBe('final');
        expect(run.conversation.entries[0]).toMatchObject({ content: 'final' });
    });

    it('reports no replacement when the content already matches', () => {
        const run = createTestRun({ streaming: true });
        startAssistantItem(run, 'item-1', TIMESTAMP);
        appendAssistantOutput(run, 'same', TIMESTAMP, 'item-1');

        expect(replaceAssistantOutput(run, 'same', TIMESTAMP, 'item-1').replaced).toBe(false);
    });

    it('refuses to replace an item that is no longer the latest output', () => {
        const run = createTestRun({ streaming: true });
        startAssistantItem(run, 'item-1', TIMESTAMP);
        appendAssistantOutput(run, 'first', TIMESTAMP, 'item-1');
        startAssistantItem(run, 'item-2', TIMESTAMP);
        appendAssistantOutput(run, 'second', TIMESTAMP, 'item-2');

        expect(() => replaceAssistantOutput(run, 'changed', TIMESTAMP, 'item-1'))
            .toThrow('Assistant item is not latest output: item-1');
    });

    it('stamps the completion time on the current assistant message', () => {
        const run = createTestRun({ streaming: true });
        startAssistantItem(run, 'item-1', TIMESTAMP);
        appendAssistantOutput(run, 'text', TIMESTAMP, 'item-1');

        completeAssistantOutput(run, '2026-08-06T10:00:05.000Z');

        expect(run.conversation.entries[0].timestamp).toBe('2026-08-06T10:00:05.000Z');
    });

    it('ignores completion when no assistant message was produced', () => {
        const run = createTestRun();

        expect(() => completeAssistantOutput(run, TIMESTAMP)).not.toThrow();
        expect(run.conversation.entries).toEqual([]);
    });
});
