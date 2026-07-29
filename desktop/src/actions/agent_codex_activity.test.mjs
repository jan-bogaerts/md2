import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { normalizeCodexActivity } = require('./agent_codex_activity');

describe('Codex activity normalization', () => {
    it('selects readable tool fields without persisting raw nested JSON', () => {
        const activity = normalizeCodexActivity({
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

        expect(activity).toMatchObject({
            content: 'Count: 2\nQuery: Codex schema',
            label: 'docs: search',
            output: 'Type: text\nText: Found result\nResult Count: 1',
        });
        expect(JSON.stringify(activity)).not.toContain('secret');
        expect(JSON.stringify(activity)).not.toContain('source');
        expect(activity.content).not.toContain('{');
        expect(activity.output).not.toContain('{');
    });
});
