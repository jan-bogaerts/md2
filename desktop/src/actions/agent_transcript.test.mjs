import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { normalizeConversationContext } = require('./agent_transcript');

function conversation() {
    return {
        events: [
            { content: 'tests passed', id: 'e1', timestamp: '2026-01-01T00:00:02.500Z', type: 'tool.command_execution' },
            { content: 'hidden', id: 'e2', timestamp: '2026-01-01T00:00:02.600Z', type: 'diagnostic' },
            { content: 'permission denied', id: 'e3', timestamp: '2026-01-01T00:00:02.700Z', type: 'error' },
        ],
        messages: [
            { content: 'first', id: 'm1', role: 'user', timestamp: '2026-01-01T00:00:01.000Z' },
            { agent: 'claude', content: '\u001b[31manswer\u001b[0m', id: 'm2', role: 'assistant', timestamp: '2026-01-01T00:00:02.000Z' },
            { content: 'next', id: 'm3', role: 'user', timestamp: '2026-01-01T00:00:03.000Z' },
        ],
    };
}

describe('normalizeConversationContext', () => {
    it('keeps ordered transcript identity and relevant tool output without protocol or reasoning', () => {
        const result = normalizeConversationContext(conversation());

        expect(result).toContain('[User]\n\nfirst');
        expect(result).toContain('[Assistant (claude)]\n\nanswer');
        expect(result).toContain('[Tool (command_execution)]\n\ntests passed');
        expect(result).toContain('[Failure]\n\npermission denied');
        expect(result).not.toContain('hidden');
        expect(result).not.toContain('\u001b');
    });

    it('returns only messages and events after provider cursor', () => {
        const result = normalizeConversationContext(conversation(), 'm2');

        expect(result).toContain('tests passed');
        expect(result).toContain('next');
        expect(result).not.toContain('first');
        expect(result).not.toContain('answer');
    });

    it('uses full history when the provider cursor does not exist', () => {
        expect(normalizeConversationContext(conversation(), 'missing')).toContain('first');
    });
});
