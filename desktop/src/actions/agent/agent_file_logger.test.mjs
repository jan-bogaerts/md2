import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { formatAgentLogEntry } = require('./agent_file_logger');

describe('agent file logger', () => {
    it('formats console-style values with an ISO timestamp', () => {
        const timestamp = new Date('2026-08-11T12:34:56.789Z');

        expect(formatAgentLogEntry(['[agent:start]', { pid: 42 }], timestamp))
            .toBe("2026-08-11T12:34:56.789Z [agent:start] { pid: 42 }");
    });
});
