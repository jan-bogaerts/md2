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
import {
    startCallbackSubscription,
    type RemoteControlCallbackSubscriptionOptions,
    type RemoteControlSubscriptionPayload,
} from './remote_control_callback_subscription';
import type { RemoteControlClient } from './remote_control_client';

interface TestPayload extends RemoteControlSubscriptionPayload {
    value: string;
}

const TEST_SUBSCRIPTION: RemoteControlCallbackSubscriptionOptions<TestPayload, string> = {
    eventName: 'testEvent',
    method: 'onTestEvent',
    select: (payload) => payload.value,
};

function subscribe(client: RemoteControlClient, callback: (value: string) => void = vi.fn()) {
    return startCallbackSubscription(client, TEST_SUBSCRIPTION, callback);
}

async function startWithSocket(callback: (value: string) => void = vi.fn()) {
    const client = createTestClient();
    const stop = subscribe(client, callback);
    const socket = lastSocket();
    socket.open();
    await flushPromises();

    return { client, socket, stop };
}

async function confirmSubscription(socket: MockWebSocket, subscriptionId: string) {
    socket.receive({ id: socket.request(0).id, result: { subscriptionId } });
    await flushPromises();
}

function sendEvent(socket: MockWebSocket, requestId: string, subscriptionId: string, value: string) {
    socket.receive({ event: 'testEvent', payload: { requestId, subscriptionId, value } });
}

describe('RemoteControlCallbackSubscription', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('routes events by setup request id before the response and by subscription id afterwards', async () => {
        installWebSocket();
        const callback = vi.fn();
        const { socket } = await startWithSocket(callback);
        const { id, method } = socket.request(0);
        expect(method).toBe('onTestEvent');

        sendEvent(socket, id, 'subscription-1', 'early');
        await confirmSubscription(socket, 'subscription-1');
        sendEvent(socket, 'unrelated-request', 'subscription-1', 'late');
        sendEvent(socket, 'unrelated-request', 'other-subscription', 'ignored');

        expect(callback.mock.calls).toEqual([['early'], ['late']]);
    });

    it('sends one unsubscribe for repeated active cleanup', async () => {
        installWebSocket();
        const callback = vi.fn();
        const { socket, stop } = await startWithSocket(callback);
        await confirmSubscription(socket, 'subscription-1');

        stop();
        stop();
        sendEvent(socket, 'unrelated-request', 'subscription-1', 'ignored');

        expect(socket.methods()).toEqual(['onTestEvent', 'unsubscribe']);
        expect(socket.request(1).params).toEqual(['subscription-1']);
        expect(callback).not.toHaveBeenCalled();
    });

    it('unsubscribes the eventual server subscription when cleanup runs during setup', async () => {
        installWebSocket();
        const callback = vi.fn();
        const { socket, stop } = await startWithSocket(callback);
        const { id } = socket.request(0);

        stop();
        stop();
        sendEvent(socket, id, 'subscription-1', 'ignored');
        socket.receive({ id, result: { subscriptionId: 'subscription-1' } });
        await vi.waitFor(() => expect(socket.sent).toHaveLength(2));

        expect(socket.request(1)).toMatchObject({ method: 'unsubscribe', params: ['subscription-1'] });
        expect(callback).not.toHaveBeenCalled();
    });

    it('cleans up locally without reconnecting after retirement', async () => {
        installWebSocket();
        const unhandledRejections: unknown[] = [];
        const handleUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
        process.on('unhandledRejection', handleUnhandledRejection);
        try {
            const { client, socket, stop } = await startWithSocket();
            await confirmSubscription(socket, 'subscription-1');
            client.retire();

            stop();
            stop();
            await settle();

            expect(socket.sent).toHaveLength(1);
            expect(MockWebSocket.instances).toHaveLength(1);
            expect(unhandledRejections).toEqual([]);
        } finally {
            process.off('unhandledRejection', handleUnhandledRejection);
        }
    });

    it('clears server routing on disconnect and restores exactly once after reconnect', async () => {
        installWebSocket();
        const callback = vi.fn();
        const { client, socket: firstSocket } = await startWithSocket(callback);
        await confirmSubscription(firstSocket, 'subscription-1');
        firstSocket.close();
        sendEvent(firstSocket, 'unrelated-request', 'subscription-1', 'stale');

        const secondSocket = await openConnection(client);
        await client.connect();
        await settle();
        expect(secondSocket.methods()).toEqual(['onTestEvent']);
        await confirmSubscription(secondSocket, 'subscription-2');
        sendEvent(secondSocket, 'unrelated-request', 'subscription-1', 'stale');
        sendEvent(secondSocket, 'unrelated-request', 'subscription-2', 'fresh');

        expect(callback.mock.calls).toEqual([['fresh']]);
    });

    it('restores exactly once when the socket closes during setup', async () => {
        installWebSocket();
        const { client, socket: firstSocket } = await startWithSocket();
        firstSocket.close();

        const secondSocket = await openConnection(client);
        await settle();

        expect(secondSocket.methods()).toEqual(['onTestEvent']);
    });

    it('does not restore a stopped subscription', async () => {
        installWebSocket();
        const { client, socket: firstSocket, stop } = await startWithSocket();
        await confirmSubscription(firstSocket, 'subscription-1');
        stop();
        firstSocket.close();

        const secondSocket = await openConnection(client);
        await settle();

        expect(secondSocket.sent).toEqual([]);
    });

    it('logs non-connection setup failures', async () => {
        installWebSocket();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { socket } = await startWithSocket();
        socket.receive({ error: { message: 'Unsupported' }, id: socket.request(0).id });
        await settle();

        expect(consoleError).toHaveBeenCalledWith('Remote subscription onTestEvent failed', expect.any(Error));
    });
});
