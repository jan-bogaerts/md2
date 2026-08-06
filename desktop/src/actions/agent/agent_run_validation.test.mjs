import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    readOptionalString,
    requireCommand,
    requireProjectFolder,
    requireQueuedMessageSession,
    requireString,
} = require('./agent_run_validation');

describe('agent run validation', () => {
    it('names the missing field it rejected', () => {
        expect(requireString('claude', 'agent')).toBe('claude');
        expect(() => requireString('', 'agent')).toThrow('Missing agent agent');
        expect(() => requireString(undefined, 'prompt')).toThrow('Missing agent prompt');
    });

    it('accepts an empty project folder but not a missing one', () => {
        expect(requireProjectFolder('')).toBe('');
        expect(() => requireProjectFolder(undefined)).toThrow('Missing agent projectFolder');
    });

    it('rejects an empty command and reports the offending argument index', () => {
        expect(requireCommand(['codex', 'exec'])).toEqual(['codex', 'exec']);
        expect(() => requireCommand([])).toThrow('Missing agent command');
        expect(() => requireCommand(['codex', ''])).toThrow('Missing agent command[1]');
    });

    it('treats null and undefined optional strings as absent', () => {
        expect(readOptionalString(null, 'cardPath')).toBeNull();
        expect(readOptionalString(undefined, 'cardPath')).toBeNull();
        expect(readOptionalString('design/card.md', 'cardPath')).toBe('design/card.md');
        expect(() => readOptionalString('', 'cardPath')).toThrow('Missing agent cardPath');
    });

    it('rejects queued message sessions that are invalid or superseded', () => {
        const run = { queuedMessageSessionId: 2 };

        expect(() => requireQueuedMessageSession(run, 2)).not.toThrow();
        expect(() => requireQueuedMessageSession(run, 1)).toThrow('Queued agent message session expired');
        expect(() => requireQueuedMessageSession(run, 0)).toThrow('Invalid queued agent message session');
    });
});
