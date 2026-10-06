import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { attachRunProtocol } = require('./agent_run_state');

function completeWrite(_message, callback) {
    callback();
}

describe('attachRunProtocol', () => {
    it.each([
        [null, 'priority', 'thread/start'],
        ['saved-thread', 'default', 'thread/resume'],
    ])('forwards Codex execution settings through run setup for %s', async (providerConversationId, serviceTier, method) => {
        const executionSettings = { model: 'gpt-6.1-sol', effort: 'xhigh', serviceTier };
        const writeLine = vi.fn(completeWrite);
        const run = {
            agent: 'codex',
            child: { stdin: { write: writeLine } },
            conversation: { providerSessions: [] },
            request: { executionSettings },
            streaming: true,
        };
        attachRunProtocol(run, {
            onCodexRuntimeEvent: vi.fn(),
            onMalformedOutput: vi.fn(),
            onProviderEvent: vi.fn(),
            onStreamingEvent: vi.fn(),
            onStreamingLine: vi.fn(),
            providerConversationId,
            rootPath: '/repo',
        });
        const adapter = run.streamingAdapter;

        await adapter.start('first prompt');
        await adapter.handleMessage({ id: 1, result: {} });
        const threadRequests = writeLine.mock.calls.map(([message]) => JSON.parse(message));
        expect(threadRequests).toContainEqual(expect.objectContaining({
            method,
            params: expect.objectContaining({
                model: executionSettings.model,
                serviceTier,
                config: { model_reasoning_effort: executionSettings.effort },
            }),
        }));
        await adapter.handleMessage({
            id: 3,
            result: { thread: { id: 'saved-thread' }, model: executionSettings.model, serviceTier },
        });
        await adapter.sendMessage('second prompt');
        const turnRequests = writeLine.mock.calls.map(([message]) => JSON.parse(message))
            .filter(({ method: requestMethod }) => requestMethod === 'turn/start');

        expect(turnRequests).toHaveLength(2);
        for (const { params } of turnRequests) {
            expect(params).toMatchObject(executionSettings);
        }
    });
});
