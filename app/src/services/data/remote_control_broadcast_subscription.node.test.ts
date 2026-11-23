import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createTestClient,
    flushPromises,
    installWebSocket,
    lastSocket,
    MockWebSocket,
    openConnection,
    settle,
} from '../test_support/mock_web_socket';
import { RemoteControlBroadcastSubscription } from './remote_control_broadcast_subscription';
import type { RemoteControlSubscriptionPayload } from './remote_control_callback_subscription';
import type { RemoteControlClient } from './remote_control_client';

interface TestPayload extends RemoteControlSubscriptionPayload {
    value: string;
}

function createBroadcast(client: RemoteControlClient) {
    return new RemoteControlBroadcastSubscription(client, {
        eventName: 'testChanged',
        method: 'onTestChanged',
        select: (payload: TestPayload) => payload.value,
    });
}

function sendEvent(socket: MockWebSocket, requestId: string, subscriptionId: string, value: string) {
    socket.receive({ event: 'testChanged', payload: { requestId, subscriptionId, value } });
}

async function startWithSocket() {
    const client = createTestClient();
    const broadcast = createBroadcast(client);
    const firstCallback = vi.fn();
    const stopFirst = broadcast.addListener(firstCallback);
    const socket = lastSocket();
    socket.open();
    await flushPromises();

    return { broadcast, client, firstCallback, socket, stopFirst };
}

async function confirmSubscription(socket: MockWebSocket, index: number, subscriptionId: string) {
    socket.receive({ id: socket.request(index).id, result: { subscriptionId } });
    await flushPromises();
}

describe('RemoteControlBroadcastSubscription', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('shares one server subscription across listeners and fans out every event', async () => {
        installWebSocket();
        const { broadcast, firstCallback, socket } = await startWithSocket();
        const secondCallback = vi.fn();
        broadcast.addListener(secondCallback);
        await flushPromises();
        const { id } = socket.request(0);

        sendEvent(socket, id, 'subscription-1', 'initial');
        await confirmSubscription(socket, 0, 'subscription-1');
        sendEvent(socket, 'unrelated-request', 'subscription-1', 'pushed');

        expect(socket.methods()).toEqual(['onTestChanged']);
        expect(firstCallback.mock.calls).toEqual([['initial'], ['pushed']]);
        expect(secondCallback.mock.calls).toEqual([['initial'], ['pushed']]);
    });

    it('unsubscribes only after the last listener, once', async () => {
        installWebSocket();
        const { broadcast, firstCallback, socket, stopFirst } = await startWithSocket();
        const stopSecond = broadcast.addListener(vi.fn());
        await confirmSubscription(socket, 0, 'subscription-1');

        stopFirst();
        stopFirst();
        expect(socket.sent).toHaveLength(1);
        sendEvent(socket, 'unrelated-request', 'subscription-1', 'only-second');
        expect(firstCallback).not.toHaveBeenCalled();
        stopSecond();

        expect(socket.methods()).toEqual(['onTestChanged', 'unsubscribe']);
        expect(socket.request(1).params).toEqual(['subscription-1']);
    });

    it('unsubscribes the eventual server subscription when the last listener leaves during setup', async () => {
        installWebSocket();
        const { firstCallback, socket, stopFirst } = await startWithSocket();
        const { id } = socket.request(0);

        stopFirst();
        socket.receive({ id, result: { subscriptionId: 'subscription-1' } });
        await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
        sendEvent(socket, id, 'subscription-1', 'ignored');

        expect(socket.request(1)).toMatchObject({ method: 'unsubscribe', params: ['subscription-1'] });
        expect(firstCallback).not.toHaveBeenCalled();
    });

    it('restores one server subscription after reconnect and none after the last listener left', async () => {
        installWebSocket();
        const { client, firstCallback, socket: firstSocket, stopFirst } = await startWithSocket();
        await confirmSubscription(firstSocket, 0, 'subscription-1');
        firstSocket.close();

        const secondSocket = await openConnection(client);
        await settle();
        await client.connect();
        await flushPromises();
        expect(secondSocket.methods()).toEqual(['onTestChanged']);
        sendEvent(secondSocket, secondSocket.request(0).id, 'subscription-2', 'replacement');
        await confirmSubscription(secondSocket, 0, 'subscription-2');
        sendEvent(secondSocket, 'unrelated-request', 'subscription-1', 'stale');
        expect(firstCallback.mock.calls).toEqual([['replacement']]);

        stopFirst();
        secondSocket.close();
        const thirdSocket = await openConnection(client);
        await settle();
        expect(thirdSocket.sent).toEqual([]);
    });

    it('unsubscribes a replacement subscription stopped during restoration', async () => {
        installWebSocket();
        const { client, firstCallback, socket: firstSocket, stopFirst } = await startWithSocket();
        await confirmSubscription(firstSocket, 0, 'subscription-1');
        firstSocket.close();
        const secondSocket = await openConnection(client);
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(1));
        const { id } = secondSocket.request(0);

        stopFirst();
        sendEvent(secondSocket, id, 'subscription-2', 'ignored');
        secondSocket.receive({ id, result: { subscriptionId: 'subscription-2' } });
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(2));

        expect(secondSocket.request(1)).toMatchObject({ method: 'unsubscribe', params: ['subscription-2'] });
        expect(firstCallback).not.toHaveBeenCalled();
    });

    it('cleans up locally without reconnecting after retirement', async () => {
        installWebSocket();
        const { client, socket, stopFirst } = await startWithSocket();
        await confirmSubscription(socket, 0, 'subscription-1');
        client.retire();

        stopFirst();
        await settle();

        expect(socket.sent).toHaveLength(1);
        expect(MockWebSocket.instances).toHaveLength(1);
    });
});
