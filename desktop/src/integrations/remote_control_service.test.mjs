import { describe, expect, it, vi } from 'vitest';
import remoteControlModule from './remote_control_service.js';
import { WebSocket } from 'ws';

const { RemoteControlService } = remoteControlModule;

function createClient() {
    return { readyState: 1, send: vi.fn() };
}

describe('RemoteControlService push protocol', () => {
    it('accepts a tokenless WebSocket upgrade and omits token status', async () => {
        const service = new RemoteControlService({ invoke: vi.fn() });
        const status = await service.start({ host: '127.0.0.1', port: 0 });
        const socket = new WebSocket(status.endpoint);

        await new Promise((resolve, reject) => {
            socket.once('open', resolve);
            socket.once('error', reject);
        });

        expect(service.getStatus()).not.toHaveProperty('token');
        socket.close();
        await service.stop();
    });

    it('emits every push message with matching payload and cleans subscriptions', async () => {
        const callbacks = new Map();
        const cleanups = new Map();
        const dispatcher = {
            invoke: vi.fn((method, params) => {
                const callback = params.at(-1);
                callbacks.set(method, callback);
                if (method === 'runSearchRegexpAgent') return 'agent-1';

                const cleanup = vi.fn();
                cleanups.set(method, cleanup);

                return cleanup;
            }),
        };
        const service = new RemoteControlService(dispatcher);
        const client = createClient();
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
        const subscriptions = [
            ['watchProject', [project], 'watch-request'],
            ['onActionRun', [], 'action-request'],
            ['onClaudeRateLimits', [], 'claude-limits-request'],
            ['onCodexRateLimits', [], 'limits-request'],
            ['onMergeConflictSessionChanged', [], 'conflict-request'],
            ['onWorktreesChanged', [], 'worktrees-request'],
        ];
        const subscriptionResults = new Map();
        for (const [method, params, requestId] of subscriptions) {
            subscriptionResults.set(method, await service.invoke(client, method, params, requestId));
        }
        await service.invoke(client, 'runSearchRegexpAgent', ['find cards'], 'agent-request');

        const watchEvent = { changeKind: 'changed', path: 'design/F-1.md' };
        const actionEvent = { runId: 'action-1', sequence: 1, status: 'running', type: 'run' };
        const agentEvent = { content: 'working', runId: 'agent-1', type: 'output' };
        const claudeSnapshot = { available: true, observedAt: 11, windows: [] };
        const codexSnapshot = { available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null };
        const state = { error: null, primaryStatus: null, project, records: [] };
        const conflictSession = { conflictedPaths: ['src/file.js'], id: 'session-1' };
        callbacks.get('watchProject')(watchEvent);
        callbacks.get('runSearchRegexpAgent')(agentEvent);
        callbacks.get('onActionRun')(actionEvent);
        callbacks.get('onClaudeRateLimits')(claudeSnapshot);
        callbacks.get('onCodexRateLimits')(codexSnapshot);
        callbacks.get('onMergeConflictSessionChanged')(conflictSession);
        callbacks.get('onWorktreesChanged')(state);

        const messages = client.send.mock.calls.map(([message]) => JSON.parse(message));
        expect(messages).toEqual([
            { event: 'watchProject', payload: { event: watchEvent, requestId: 'watch-request', subscriptionId: subscriptionResults.get('watchProject').subscriptionId } },
            { event: 'agentRun', payload: { event: agentEvent, requestId: 'agent-request' } },
            { event: 'actionRun', payload: { event: actionEvent, requestId: 'action-request', subscriptionId: subscriptionResults.get('onActionRun').subscriptionId } },
            { event: 'claudeRateLimits', payload: { requestId: 'claude-limits-request', snapshot: claudeSnapshot, subscriptionId: subscriptionResults.get('onClaudeRateLimits').subscriptionId } },
            { event: 'codexRateLimits', payload: { requestId: 'limits-request', snapshot: codexSnapshot, subscriptionId: subscriptionResults.get('onCodexRateLimits').subscriptionId } },
            { event: 'mergeConflictSessionChanged', payload: { requestId: 'conflict-request', session: conflictSession, subscriptionId: subscriptionResults.get('onMergeConflictSessionChanged').subscriptionId } },
            { event: 'worktreesChanged', payload: { requestId: 'worktrees-request', state, subscriptionId: subscriptionResults.get('onWorktreesChanged').subscriptionId } },
        ]);

        for (const [method] of subscriptions) {
            expect(service.unsubscribe(client, [subscriptionResults.get(method).subscriptionId])).toBe(true);
            expect(cleanups.get(method)).toHaveBeenCalledOnce();
        }
    });
    it('sends the error code and marker fields so remote clients can recover', async () => {
        const missingWorkingFolder = new Error('Working folder is missing: design/feature_descriptions');
        missingWorkingFolder.code = 'missing-working-folder';
        missingWorkingFolder.workingFolder = 'design/feature_descriptions';
        const service = new RemoteControlService({ invoke: vi.fn(() => { throw missingWorkingFolder; }) });
        const client = createClient();

        await service.handleMessage(client, JSON.stringify({ id: 'request-1', method: 'loadProject', params: [] }));

        expect(JSON.parse(client.send.mock.calls[0][0])).toEqual({
            error: {
                code: 'missing-working-folder',
                fields: { workingFolder: 'design/feature_descriptions' },
                message: 'Working folder is missing: design/feature_descriptions',
                name: 'Error',
            },
            id: 'request-1',
        });
    });
});
