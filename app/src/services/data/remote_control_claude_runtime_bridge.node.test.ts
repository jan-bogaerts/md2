import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, flushPromises, installWebSocket, lastSocket, openConnection } from '../test_support/mock_web_socket';
import { RemoteControlClaudeRuntimeBridge } from './remote_control_claude_runtime_bridge';

describe('RemoteControlClaudeRuntimeBridge', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the current rate limits of one account', async () => {
        installWebSocket();
        const client = createTestClient();
        const bridge = new RemoteControlClaudeRuntimeBridge(client);
        const socket = await openConnection(client);
        const snapshot = { accountId: 'claude-initial', available: true, observedAt: 10, windows: [] };
        const load = bridge.getClaudeRateLimits('claude-initial');
        await flushPromises();

        expect(socket.request(0)).toMatchObject({ method: 'getClaudeRateLimits', params: ['claude-initial'] });
        socket.receive({ id: socket.request(0).id, result: snapshot });
        await expect(load).resolves.toEqual(snapshot);
    });

    it('drops stale snapshots after reconnect and delivers the restored subscription once', async () => {
        installWebSocket();
        const client = createTestClient();
        const bridge = new RemoteControlClaudeRuntimeBridge(client);
        const callback = vi.fn();
        bridge.onClaudeRateLimits(callback);
        const firstSocket = lastSocket();
        firstSocket.open();
        await flushPromises();
        expect(firstSocket.request(0).method).toBe('onClaudeRateLimits');
        firstSocket.receive({ id: firstSocket.request(0).id, result: { subscriptionId: 'claude-limits-1' } });
        await flushPromises();
        firstSocket.close();

        const secondSocket = await openConnection(client);
        await vi.waitFor(() => expect(secondSocket.methods()).toEqual(['onClaudeRateLimits']));
        secondSocket.receive({ id: secondSocket.request(0).id, result: { subscriptionId: 'claude-limits-2' } });
        await flushPromises();
        const snapshot = { available: true, observedAt: 11, windows: [] };
        secondSocket.receive({ event: 'claudeRateLimits', payload: { requestId: 'other', snapshot: { stale: true }, subscriptionId: 'claude-limits-1' } });
        secondSocket.receive({ event: 'claudeRateLimits', payload: { requestId: 'other', snapshot, subscriptionId: 'claude-limits-2' } });

        expect(callback).toHaveBeenCalledExactlyOnceWith(snapshot);
    });

    it('reports connection changes of the shared client', async () => {
        installWebSocket();
        const client = createTestClient();
        const bridge = new RemoteControlClaudeRuntimeBridge(client);
        const listener = vi.fn();
        bridge.onConnectionChanged(listener);
        const socket = await openConnection(client);
        socket.close();

        expect(listener.mock.calls).toEqual([[true], [false]]);
    });
});
