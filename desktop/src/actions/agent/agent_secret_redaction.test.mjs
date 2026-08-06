import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    redactConversationEvent,
    redactSecrets,
    secretAnswerValues,
} = require('./agent_secret_redaction');

describe('agent secret redaction', () => {
    it('collects answers for secret questions only', () => {
        const questions = [
            { id: 'token', isSecret: true },
            { id: 'name', isSecret: false },
            { id: 'keys', isSecret: true },
        ];
        const answers = { keys: ['one', ''], name: 'jan', token: 'hunter2' };

        expect(secretAnswerValues(questions, answers)).toEqual(['one', 'hunter2']);
    });

    it('replaces every occurrence of each secret', () => {
        const secrets = new Set(['hunter2']);

        expect(redactSecrets('use hunter2 then hunter2', secrets)).toBe('use [secret] then [secret]');
    });

    it('redacts the longest secret first so overlapping values cannot leak', () => {
        const secrets = new Set(['abc', 'abcdef']);

        expect(redactSecrets('abcdef', secrets)).toBe('[secret]');
    });

    it('passes non-strings and empty secret sets through untouched', () => {
        expect(redactSecrets(undefined, new Set(['a']))).toBeUndefined();
        expect(redactSecrets('abc', new Set())).toBe('abc');
    });

    it('redacts every text field of a conversation event', () => {
        const secrets = new Set(['hunter2']);
        const event = {
            command: 'login hunter2',
            content: 'ok hunter2',
            details: ['a hunter2'],
            label: 'hunter2',
            output: 'hunter2 done',
            summary: ['hunter2'],
            type: 'command',
            workingDirectory: '/repo/hunter2',
        };

        expect(redactConversationEvent(event, secrets)).toEqual({
            command: 'login [secret]',
            content: 'ok [secret]',
            details: ['a [secret]'],
            label: '[secret]',
            output: '[secret] done',
            summary: ['[secret]'],
            type: 'command',
            workingDirectory: '/repo/[secret]',
        });
    });

    it('leaves non-array details and summary untouched', () => {
        const event = redactConversationEvent(
            { content: 'hunter2', details: undefined, summary: undefined },
            new Set(['hunter2']),
        );

        expect(event).toMatchObject({ content: '[secret]', details: undefined, summary: undefined });
    });
});
