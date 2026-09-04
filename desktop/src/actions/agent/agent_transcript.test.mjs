import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { normalizeConversationContext } = require('./agent_transcript');

function conversation() {
    return {
        entries: [
            { content: 'first', id: 'm1', kind: 'message', role: 'user', timestamp: '2026-01-01T00:00:01.000Z' },
            { agent: 'claude', content: '\u001b[31manswer\u001b[0m', id: 'm2', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:02.000Z' },
            { content: 'tests passed', id: 'e1', kind: 'event', timestamp: '2026-01-01T00:00:02.500Z', type: 'tool.command_execution' },
            { content: 'hidden', id: 'e2', kind: 'event', timestamp: '2026-01-01T00:00:02.600Z', type: 'diagnostic' },
            { content: 'permission denied', id: 'e3', kind: 'event', timestamp: '2026-01-01T00:00:02.700Z', type: 'error' },
            { content: 'next', id: 'm3', kind: 'message', role: 'user', timestamp: '2026-01-01T00:00:03.000Z' },
        ],
    };
}

describe('normalizeConversationContext', () => {
    it('keeps ordered user and assistant messages without conversation events', () => {
        const result = normalizeConversationContext(conversation());

        expect(result).toContain('[User]\n\nfirst');
        expect(result).toContain('[Assistant (claude)]\n\nanswer');
        expect(result).toContain('[User]\n\nnext');
        expect(result).not.toContain('tests passed');
        expect(result).not.toContain('permission denied');
        expect(result).not.toContain('hidden');
        expect(result).not.toContain('\u001b');
    });

    it('returns only messages after provider cursor', () => {
        const result = normalizeConversationContext(conversation(), 'm2');

        expect(result).toContain('next');
        expect(result).not.toContain('tests passed');
        expect(result).not.toContain('permission denied');
        expect(result).not.toContain('first');
        expect(result).not.toContain('answer');
    });

    it('uses full history when the provider cursor does not exist', () => {
        expect(normalizeConversationContext(conversation(), 'missing')).toContain('first');
    });

    it('excludes all event types between messages', () => {
        const timestamp = '2026-01-01T00:00:00.000Z';
        const result = normalizeConversationContext({
            entries: [
                {
                    command: 'npm test', content: 'passed', id: 'command-1', label: 'Command',
                    kind: 'event', providerItemId: 'command-1', sequence: 2, status: 'completed', timestamp, type: 'commandExecution',
                },
                {
                    content: 'hidden chain of thought', id: 'reasoning-1', label: 'Reasoning',
                    kind: 'event', providerItemId: 'reasoning-1', sequence: 1, status: 'completed', timestamp, type: 'reasoning',
                },
                { content: 'after command', id: 'message-1', kind: 'message', role: 'assistant', sequence: 3, timestamp },
            ],
        });

        expect(result).toContain('[Assistant]\n\nafter command');
        expect(result).not.toContain('npm test');
        expect(result).not.toContain('passed');
        expect(result).not.toContain('hidden chain of thought');
    });

    it('uses entry positions after cursor even when timestamps and sequences disagree', () => {
        const timestamp = '2026-01-01T00:00:00.000Z';
        const result = normalizeConversationContext({
            entries: [
                { content: 'cursor', id: 'm1', kind: 'message', role: 'assistant', sequence: 10, timestamp },
                { content: 'interleaved', id: 'e1', kind: 'event', sequence: 1, timestamp, type: 'error' },
                { content: 'next', id: 'm2', kind: 'message', role: 'user', sequence: 2, timestamp },
            ],
        }, 'm1');

        expect(result).not.toContain('interleaved');
        expect(result).toContain('next');
        expect(result).not.toContain('cursor');
    });

    it('returns empty context when the conversation contains only events', () => {
        const result = normalizeConversationContext({
            entries: [{
                command: 'npm test',
                content: 'failed',
                id: 'command-1',
                kind: 'event',
                timestamp: '2026-01-01T00:00:00.000Z',
                type: 'commandExecution',
            }],
        });

        expect(result).toBe('');
    });
});
