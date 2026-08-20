import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseClaudeUsageOutput } = require('./claude_usage_parsing');

const USAGE_OUTPUT = `You are currently using your subscription to power your Claude Code usage

Current session: 17% used · resets Aug 15, 9:49pm (Europe/Brussels)
Current week (all models): 13% used · resets Aug 16, 6:59pm (Europe/Brussels)
`;

const TERMINAL_USAGE_OUTPUT = `Settings  Status  Config  Usage  Stats

Current session
▌                                                  1% used
Resets 3:20pm (Europe/Brussels)

Current week (all models)
██████                                             12% used
Resets Aug 23, 7pm (Europe/Brussels)
`;

describe('parseClaudeUsageOutput', () => {
    it('parses both windows and converts localized IANA-zone resets to unix milliseconds', () => {
        const observedAt = Date.parse('2026-08-15T18:00:00.000Z');

        expect(parseClaudeUsageOutput(USAGE_OUTPUT, observedAt)).toEqual({
            windows: [
                { id: 'five_hour', resetsAt: Date.parse('2026-08-15T19:49:00.000Z'), usedPercent: 17 },
                { id: 'weekly', resetsAt: Date.parse('2026-08-16T16:59:00.000Z'), usedPercent: 13 },
            ],
        });
    });

    it('selects next year for a nearby January reset observed in December', () => {
        const output = USAGE_OUTPUT
            .replace('Aug 15, 9:49pm', 'Jan 1, 1:00am')
            .replace('Aug 16, 6:59pm', 'Jan 2, 1:00am');
        const observedAt = Date.parse('2026-12-31T22:00:00.000Z');

        expect(parseClaudeUsageOutput(output, observedAt)?.windows[0].resetsAt).toBe(Date.parse('2027-01-01T00:00:00.000Z'));
    });

    it('keeps support for mojibake legacy separators', () => {
        const output = USAGE_OUTPUT.replaceAll('·', 'Â·');
        const observedAt = Date.parse('2026-08-15T18:00:00.000Z');

        expect(parseClaudeUsageOutput(output, observedAt)?.windows.map(({ usedPercent }) => usedPercent)).toEqual([17, 13]);
    });

    it('parses full-screen session and weekly percentages with both reset formats', () => {
        const observedAt = Date.parse('2026-08-20T08:00:00.000Z');

        expect(parseClaudeUsageOutput(TERMINAL_USAGE_OUTPUT, observedAt)).toEqual({
            windows: [
                { id: 'five_hour', resetsAt: Date.parse('2026-08-20T13:20:00.000Z'), usedPercent: 1 },
                { id: 'weekly', resetsAt: Date.parse('2026-08-23T17:00:00.000Z'), usedPercent: 12 },
            ],
        });
    });

    it('uses the following local day when a time-only reset is after midnight', () => {
        const output = TERMINAL_USAGE_OUTPUT.replace('3:20pm', '1am');
        const observedAt = Date.parse('2026-08-20T21:00:00.000Z');

        expect(parseClaudeUsageOutput(output, observedAt)?.windows[0].resetsAt).toBe(Date.parse('2026-08-20T23:00:00.000Z'));
    });

    it('takes the first report when a redraw repeats the same window lines', () => {
        const observedAt = Date.parse('2026-08-15T18:00:00.000Z');
        const output = `${USAGE_OUTPUT}${USAGE_OUTPUT.replace('17% used', '19% used')}`;

        expect(parseClaudeUsageOutput(output, observedAt)?.windows.map(({ usedPercent }) => usedPercent)).toEqual([17, 13]);
    });

    it('rejects partial and malformed output', () => {
        const observedAt = Date.parse('2026-08-15T18:00:00.000Z');

        expect(parseClaudeUsageOutput(USAGE_OUTPUT.split('Current week')[0], observedAt)).toBeNull();
        expect(parseClaudeUsageOutput(USAGE_OUTPUT.replace('17% used', '101% used'), observedAt)).toBeNull();
        expect(parseClaudeUsageOutput(USAGE_OUTPUT.replace('Europe/Brussels', 'Invalid/Zone'), observedAt)).toBeNull();
    });
});
