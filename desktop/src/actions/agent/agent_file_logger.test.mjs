import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { formatAgentLogEntry, logAgentEvent } = require('./agent_file_logger');

describe('agent file logger', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('formats console-style values with an ISO timestamp', () => {
        const timestamp = new Date('2026-08-11T12:34:56.789Z');

        expect(formatAgentLogEntry(['[agent:start]', { pid: 42 }], timestamp))
            .toBe("2026-08-11T12:34:56.789Z [agent:start] { pid: 42 }");
    });

    it('does not write diagnostics while agent logging is disabled', () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        logAgentEvent('[agent:raw]', 'large protocol payload');

        expect(consoleLog).not.toHaveBeenCalled();
    });
});
