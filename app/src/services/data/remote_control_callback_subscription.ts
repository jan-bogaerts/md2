import {
    SOCKET_CLOSED_EVENT,
    SOCKET_OPENED_EVENT,
    type RemoteControlClient,
    type RemoteControlSubscriptionResult,
} from './remote_control_client';
import { reportSubscriptionFailure } from './remote_control_subscription_failure';

/** Routing fields carried by every persistent-subscription event payload. */
export interface RemoteControlSubscriptionPayload {
    requestId: string;
    subscriptionId: string;
}

/** Protocol names and payload selection for one callback subscription stream. */
export interface RemoteControlCallbackSubscriptionOptions<TPayload extends RemoteControlSubscriptionPayload, TValue> {
    eventName: string;
    method: string;
    select: (payload: TPayload) => TValue;
}

/**
 * One local listener backed by one server subscription.
 * Routes events by setup request ID before the response and by server subscription ID afterwards,
 * and restores itself once after every reconnect while active.
 */
export class RemoteControlCallbackSubscription<TPayload extends RemoteControlSubscriptionPayload, TValue> {
    private active = true;
    private readonly callback: (value: TValue) => void;
    private readonly client: RemoteControlClient;
    private readonly options: RemoteControlCallbackSubscriptionOptions<TPayload, TValue>;
    private requestId: string | null = null;
    private serverSubscriptionId: string | null = null;

    constructor(
        client: RemoteControlClient,
        options: RemoteControlCallbackSubscriptionOptions<TPayload, TValue>,
        callback: (value: TValue) => void,
    ) {
        this.client = client;
        this.options = options;
        this.callback = callback;
    }

    start() {
        this.client.addEventListener(this.options.eventName, this.handleEvent);
        this.client.addEventListener(SOCKET_OPENED_EVENT, this.handleSocketOpened);
        this.client.addEventListener(SOCKET_CLOSED_EVENT, this.handleSocketClosed);
        void this.subscribe();
    }

    /** Stops local delivery and best-effort unsubscribes the server subscription. Safe to call repeatedly. */
    stop() {
        if (!this.active) return;

        this.active = false;
        this.client.removeEventListener(this.options.eventName, this.handleEvent);
        this.client.removeEventListener(SOCKET_OPENED_EVENT, this.handleSocketOpened);
        this.client.removeEventListener(SOCKET_CLOSED_EVENT, this.handleSocketClosed);
        this.requestId = null;
        const subscriptionId = this.serverSubscriptionId;
        this.serverSubscriptionId = null;
        if (!subscriptionId) return;

        this.client.unsubscribeBestEffort(subscriptionId);
    }

    private async subscribe() {
        if (!this.active || this.requestId || this.serverSubscriptionId) return;

        const id = this.client.createRequestId();
        this.requestId = id;
        try {
            const result = await this.client.sendRequest<RemoteControlSubscriptionResult>(id, this.options.method, []);
            if (!this.active) {
                this.client.unsubscribeBestEffort(result.subscriptionId);
                return;
            }

            this.serverSubscriptionId = result.subscriptionId;
        } catch (error) {
            reportSubscriptionFailure(this.options.method, error);
        } finally {
            if (this.requestId === id) this.requestId = null;
        }
    }

    private readonly handleEvent = (event: Event) => {
        const payload = (event as CustomEvent<TPayload>).detail;
        const matchesSubscription = !!this.serverSubscriptionId && payload.subscriptionId === this.serverSubscriptionId;
        const matchesRequest = !!this.requestId && payload.requestId === this.requestId;
        if (!matchesSubscription && !matchesRequest) return;

        this.callback(this.options.select(payload));
    };

    private readonly handleSocketOpened = () => {
        void this.subscribe();
    };

    private readonly handleSocketClosed = () => {
        this.requestId = null;
        this.serverSubscriptionId = null;
    };
}

/** Starts one callback subscription and returns its idempotent cleanup. */
export function startCallbackSubscription<TPayload extends RemoteControlSubscriptionPayload, TValue>(
    client: RemoteControlClient,
    options: RemoteControlCallbackSubscriptionOptions<TPayload, TValue>,
    callback: (value: TValue) => void,
): () => void {
    const subscription = new RemoteControlCallbackSubscription(client, options, callback);
    subscription.start();

    return () => subscription.stop();
}
