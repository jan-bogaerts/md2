import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { CODEX_TASK_TRACKING_INSTRUCTIONS, codexOneShotPrompt } = require('./agent_task_tracking');

describe('codexOneShotPrompt', () => {
    it('prepends task instructions for tracked Codex runs', () => {
        expect(codexOneShotPrompt('Review card', 'codex', true))
            .toBe(`${CODEX_TASK_TRACKING_INSTRUCTIONS}\n\nReview card`);
    });

    it.each([
        ['codex', false],
        ['claude', true],
    ])('keeps provider prompt unchanged for %s with task tracking %s', (agent, taskTrackingEnabled) => {
        expect(codexOneShotPrompt('Review card', agent, taskTrackingEnabled)).toBe('Review card');
    });
});
