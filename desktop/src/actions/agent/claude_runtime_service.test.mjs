import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ClaudeRuntimeService } = require('./claude_runtime_service');

const ACCOUNT_ID = 'claude-initial';
const WORK_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function payload(fiveHourPercent = 20, weeklyPercent = 40) {
    return {
        windows: [
            { id: 'five_hour', resetsAt: 1_000, usedPercent: fiveHourPercent },
            { id: 'weekly', resetsAt: 2_000, usedPercent: weeklyPercent },
        ],
    };
}

describe('ClaudeRuntimeService', () => {
    it('normalizes snapshots and replays current state', () => {
        const service = new ClaudeRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);

        expect(service.publishRateLimits(ACCOUNT_ID, payload(), 100)).toBe(true);
        expect(service.getSnapshot(ACCOUNT_ID))
            .toEqual({ accountId: ACCOUNT_ID, available: true, observedAt: 100, windows: payload().windows });
        const lateListener = vi.fn();
        service.subscribe(lateListener);

        expect(listener).toHaveBeenCalledOnce();
        expect(lateListener).toHaveBeenCalledWith(service.getSnapshot(ACCOUNT_ID));
    });

    it('rejects partial, malformed, and older snapshots', () => {
        const service = new ClaudeRuntimeService();
        service.publishRateLimits(ACCOUNT_ID, payload(70), 200);

        expect(service.publishRateLimits(ACCOUNT_ID, payload(10), 199)).toBe(false);
        expect(service.publishRateLimits(ACCOUNT_ID, { windows: [payload().windows[0]] }, 201)).toBe(false);
        expect(service.publishRateLimits(ACCOUNT_ID, {
            windows: [
                { ...payload().windows[0], usedPercent: 10.5 },
                payload().windows[1],
            ],
        }, 201)).toBe(false);
        expect(service.getSnapshot(ACCOUNT_ID)).toMatchObject({ observedAt: 200, windows: [{ usedPercent: 70 }, { usedPercent: 40 }] });
    });

    it('keeps a window Claude reported without a reset time', () => {
        const service = new ClaudeRuntimeService();
        const windows = [{ ...payload().windows[0], resetsAt: null }, payload().windows[1]];

        expect(service.publishRateLimits(ACCOUNT_ID, { windows }, 100)).toBe(true);
        expect(service.getSnapshot(ACCOUNT_ID)).toEqual({ accountId: ACCOUNT_ID, available: true, observedAt: 100, windows });
    });

    it('advances observation time without republishing unchanged usage', () => {
        const service = new ClaudeRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);
        service.publishRateLimits(ACCOUNT_ID, payload(), 100);

        expect(service.publishRateLimits(ACCOUNT_ID, payload(), 200)).toBe(true);
        expect(service.getSnapshot(ACCOUNT_ID)).toMatchObject({ observedAt: 200 });
        expect(listener).toHaveBeenCalledOnce();
    });

    it('publishes unavailable state once and keeps newest observation', () => {
        const service = new ClaudeRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);

        expect(service.publishUnavailable(ACCOUNT_ID, 300)).toBe(true);
        expect(service.publishUnavailable(ACCOUNT_ID, 301)).toBe(true);
        expect(service.publishUnavailable(ACCOUNT_ID, 299)).toBe(false);
        expect(service.getSnapshot(ACCOUNT_ID)).toEqual({ accountId: ACCOUNT_ID, available: false, observedAt: 301, windows: [] });
        expect(listener).toHaveBeenCalledOnce();
    });

    it('keeps a failing account unavailable without touching another account snapshot', () => {
        const service = new ClaudeRuntimeService();
        service.publishRateLimits(ACCOUNT_ID, payload(30), 100);

        expect(service.publishUnavailable(WORK_ACCOUNT_ID, 200)).toBe(true);

        expect(service.getSnapshot(ACCOUNT_ID)).toMatchObject({ accountId: ACCOUNT_ID, available: true, observedAt: 100 });
        expect(service.getSnapshot(WORK_ACCOUNT_ID))
            .toEqual({ accountId: WORK_ACCOUNT_ID, available: false, observedAt: 200, windows: [] });
    });
});
