import { vi } from 'vitest';
import { RemoteControlClient } from '../data/remote_control_client';

const SOCKET_OPEN_STATE = 1;
const SOCKET_CLOSED_STATE = 3;
export const TEST_ENDPOINT = 'ws://127.0.0.1:1234';

/** Sent remote-control request as parsed from the mock socket. */
export interface SentRequest {
    id: string;
    method: string;
    params: unknown[];
}

/** In-memory WebSocket double that records sent messages and lets tests drive open, close, and incoming messages. */
export class MockWebSocket extends EventTarget {
    static instances: MockWebSocket[] = [];

    readyState = 0;
    protocol: string | string[] | undefined;
    sent: string[] = [];
    url: string;

    constructor(url: string, protocol?: string | string[]) {
        super();
        this.protocol = protocol;
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    send(message: string) {
        this.sent.push(message);
    }

    open() {
        this.readyState = SOCKET_OPEN_STATE;
        this.dispatchEvent(new Event('open'));
    }

    close() {
        this.readyState = SOCKET_CLOSED_STATE;
        this.dispatchEvent(new Event('close'));
    }

    receive(message: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
    }

    /** Parses the sent message at `index`; negative indexes count from the end. */
    request(index: number): SentRequest {
        const message = this.sent.at(index);
        if (message === undefined) throw new Error(`Missing sent message ${index}`);

        return JSON.parse(message) as SentRequest;
    }

    /** Lists the methods of every sent message in order. */
    methods(): string[] {
        return this.sent.map((message) => (JSON.parse(message) as SentRequest).method);
    }
}

export function installWebSocket() {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
}

export function lastSocket() {
    const socket = MockWebSocket.instances.at(-1);
    if (!socket) throw new Error('Missing mock socket');

    return socket;
}

export function createTestClient() {
    const client = new RemoteControlClient();
    client.init({ endpoint: TEST_ENDPOINT });

    return client;
}

/** Connects `connectable` through a fresh mock socket and returns that socket once open. */
export async function openConnection(connectable: { connect(): Promise<void> }) {
    const connection = connectable.connect();
    const socket = lastSocket();
    socket.open();
    await connection;

    return socket;
}

export async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

/** Waits until queued timers and promise continuations have run. */
export async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
