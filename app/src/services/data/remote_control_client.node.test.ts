import { afterEach, describe, expect, it, vi } from 'vitest';
import { MISSING_THIS_CARD_CONTEXT_ERROR } from '../../../../shared/action_errors.mjs';
import { MissingWorkingFolderError } from '../../data/data_types';
import {
    createTestClient,
    flushPromises,
    installWebSocket,
    lastSocket,
    MockWebSocket,
    openConnection,
    settle,
    TEST_ENDPOINT,
} from '../test_support/mock_web_socket';
import { RemoteControlClient, SOCKET_CLOSED_EVENT, SOCKET_OPENED_EVENT } from './remote_control_client';
import { RemoteControlConnectionError } from './remote_control_connection_error';

describe('RemoteControlClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires an endpoint before reporting connection settings', () => {
        const client = new RemoteControlClient();

        expect(() => client.getConnectionSettings()).toThrow('Remote-control storage is not initialized');
        client.init({ endpoint: TEST_ENDPOINT });
        expect(client.getConnectionSettings()).toEqual({ endpoint: TEST_ENDPOINT });
    });

    it('constructs the WebSocket with the endpoint only', async () => {
        installWebSocket();
        const socket = await openConnection(createTestClient());

        expect(socket.url).toBe(TEST_ENDPOINT);
        expect(socket.protocol).toBeUndefined();
    });

    it('matches concurrent responses by request id', async () => {
        installWebSocket();
        const client = createTestClient();
        const first = client.request('loadProject', ['design']);
        const second = client.request('listBranches', []);
        const socket = lastSocket();

        socket.open();
        await flushPromises();
        socket.receive({ id: socket.request(1).id, result: [{ name: 'main' }] });
        socket.receive({ id: socket.request(0).id, result: { files: [] } });

        await expect(first).resolves.toEqual({ files: [] });
        await expect(second).resolves.toEqual([{ name: 'main' }]);
        expect(socket.request(0)).toMatchObject({ method: 'loadProject', params: ['design'] });
    });

    it('sends a caller-provided request id', async () => {
        installWebSocket();
        const client = createTestClient();
        const socket = await openConnection(client);
        const id = client.createRequestId();
        const request = client.sendRequest(id, 'onActionRun', []);
        await flushPromises();

        expect(socket.request(0)).toEqual({ id, method: 'onActionRun', params: [] });
        socket.receive({ id, result: { subscriptionId: 'subscription-1' } });
        await expect(request).resolves.toEqual({ subscriptionId: 'subscription-1' });
    });

    it('rejects requests on retired clients without creating a socket', async () => {
        installWebSocket();
        const client = createTestClient();
        client.retire();

        await expect(client.request('getActiveProject', [])).rejects.toThrow('Remote-control connection was replaced');
        await expect(client.connect()).rejects.toBeInstanceOf(RemoteControlConnectionError);
        expect(MockWebSocket.instances).toEqual([]);
    });

    it('fails an in-flight request once and does not replay it after reconnect', async () => {
        installWebSocket();
        const client = createTestClient();
        const request = client.request('startAction', []);
        const socket = lastSocket();

        socket.open();
        await flushPromises();
        socket.close();

        await expect(request).rejects.toThrow('Remote-control connection closed');
        const replacementSocket = await openConnection(client);
        await flushPromises();
        expect(replacementSocket.sent).toEqual([]);
    });

    it('holds requests started during reconnection for the shared socket attempt', async () => {
        installWebSocket();
        const client = createTestClient();
        const firstSocket = await openConnection(client);
        firstSocket.close();

        const request = client.request('getActiveProject', []);
        await flushPromises();
        expect(MockWebSocket.instances).toHaveLength(1);

        const secondSocket = await openConnection(client);
        await flushPromises();
        expect(MockWebSocket.instances).toHaveLength(2);
        expect(secondSocket.methods()).toEqual(['getActiveProject']);
        secondSocket.receive({ id: secondSocket.request(0).id, result: null });
        await expect(request).resolves.toBeNull();
    });

    it('rejects requests waiting for reconnection when explicitly disconnected', async () => {
        installWebSocket();
        const client = createTestClient();
        const socket = await openConnection(client);
        socket.close();

        const request = client.request('getActiveProject', []);
        client.disconnect();

        await expect(request).rejects.toThrow('Remote-control connection closed');
        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('rejects requests waiting for reconnection when retired', async () => {
        installWebSocket();
        const client = createTestClient();
        const socket = await openConnection(client);
        socket.close();

        const request = client.request('getActiveProject', []);
        client.retire();

        await expect(request).rejects.toThrow('Remote-control connection was replaced');
    });

    it('connects and disconnects without a request', async () => {
        installWebSocket();
        const client = createTestClient();
        const socket = await openConnection(client);

        client.disconnect();
        expect(socket.readyState).toBe(3);
    });

    it('rejects connect when the socket errors before opening', async () => {
        installWebSocket();
        const client = createTestClient();
        const connection = client.connect();

        lastSocket().dispatchEvent(new Event('error'));

        await expect(connection).rejects.toThrow('Remote-control connection failed');
    });

    it('notifies connection listeners and ignores late events from an older socket', async () => {
        installWebSocket();
        const client = createTestClient();
        const connectionChanges = vi.fn();
        client.onConnectionChanged(connectionChanges);
        const firstSocket = await openConnection(client);
        firstSocket.close();
        const secondSocket = await openConnection(client);
        firstSocket.dispatchEvent(new Event('close'));
        firstSocket.dispatchEvent(new Event('error'));
        firstSocket.receive({ event: 'actionRun', payload: {} });

        const request = client.request('getActiveProject', []);
        await flushPromises();
        secondSocket.receive({ id: secondSocket.request(0).id, result: null });

        await expect(request).resolves.toBeNull();
        expect(connectionChanges.mock.calls).toEqual([[true], [false], [true]]);
    });

    it('stops notifying a removed connection listener', async () => {
        installWebSocket();
        const client = createTestClient();
        const listener = vi.fn();
        const stop = client.onConnectionChanged(listener);
        const socket = await openConnection(client);
        stop();
        socket.close();

        expect(listener.mock.calls).toEqual([[true]]);
    });

    it('signals subscription restoration only after the connection listeners heard about the open socket', async () => {
        installWebSocket();
        const client = createTestClient();
        const order: string[] = [];
        client.addEventListener(SOCKET_OPENED_EVENT, () => order.push('opened'));
        client.onConnectionChanged((connected) => order.push(`connected:${connected}`));
        client.addEventListener(SOCKET_CLOSED_EVENT, () => order.push('closed'));
        const socket = await openConnection(client);
        socket.close();

        expect(order).toEqual(['connected:true', 'opened', 'connected:false', 'closed']);
    });

    it('dispatches protocol events under their protocol name from the current socket only', async () => {
        installWebSocket();
        const client = createTestClient();
        const listener = vi.fn();
        client.addEventListener('actionRun', listener);
        const socket = await openConnection(client);

        socket.receive({ event: 'actionRun', payload: { requestId: 'remote-1' } });

        expect(listener).toHaveBeenCalledOnce();
        expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ requestId: 'remote-1' });
    });

    it('sends best-effort unsubscribe only while the socket is open', async () => {
        installWebSocket();
        const client = createTestClient();
        client.unsubscribeBestEffort('subscription-0');
        expect(MockWebSocket.instances).toEqual([]);

        const socket = await openConnection(client);
        client.unsubscribeBestEffort('subscription-1');
        socket.close();
        client.unsubscribeBestEffort('subscription-2');

        expect(socket.sent).toHaveLength(1);
        expect(socket.request(0)).toMatchObject({ method: 'unsubscribe', params: ['subscription-1'] });
    });

    it('adds remote method context while preserving the response error code, fields, and cause', async () => {
        installWebSocket();
        const client = createTestClient();
        const socket = await openConnection(client);
        const request = client.request('sendActionMessage', ['unknown-run', 'continue']);
        await flushPromises();
        socket.receive({
            error: { code: 'unknown-run', fields: { runId: 'unknown-run' }, message: 'Unknown action run: unknown-run' },
            id: socket.request(0).id,
        });

        const error = await request.catch((caughtError: unknown) => caughtError);

        expect(error).toMatchObject({
            cause: expect.objectContaining({ message: 'Unknown action run: unknown-run' }),
            code: 'unknown-run',
            message: 'Remote method sendActionMessage failed: Unknown action run: unknown-run',
            runId: 'unknown-run',
        });
    });

    it('rebuilds a missing working folder error from the remote response marker', async () => {
        installWebSocket();
        const client = createTestClient();
        const socket = await openConnection(client);
        const request = client.request('loadProject', []);
        await flushPromises();
        socket.receive({
            error: {
                code: 'missing-working-folder',
                fields: { workingFolder: 'design/feature_descriptions' },
                message: 'Working folder is missing: design/feature_descriptions',
                name: 'Error',
            },
            id: socket.request(0).id,
        });

        const error = await request.catch((failure: unknown) => failure) as MissingWorkingFolderError;

        expect(error).toBeInstanceOf(MissingWorkingFolderError);
        expect(error.code).toBe('missing-working-folder');
        expect(error.workingFolder).toBe('design/feature_descriptions');
    });

    it('preserves the missing this-card context error', async () => {
        installWebSocket();
        const client = createTestClient();
        const socket = await openConnection(client);
        const request = client.request('prepareActionPrompt', []);
        await flushPromises();
        socket.receive({
            error: { code: MISSING_THIS_CARD_CONTEXT_ERROR, fields: {}, message: 'Missing card context', name: 'Error' },
            id: socket.request(0).id,
        });

        const error = await request.catch((failure: unknown) => failure) as Error & { code?: string };

        expect(error.message).toBe('Missing card context');
        expect(error.code).toBe(MISSING_THIS_CARD_CONTEXT_ERROR);
    });

    it('keeps instances isolated', async () => {
        installWebSocket();
        const firstClient = createTestClient();
        const secondClient = createTestClient();
        const firstRequest = firstClient.request('getActiveProject', []);
        const firstSocket = lastSocket();
        const secondRequest = secondClient.request('getActiveProject', []);
        const secondSocket = lastSocket();
        firstSocket.open();
        secondSocket.open();
        await settle();

        expect(firstSocket).not.toBe(secondSocket);
        expect(firstSocket.request(0).id).toBe(secondSocket.request(0).id);
        secondSocket.receive({ id: secondSocket.request(0).id, result: 'second' });
        firstSocket.receive({ id: firstSocket.request(0).id, result: 'first' });
        await expect(firstRequest).resolves.toBe('first');
        await expect(secondRequest).resolves.toBe('second');
    });
});
