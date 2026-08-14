import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { CodexRuntimeService } = require('./codex_runtime_service');

function bucket(limitId, usedPercent, overrides = {}) {
    return {
        credits: null,
        individualLimit: null,
        limitId,
        limitName: limitId === 'codex' ? 'Codex' : null,
        planType: 'plus',
        primary: { resetsAt: 100, usedPercent, windowDurationMins: 300 },
        rateLimitReachedType: null,
        secondary: null,
        ...overrides,
    };
}

describe('CodexRuntimeService', () => {
    it('publishes each confirmed update mismatch once per session and replays latest state', () => {
        const service = new CodexRuntimeService();
        const listener = vi.fn();
        service.subscribeUpdateRequired(listener);

        expect(service.publishUpdateRequired('0.144.6', '0.146.0')).toBe(true);
        expect(service.publishUpdateRequired('0.144.6', '0.146.0')).toBe(false);
        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith({ cacheVersion: '0.146.0', runningVersion: '0.144.6' });

        const lateListener = vi.fn();
        service.subscribeUpdateRequired(lateListener);
        expect(lateListener).toHaveBeenCalledWith({ cacheVersion: '0.146.0', runningVersion: '0.144.6' });
    });

    it('normalizes multi-bucket snapshots and publishes current state to subscribers', () => {
        const service = new CodexRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);

        expect(service.publishRateLimits({
            rateLimitResetCredits: { availableCount: 0, credits: [] },
            rateLimits: bucket('codex', 10),
            rateLimitsByLimitId: {
                codex: bucket(null, 20),
                review: bucket('review', 40, {
                    primary: null,
                    secondary: { resetsAt: null, usedPercent: 40, windowDurationMins: null },
                }),
            },
        }, 200)).toBe(true);

        expect(service.getSnapshot()).toEqual({
            available: true,
            buckets: [
                expect.objectContaining({ limitId: 'codex', primary: expect.objectContaining({ usedPercent: 20 }) }),
                expect.objectContaining({ limitId: 'review', secondary: expect.objectContaining({ usedPercent: 40 }) }),
            ],
            observedAt: 200,
            rateLimitResetCredits: { availableCount: 0, credits: [] },
        });
        const lateListener = vi.fn();
        service.subscribe(lateListener);
        expect(listener).toHaveBeenCalledOnce();
        expect(lateListener).toHaveBeenCalledWith(service.getSnapshot());
    });

    it('merges sparse updates without erasing other buckets or nullable account fields', () => {
        const service = new CodexRuntimeService();
        service.publishRateLimits({
            rateLimitResetCredits: { availableCount: 1, credits: null },
            rateLimits: bucket('codex', 10),
            rateLimitsByLimitId: {
                codex: bucket('codex', 10),
                review: bucket('review', 40),
            },
        }, 100);

        service.publishRateLimits({rateLimits: bucket('codex', 70, { credits: null, limitName: null, planType: null })}, 101, true);

        expect(service.getSnapshot()).toMatchObject({
            buckets: [
                { credits: null, limitId: 'codex', limitName: 'Codex', planType: 'plus', primary: { usedPercent: 70 } },
                { limitId: 'review', primary: { usedPercent: 40 } },
            ],
            rateLimitResetCredits: { availableCount: 1, credits: null },
        });
    });

    it('accepts valid sparse updates with omitted optional fields', () => {
        const service = new CodexRuntimeService();
        service.publishRateLimits({
            rateLimits: bucket('codex', 20),
            rateLimitsByLimitId: null,
        }, 10);

        expect(service.publishRateLimits({
            rateLimits: {
                limitId: 'codex',
                primary: { usedPercent: 45 },
            },
        }, 11, true)).toBe(true);
        expect(service.getSnapshot()).toMatchObject({
            buckets: [{
                limitId: 'codex',
                limitName: 'Codex',
                primary: { resetsAt: 100, usedPercent: 45, windowDurationMins: 300 },
            }],
            observedAt: 11,
        });
    });

    it('rejects malformed and older reports without erasing newer data', () => {
        const service = new CodexRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);
        service.publishRateLimits({ rateLimits: bucket('codex', 80) }, 200);

        expect(service.publishRateLimits({ rateLimits: bucket('codex', 10) }, 199)).toBe(false);
        expect(service.publishRateLimits({ rateLimits: { ...bucket('codex', 10), primary: { usedPercent: 'bad' } } }, 201)).toBe(false);
        expect(service.getSnapshot()).toMatchObject({
            buckets: [{ limitId: 'codex', primary: { usedPercent: 80 } }],
            observedAt: 200,
        });
        expect(listener).toHaveBeenCalledOnce();
    });

    it('publishes unavailable state without fabricating usage and keeps no persistence dependency', () => {
        const service = new CodexRuntimeService();
        const listener = vi.fn();
        service.subscribe(listener);

        expect(service.publishUnavailable(300)).toBe(true);
        expect(service.getSnapshot()).toEqual({
            available: false,
            buckets: [],
            observedAt: 300,
            rateLimitResetCredits: null,
        });
        expect(listener).toHaveBeenCalledWith(service.getSnapshot());
        expect(Object.hasOwn(service, 'persistConversation')).toBe(false);
    });
});
