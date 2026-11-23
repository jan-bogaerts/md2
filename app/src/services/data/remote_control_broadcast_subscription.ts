import {
    SOCKET_CLOSED_EVENT,
    SOCKET_OPENED_EVENT,
    type RemoteControlClient,
    type RemoteControlSubscriptionResult,
} from './remote_control_client';
import type { RemoteControlSubscriptionPayload } from './remote_control_callback_subscription';
import { reportSubscriptionFailure } from './remote_control_subscription_failure';

/** Protocol names and payload selection for one shared server stream. */
export interface RemoteControlBroadcastSubscriptionOptions<TPayload extends RemoteControlSubscriptionPayload, TValue> {
    eventName: string;
    method: string;
    select: (payload: TPayload) => TValue;
}

/**
 * One server subscription shared by any number of local listeners.
 * Subscribes on the first listener, unsubscribes after the last, and restores one subscription after reconnect.
 */
export class RemoteControlBroadcastSubscription<TPayload extends RemoteControlSubscriptionPayload, TValue> {
    private readonly client: RemoteControlClient;
    private readonly events = new EventTarget();
    private listenerCount = 0;
    private readonly options: RemoteControlBroadcastSubscriptionOptions<TPayload, TValue>;
    private requestId: string | null = null;
    private serverSubscriptionId: string | null = null;

    constructor(client: RemoteControlClient, options: RemoteControlBroadcastSubscriptionOptions<TPayload, TValue>) {
        this.client = client;
        this.options = options;
        client.addEventListener(options.eventName, this.handleEvent);
        client.addEventListener(SOCKET_OPENED_EVENT, this.handleSocketOpened);
        client.addEventListener(SOCKET_CLOSED_EVENT, this.handleSocketClosed);
    }

    /** Adds one local listener; the returned cleanup is safe to call repeatedly. */
    addListener(callback: (value: TValue) => void): () => void {
        const listener: EventListener = (event) => callback((event as CustomEvent<TValue>).detail);
        let active = true;
        this.events.addEventListener(this.options.eventName, listener);
        this.listenerCount += 1;
        void this.subscribe();

        return () => {
            if (!active) return;

            active = false;
            this.events.removeEventListener(this.options.eventName, listener);
            this.removeListener();
        };
    }

    private removeListener() {
        this.listenerCount -= 1;
        if (this.listenerCount > 0) return;

        const subscriptionId = this.serverSubscriptionId;
        this.requestId = null;
        this.serverSubscriptionId = null;
        if (!subscriptionId) return;

        this.client.unsubscribeBestEffort(subscriptionId);
    }

    private async subscribe() {
        if (this.listenerCount === 0 || this.requestId || this.serverSubscriptionId) return;

        const id = this.client.createRequestId();
        this.requestId = id;
        try {
            const result = await this.client.sendRequest<RemoteControlSubscriptionResult>(id, this.options.method, []);
            if (this.requestId !== id || this.listenerCount === 0) {
                this.client.unsubscribeBestEffort(result.subscriptionId);
                return;
            }

            this.requestId = null;
            this.serverSubscriptionId = result.subscriptionId;
        } catch (error) {
            reportSubscriptionFailure(this.options.method, error);
        } finally {
            if (this.requestId === id) this.requestId = null;
        }
    }

    private readonly handleEvent = (event: Event) => {
        const payload = (event as CustomEvent<TPayload>).detail;
        const matchesRequest = !!this.requestId && payload.requestId === this.requestId;
        const matchesSubscription = !!this.serverSubscriptionId && payload.subscriptionId === this.serverSubscriptionId;
        if (!matchesRequest && !matchesSubscription) return;

        this.events.dispatchEvent(new CustomEvent(this.options.eventName, { detail: this.options.select(payload) }));
    };

    private readonly handleSocketOpened = () => {
        void this.subscribe();
    };

    private readonly handleSocketClosed = () => {
        this.requestId = null;
        this.serverSubscriptionId = null;
    };
}
