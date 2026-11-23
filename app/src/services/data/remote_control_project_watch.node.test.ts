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
import { RemoteControlProjectWatch } from './remote_control_project_watch';

const PROJECT = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
const CHANGE = { changeKind: 'changed', path: 'design/F-1.md' };

function sendChange(socket: MockWebSocket, requestId: string, subscriptionId: string, event: unknown = CHANGE) {
    socket.receive({ event: 'watchProject', payload: { event, requestId, subscriptionId } });
}

async function startWithSocket() {
    const client = createTestClient();
    const callbacks = { onChange: vi.fn(), onError: vi.fn(), onRestored: vi.fn() };
    const watch = new RemoteControlProjectWatch(client, PROJECT, callbacks);
    watch.start();
    const socket = lastSocket();
    socket.open();
    await flushPromises();

    return { callbacks, client, socket, watch };
}

async function confirmSubscription(socket: MockWebSocket, subscriptionId: string) {
    socket.receive({ id: socket.request(0).id, result: { subscriptionId } });
    await flushPromises();
}

describe('RemoteControlProjectWatch', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('subscribes for the project and delivers change events', async () => {
        installWebSocket();
        const { callbacks, socket } = await startWithSocket();
        expect(socket.request(0)).toMatchObject({ method: 'watchProject', params: [PROJECT] });

        sendChange(socket, socket.request(0).id, 'watch-1');
        await confirmSubscription(socket, 'watch-1');
        sendChange(socket, 'unrelated-request', 'watch-1');

        expect(callbacks.onChange).toHaveBeenCalledTimes(2);
        expect(callbacks.onChange).toHaveBeenCalledWith(CHANGE);
        expect(callbacks.onRestored).not.toHaveBeenCalled();
    });

    it('reports watcher errors through onError without delivering a change', async () => {
        installWebSocket();
        const { callbacks, socket } = await startWithSocket();
        await confirmSubscription(socket, 'watch-1');

        sendChange(socket, socket.request(0).id, 'watch-1', { error: 'Native watcher unavailable' });

        expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Native watcher unavailable' }));
        expect(callbacks.onChange).not.toHaveBeenCalled();
    });

    it('reports a failed initial setup through onError', async () => {
        installWebSocket();
        const { callbacks, socket } = await startWithSocket();
        socket.receive({ error: { message: 'Watch unavailable' }, id: socket.request(0).id });
        await settle();

        expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({message: 'Remote method watchProject failed: Watch unavailable'}));
    });

    it('unsubscribes a watch stopped before setup completes', async () => {
        installWebSocket();
        const { callbacks, socket, watch } = await startWithSocket();
        const { id } = socket.request(0);

        watch.stop();
        socket.receive({ id, result: { subscriptionId: 'watch-1' } });
        await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
        sendChange(socket, id, 'watch-1');

        expect(socket.request(1)).toMatchObject({ method: 'unsubscribe', params: ['watch-1'] });
        expect(callbacks.onChange).not.toHaveBeenCalled();
    });

    it('restores once per reconnect, calls onRestored after the replacement, and never restores a stopped watch', async () => {
        installWebSocket();
        const { callbacks, client, socket: firstSocket, watch } = await startWithSocket();
        await confirmSubscription(firstSocket, 'watch-1');

        firstSocket.close();
        const secondSocket = await openConnection(client);
        await settle();
        expect(secondSocket.methods()).toEqual(['watchProject']);
        expect(callbacks.onRestored).not.toHaveBeenCalled();
        await confirmSubscription(secondSocket, 'watch-2');
        expect(callbacks.onRestored).toHaveBeenCalledOnce();
        sendChange(secondSocket, 'unrelated-request', 'watch-2');
        expect(callbacks.onChange).toHaveBeenCalledWith(CHANGE);

        watch.stop();
        expect(secondSocket.request(1)).toMatchObject({ method: 'unsubscribe', params: ['watch-2'] });
        secondSocket.close();
        const thirdSocket = await openConnection(client);
        await settle();

        expect(thirdSocket.sent).toEqual([]);
        expect(callbacks.onRestored).toHaveBeenCalledOnce();
    });

    it('cleans up locally without reconnecting after retirement', async () => {
        installWebSocket();
        const { client, socket, watch } = await startWithSocket();
        await confirmSubscription(socket, 'watch-1');
        client.retire();

        watch.stop();
        watch.stop();
        await settle();

        expect(socket.sent).toHaveLength(1);
        expect(MockWebSocket.instances).toHaveLength(1);
    });
});
