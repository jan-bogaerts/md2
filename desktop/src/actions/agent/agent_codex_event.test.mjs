import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { normalizeCodexEvent } = require('./agent_codex_event');

describe('Codex event normalization', () => {
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
