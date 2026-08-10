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

    it('adds cumulative line usage only to completed file changes with countable diffs', () => {
        const changes = [
            { diff: '@@ -1 +1 @@\n-old\n+new', kind: 'update', path: 'first.txt' },
            { diff: '@@ -0,0 +1,2 @@\n+one\n+two', kind: 'add', path: 'second.txt' },
            { kind: 'update', path: 'without-diff.txt' },
        ];
        const item = { changes, id: 'file-1', type: 'fileChange' };

        expect(normalizeCodexEvent(item, 'completed')).toMatchObject({ deletions: 1, insertions: 3, status: 'completed' });
        expect(normalizeCodexEvent(item, 'inProgress')).not.toMatchObject({
            deletions: expect.anything(),
            insertions: expect.anything(),
        });
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
