import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { accountResetObservations, trackerKey } = require('./schedule_account_snapshots');

describe('schedule account snapshots', () => {
    it('normalizes Codex tracker identity and seconds-based reset timestamps', () => {
        const snapshot = {
            available: true,
            buckets: [{
                limitId: 'codex,pro',
                primary: { resetsAt: 1800000000, usedPercent: 10, windowDurationMins: 300 },
                secondary: null,
            }],
        };

        expect(accountResetObservations('codex', snapshot)).toEqual([{agent: 'codex', limitId: 'codex,pro', resetsAt: 1800000000000, windowId: 'primary'}]);
        expect(trackerKey('codex', 'codex,pro', 'primary')).toBe('codex\u0000codex,pro\u0000primary');
    });

    it('normalizes every Claude window under its default limit identity', () => {
        const snapshot = {
            available: true,
            windows: [
                { id: 'five_hour', resetsAt: 1800000000000, usedPercent: 10 },
                { id: 'weekly', resetsAt: 1800600000000, usedPercent: 20 },
            ],
        };

        expect(accountResetObservations('claude', snapshot)).toEqual([
            { agent: 'claude', limitId: 'default', resetsAt: 1800000000000, windowId: 'five_hour' },
            { agent: 'claude', limitId: 'default', resetsAt: 1800600000000, windowId: 'weekly' },
        ]);
    });

    it('ignores unavailable or incomplete tracker data and rejects unknown agents', () => {
        expect(accountResetObservations('codex', { available: false, buckets: [] })).toEqual([]);
        expect(accountResetObservations('claude', {
            available: true,
            windows: [{ id: 'weekly', resetsAt: null, usedPercent: 0 }],
        })).toEqual([]);
        expect(() => accountResetObservations('other', {})).toThrow('Unsupported account reset agent: other');
    });
});
