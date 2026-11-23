import { MISSING_THIS_CARD_CONTEXT_ERROR } from '../../../../shared/action_errors.mjs';
import type { BridgeErrorPayload } from '../../../../shared/bridge_errors.mjs';
import { rehydrateBridgeError } from '../../data/bridge_error_rehydration';
import { MissingWorkingFolderError } from '../../data/data_types';
import { readRemoteControlConnection, type RemoteControlConnectionSettings } from '../../data/remote_control_connection';
import { RemoteControlConnectionError } from './remote_control_connection_error';

interface RemoteControlRequest {
    id: string;
    method: string;
    params: unknown[];
}

interface RemoteControlResponse {
    error?: BridgeErrorPayload;
    id: string;
    result?: unknown;
}

interface RemoteControlEvent {
    event: string;
    payload: unknown;
}

interface PendingRequest {
    method: string;
    reject: (error: Error) => void;
    resolve: (value: unknown) => void;
}

interface ConnectionWaiter {
    promise: Promise<void>;
    reject: (error: Error) => void;
    resolve: () => void;
}

/** Server response returned by every remote subscription request. */
export interface RemoteControlSubscriptionResult {
    subscriptionId: string;
}

/** Public event carrying the current connection state as `detail`. */
export const CONNECTION_CHANGED_EVENT = 'connection-changed';
/** Internal event: the current socket opened; persistent subscriptions restore themselves. */
export const SOCKET_OPENED_EVENT = 'socket-opened';
/** Internal event: the current socket closed; server-specific routing must be cleared. */
export const SOCKET_CLOSED_EVENT = 'socket-closed';

const SOCKET_OPEN_STATE = 1;
const CLOSED_MESSAGE = 'Remote-control connection closed';
const FAILED_MESSAGE = 'Remote-control connection failed';
const REPLACED_MESSAGE = 'Remote-control connection was replaced';
const NOT_INITIALIZED_MESSAGE = 'Remote-control storage is not initialized';

function createConnectionWaiter(): ConnectionWaiter {
    let reject!: (error: Error) => void;
    let resolve!: () => void;
    const promise = new Promise<void>((promiseResolve, promiseReject) => {
        reject = promiseReject;
        resolve = promiseResolve;
    });

    return { promise, reject, resolve };
}

function isResponse(message: RemoteControlResponse | RemoteControlEvent): message is RemoteControlResponse {
    return 'id' in message;
}

function createResponseError(method: string, error: BridgeErrorPayload): Error {
    // Rebuild the typed error first, so a marked failure such as a missing working folder
    // stays recognisable instead of arriving as a plain message.
    const cause = rehydrateBridgeError(error);
    const failure = new Error(`Remote method ${method} failed: ${error.message}`, { cause }) as Error & { code?: string };
    if (error.code !== undefined) failure.code = error.code;
    Object.assign(failure, error.fields ?? {});
    const expectedError = cause instanceof MissingWorkingFolderError || error.code === MISSING_THIS_CARD_CONTEXT_ERROR;

    return expectedError ? cause : failure;
}

/**
 * Owns one remote-control WebSocket: connection lifecycle, request correlation, and event delivery.
 * Incoming protocol events are dispatched as `CustomEvent`s named after the protocol event, with the payload as `detail`.
 */
export class RemoteControlClient extends EventTarget {
    private connectPromise: Promise<void> | null = null;
    private connectReject: ((error: Error) => void) | null = null;
    private disconnecting = false;
    private endpoint = '';
    private nextId = 1;
    private readonly pending = new Map<string, PendingRequest>();
    private reconnectWaiter: ConnectionWaiter | null = null;
    private reconnecting = false;
    private retired = false;
    private socket: WebSocket | null = null;

    init(settings: Partial<RemoteControlConnectionSettings> = {}) {
        const storedSettings = settings.endpoint
            ? settings as RemoteControlConnectionSettings
            : readRemoteControlConnection();
        this.endpoint = storedSettings.endpoint;
        this.retired = false;
    }

    getConnectionSettings(): RemoteControlConnectionSettings {
        this.assertInitialized();

        return { endpoint: this.endpoint };
    }

    assertInitialized() {
        if (this.endpoint.length === 0) throw new Error(NOT_INITIALIZED_MESSAGE);
    }

    async connect(): Promise<void> {
        await this.connectSocket();
    }

    disconnect() {
        this.cancelReconnect(new RemoteControlConnectionError(CLOSED_MESSAGE));
        this.disconnecting = true;
        this.socket?.close();
    }

    retire() {
        this.retired = true;
        this.cancelReconnect(new RemoteControlConnectionError(REPLACED_MESSAGE));
        this.socket?.close();
    }

    /** Calls `callback` with `true` after the current socket opens and `false` when it closes. */
    onConnectionChanged(callback: (connected: boolean) => void): () => void {
        const listener: EventListener = (event) => callback((event as CustomEvent<boolean>).detail);
        this.addEventListener(CONNECTION_CHANGED_EVENT, listener);

        return () => this.removeEventListener(CONNECTION_CHANGED_EVENT, listener);
    }

    createRequestId() {
        const id = `remote-${this.nextId}`;
        this.nextId += 1;

        return id;
    }

    async request<T>(method: string, params: unknown[]): Promise<T> {
        return this.sendRequest<T>(this.createRequestId(), method, params);
    }

    /** Sends a request with a caller-provided ID so events can be routed before the response arrives. */
    async sendRequest<T>(id: string, method: string, params: unknown[]): Promise<T> {
        await this.ensureConnected();
        const request: RemoteControlRequest = { id, method, params };

        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { method, reject, resolve: resolve as (value: unknown) => void });
            this.requireSocket().send(JSON.stringify(request));
        });
    }

    unsubscribeBestEffort(subscriptionId: string) {
        const socket = this.socket;
        if (socket?.readyState !== SOCKET_OPEN_STATE) return;

        const request: RemoteControlRequest = { id: this.createRequestId(), method: 'unsubscribe', params: [subscriptionId] };
        try {
            socket.send(JSON.stringify(request));
        } catch {
            // Socket closure already removes the server-side subscription.
        }
    }

    private async ensureConnected() {
        if (this.retired) throw new RemoteControlConnectionError(REPLACED_MESSAGE);
        if (this.reconnecting) {
            const waiter = this.reconnectWaiter ?? createConnectionWaiter();
            this.reconnectWaiter = waiter;
            await waiter.promise;
            if (this.retired) throw new RemoteControlConnectionError(REPLACED_MESSAGE);
        }
        if (this.socket?.readyState === SOCKET_OPEN_STATE) return;

        await this.connectSocket();
    }

    private connectSocket(): Promise<void> {
        if (this.retired) return Promise.reject(new RemoteControlConnectionError(REPLACED_MESSAGE));
        if (this.socket?.readyState === SOCKET_OPEN_STATE) return Promise.resolve();
        if (this.connectPromise) return this.connectPromise;

        this.disconnecting = false;
        const socket = new WebSocket(this.endpoint);
        this.socket = socket;
        socket.addEventListener('message', (event) => this.handleMessage(socket, event));
        socket.addEventListener('close', () => this.handleClose(socket));
        socket.addEventListener('error', () => this.handleError(socket));
        this.connectPromise = new Promise((resolve, reject) => {
            this.connectReject = reject;
            socket.addEventListener('open', () => this.handleOpen(socket, resolve), { once: true });
            socket.addEventListener('error', () => this.handleConnectError(socket, reject), { once: true });
        });

        return this.connectPromise;
    }

    private handleOpen(socket: WebSocket, resolve: () => void) {
        if (this.socket !== socket) return;

        this.connectPromise = null;
        this.connectReject = null;
        this.reconnecting = false;
        this.reconnectWaiter?.resolve();
        this.reconnectWaiter = null;
        resolve();
        this.dispatchEvent(new CustomEvent(CONNECTION_CHANGED_EVENT, { detail: true }));
        this.dispatchEvent(new Event(SOCKET_OPENED_EVENT));
    }

    private handleConnectError(socket: WebSocket, reject: (error: Error) => void) {
        if (this.socket === socket) {
            this.connectPromise = null;
            this.connectReject = null;
        }
        reject(new RemoteControlConnectionError(FAILED_MESSAGE));
    }

    private handleMessage(socket: WebSocket, event: MessageEvent) {
        if (socket !== this.socket) return;

        const message = JSON.parse(String(event.data)) as RemoteControlResponse | RemoteControlEvent;
        if (isResponse(message)) {
            this.handleResponse(message);
            return;
        }

        this.dispatchEvent(new CustomEvent(message.event, { detail: message.payload }));
    }

    private handleResponse(response: RemoteControlResponse) {
        const pending = this.pending.get(response.id);
        if (!pending) return;

        this.pending.delete(response.id);
        if (response.error) {
            pending.reject(createResponseError(pending.method, response.error));
            return;
        }

        pending.resolve(response.result);
    }

    private handleClose(socket: WebSocket) {
        this.closeSocket(socket, new RemoteControlConnectionError(CLOSED_MESSAGE));
    }

    private handleError(socket: WebSocket) {
        const message = this.connectPromise ? FAILED_MESSAGE : CLOSED_MESSAGE;
        this.closeSocket(socket, new RemoteControlConnectionError(message));
    }

    private closeSocket(socket: WebSocket, error: RemoteControlConnectionError) {
        if (socket !== this.socket) return;

        this.connectReject?.(error);
        this.connectReject = null;
        this.reconnecting = !this.retired && !this.disconnecting;
        this.disconnecting = false;
        this.dispatchEvent(new CustomEvent(CONNECTION_CHANGED_EVENT, { detail: false }));
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.dispatchEvent(new Event(SOCKET_CLOSED_EVENT));
        this.connectPromise = null;
        this.socket = null;
    }

    private cancelReconnect(error: RemoteControlConnectionError) {
        this.reconnecting = false;
        this.reconnectWaiter?.reject(error);
        this.reconnectWaiter = null;
    }

    private requireSocket() {
        if (!this.socket) throw new Error('Remote-control socket is not connected');

        return this.socket;
    }
}
