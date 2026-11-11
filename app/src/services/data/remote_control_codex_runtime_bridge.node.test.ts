import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, flushPromises, installWebSocket, lastSocket, openConnection } from '../test_support/mock_web_socket';
import { RemoteControlCodexRuntimeBridge } from './remote_control_codex_runtime_bridge';

describe('RemoteControlCodexRuntimeBridge', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the current rate limits of one account', async () => {
        installWebSocket();
        const client = createTestClient();
        const bridge = new RemoteControlCodexRuntimeBridge(client);
        const socket = await openConnection(client);
        const snapshot = { available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null };
        const load = bridge.getCodexRateLimits('codex-initial');
        await flushPromises();

        expect(socket.request(0)).toMatchObject({ method: 'getCodexRateLimits', params: ['codex-initial'] });
        socket.receive({ id: socket.request(0).id, result: snapshot });
        await expect(load).resolves.toEqual(snapshot);
    });

    it('receives account-wide snapshots through a dedicated subscription', async () => {
        installWebSocket();
        const client = createTestClient();
        const bridge = new RemoteControlCodexRuntimeBridge(client);
        const callback = vi.fn();
        bridge.onCodexRateLimits(callback);
        const socket = lastSocket();
        socket.open();
        await flushPromises();
        const snapshot = { available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null };

        expect(socket.request(0).method).toBe('onCodexRateLimits');
        socket.receive({ event: 'codexRateLimits', payload: { requestId: socket.request(0).id, snapshot, subscriptionId: 'codex-1' } });

        expect(callback).toHaveBeenCalledWith(snapshot);
    });

    it('reports connection changes of the shared client', async () => {
        installWebSocket();
        const client = createTestClient();
        const bridge = new RemoteControlCodexRuntimeBridge(client);
        const listener = vi.fn();
        bridge.onConnectionChanged(listener);
        const socket = await openConnection(client);
        socket.close();

        expect(listener.mock.calls).toEqual([[true], [false]]);
    });
});
