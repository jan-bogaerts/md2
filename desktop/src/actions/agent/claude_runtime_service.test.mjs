import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ClaudeRuntimeService } = require('./claude_runtime_service');

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

        expect(service.publishRateLimits(payload(), 100)).toBe(true);
        expect(service.getSnapshot()).toEqual({ available: true, observedAt: 100, windows: payload().windows });
        const lateListener = vi.fn();
        service.subscribe(lateListener);

        expect(listener).toHaveBeenCalledOnce();
        expect(lateListener).toHaveBeenCalledWith(service.getSnapshot());
    });

    it('rejects partial, malformed, and older snapshots', () => {
        const service = new ClaudeRuntimeService();
        service.publishRateLimits(payload(70), 200);

        expect(service.publishRateLimits(payload(10), 199)).toBe(false);
        expect(service.publishRateLimits({ windows: [payload().windows[0]] }, 201)).toBe(false);
        expect(service.publishRateLimits({
            windows: [
                { ...payload().windows[0], usedPercent: 10.5 },
                payload().windows[1],
            ],
        }, 201)).toBe(false);
        expect(service.getSnapshot()).toMatchObject({ observedAt: 200, windows: [{ usedPercent: 70 }, { usedPercent: 40 }] });
    });

    it('advances observation time without republishing unchanged usage', () => {
        const service = new ClaudeRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);
        service.publishRateLimits(payload(), 100);

        expect(service.publishRateLimits(payload(), 200)).toBe(true);
        expect(service.getSnapshot()).toMatchObject({ observedAt: 200 });
        expect(listener).toHaveBeenCalledOnce();
    });

    it('publishes unavailable state once and keeps newest observation', () => {
        const service = new ClaudeRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);

        expect(service.publishUnavailable(300)).toBe(true);
        expect(service.publishUnavailable(301)).toBe(true);
        expect(service.publishUnavailable(299)).toBe(false);
        expect(service.getSnapshot()).toEqual({ available: false, observedAt: 301, windows: [] });
        expect(listener).toHaveBeenCalledOnce();
    });
});
