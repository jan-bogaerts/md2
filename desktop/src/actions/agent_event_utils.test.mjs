import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { JsonLineBuffer } = require('./agent_event_utils');

describe('JsonLineBuffer', () => {
    it('parses protocol lines without logging raw provider payloads', () => {
        const onLine = vi.fn();
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const buffer = new JsonLineBuffer('codex', onLine);

        buffer.push('{"secret":"top-secret"}\n');

        expect(onLine).toHaveBeenCalledWith('{"secret":"top-secret"}');
        expect(log).not.toHaveBeenCalled();
        log.mockRestore();
    });
});
