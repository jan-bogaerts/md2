import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createWindowWithStartupUsageRefresh } = require('./startup_usage_refresh');

describe('createWindowWithStartupUsageRefresh', () => {
    it('starts account usage first and creates window without waiting for provider completion', () => {
        const pendingRefresh = Promise.withResolvers();
        const calls = [];
        const agentProfiles = [{ command: ['codex'], name: 'codex' }];
        const agentRunnerService = {
            requestStartupUsageRefresh: vi.fn(() => {
                calls.push('refresh');

                return pendingRefresh.promise;
            }),
        };
        const window = { id: 1 };
        const createWindow = vi.fn(() => {
            calls.push('window');

            return window;
        });

        const result = createWindowWithStartupUsageRefresh({ agentProfiles, agentRunnerService, createWindow });

        expect(result).toBe(window);
        expect(calls).toEqual(['refresh', 'window']);
        expect(agentRunnerService.requestStartupUsageRefresh).toHaveBeenCalledWith(agentProfiles);
        expect(createWindow).toHaveBeenCalledOnce();
    });
});
