import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { countUnifiedDiffLines, normalizeCodexEvent } = require('./agent_codex_event');

describe('Codex event normalization', () => {
    it('counts unified diff content lines across hunks without counting file headers', () => {
        const diff = [
            'diff --git a/first.txt b/first.txt',
            '--- a/first.txt',
            '+++ b/first.txt',
            '@@ -1,2 +1,3 @@',
            ' unchanged',
            '-old',
            '+new',
            '+++content beginning with pluses',
            '@@ -8 +9,0 @@',
            '-removed',
            '\\ No newline at end of file',
        ].join('\n');

        expect(countUnifiedDiffLines(diff)).toEqual({ deletions: 2, insertions: 2 });
    });

    it('rejects absent and structurally incomplete unified diffs', () => {
        expect(countUnifiedDiffLines('')).toBeNull();
        expect(countUnifiedDiffLines('diff --git a/file.txt b/file.txt')).toBeNull();
        expect(countUnifiedDiffLines('@@ -1,2 +1,1 @@\n-old\n+new')).toBeNull();
    });

    it.each([
        ['added', { diff: 'one\ntwo', kind: { type: 'add' }, path: 'added.txt' }, { deletions: 0, insertions: 2 }],
        ['deleted', { diff: 'one\ntwo', kind: { type: 'delete' }, path: 'deleted.txt' }, { deletions: 2, insertions: 0 }],
        ['updated', { diff: '@@ -1 +1 @@\n-old\n+new', kind: { type: 'update' }, path: 'updated.txt' }, { deletions: 1, insertions: 1 }],
    ])('counts real-shape %s files only after completion', (description, change, expectedUsage) => {
        const item = { changes: [change], id: `file-${description}`, type: 'fileChange' };

        expect(normalizeCodexEvent(item, 'completed')).toMatchObject({ ...expectedUsage, status: 'completed' });
        expect(normalizeCodexEvent(item, 'inProgress')).not.toMatchObject({
            deletions: expect.anything(),
            insertions: expect.anything(),
        });
    });

    it('sums mixed added, deleted, and updated changes and renders readable content', () => {
        const changes = [
            { diff: '@@ -1 +1 @@\n-old\n+new', kind: { type: 'update' }, path: 'updated.txt' },
            { diff: 'one\ntwo', kind: { type: 'add' }, path: 'added.txt' },
            { diff: 'removed\n', kind: { type: 'delete' }, path: 'deleted.txt' },
        ];
        const item = { changes, id: 'file-1', type: 'fileChange' };

        expect(normalizeCodexEvent(item, 'completed')).toMatchObject({
            content: 'update: updated.txt\nadd: added.txt\ndelete: deleted.txt',
            deletions: 2,
            insertions: 3,
            status: 'completed',
        });
    });

    it('counts empty files and trailing newlines without creating phantom content lines', () => {
        const changes = [
            { diff: '', kind: { type: 'add' }, path: 'empty.txt' },
            { diff: 'first\nsecond\n', kind: { type: 'add' }, path: 'trailing-newline.txt' },
            { diff: 'first\nsecond', kind: { type: 'delete' }, path: 'no-trailing-newline.txt' },
        ];

        expect(normalizeCodexEvent({ changes, id: 'file-2', type: 'fileChange' }, 'completed'))
            .toMatchObject({ deletions: 2, insertions: 2 });
    });

    it('keeps valid multi-file usage when another change kind is unsupported', () => {
        const changes = [
            { diff: 'one\ntwo\nthree', kind: { type: 'add' }, path: 'added.txt' },
            { diff: '@@ -1 +1 @@\n-old\n+new', kind: { type: 'update' }, path: 'updated.txt' },
            { diff: 'ignored', kind: { type: 'move' }, path: 'moved.txt' },
        ];

        expect(normalizeCodexEvent({ changes, id: 'file-3', type: 'fileChange' }, 'completed'))
            .toMatchObject({ deletions: 1, insertions: 4 });
    });

    it('does not count missing added-file content or discard another valid change', () => {
        const changes = [
            { kind: { type: 'add' }, path: 'missing-content.txt' },
            { diff: 'one\ntwo', kind: { type: 'delete' }, path: 'deleted.txt' },
        ];

        expect(normalizeCodexEvent({ changes, id: 'file-missing-content', type: 'fileChange' }, 'completed'))
            .toMatchObject({ deletions: 2, insertions: 0 });
        expect(normalizeCodexEvent({ changes: [changes[0]], id: 'file-only-missing-content', type: 'fileChange' }, 'completed'))
            .not.toMatchObject({ deletions: expect.anything(), insertions: expect.anything() });
    });

    it('reports 141 insertions for verified 126-line addition plus 15-line update', () => {
        const addedContent = Array.from({ length: 126 }, (_, index) => `added ${index + 1}`).join('\n');
        const updateDiff = `@@ -0,0 +1,15 @@\n${Array.from({ length: 15 }, (_, index) => `+updated ${index + 1}`).join('\n')}`;
        const changes = [
            { diff: addedContent, kind: { type: 'add' }, path: 'added.txt' },
            { diff: updateDiff, kind: { type: 'update' }, path: 'updated.txt' },
        ];

        expect(normalizeCodexEvent({ changes, id: 'file-4', type: 'fileChange' }, 'completed'))
            .toMatchObject({ deletions: 0, insertions: 141 });
    });

    it('reports 203 insertions across three added files', () => {
        const changes = [100, 60, 43].map((lineCount, index) => ({
            diff: Array.from({ length: lineCount }, () => 'line').join('\n'),
            kind: { type: 'add' },
            path: `added-${index + 1}.txt`,
        }));

        expect(normalizeCodexEvent({ changes, id: 'file-5', type: 'fileChange' }, 'completed'))
            .toMatchObject({ deletions: 0, insertions: 203 });
    });

    it.each(['fileChange', 'file_change', 'file-change'])('normalizes %s to canonical fileChange', (type) => {
        const changes = [{ diff: 'line', kind: { type: 'add' }, path: 'added.txt' }];

        expect(normalizeCodexEvent({ changes, id: `file-${type}`, type }, 'completed'))
            .toMatchObject({ insertions: 1, type: 'fileChange' });
    });

    it('selects readable tool fields without persisting raw nested JSON', () => {
        const event = normalizeCodexEvent({
            arguments: {
                count: 2,
                nested: { secret: 'hidden' },
                query: 'Codex schema',
            },
            id: 'tool-1',
            result: {
                content: [{ type: 'text', text: 'Found result' }],
                structuredContent: { metadata: { source: 'hidden' }, resultCount: 1 },
            },
            server: 'docs',
            tool: 'search',
            type: 'mcpToolCall',
        }, 'completed');

        expect(event).toMatchObject({
            content: 'Count: 2\nQuery: Codex schema',
            label: 'docs: search',
            output: 'Type: text\nText: Found result\nResult Count: 1',
        });
        expect(JSON.stringify(event)).not.toContain('secret');
        expect(JSON.stringify(event)).not.toContain('source');
        expect(event.content).not.toContain('{');
        expect(event.output).not.toContain('{');
    });
});
