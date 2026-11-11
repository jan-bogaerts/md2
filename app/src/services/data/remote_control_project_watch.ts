import type { ProjectReference, ProjectWatchEvent, ProjectWatchNotification } from '../../data/data_types';
import {
    SOCKET_CLOSED_EVENT,
    SOCKET_OPENED_EVENT,
    type RemoteControlClient,
    type RemoteControlSubscriptionResult,
} from './remote_control_client';
import type { RemoteControlSubscriptionPayload } from './remote_control_callback_subscription';
import { reportSubscriptionFailure } from './remote_control_subscription_failure';

const WATCH_PROJECT_METHOD = 'watchProject';
const WATCH_PROJECT_EVENT = 'watchProject';

interface WatchProjectPayload extends RemoteControlSubscriptionPayload {
    event: ProjectWatchNotification;
}

/** Local callbacks for one project watch. */
export interface RemoteControlProjectWatchCallbacks {
    onChange: (event: ProjectWatchEvent) => void;
    onError: (error: Error) => void;
    onRestored: () => void;
}

/**
 * Watches one project through one server subscription.
 * Restores the subscription after reconnect and calls `onRestored` once the replacement is established.
 */
export class RemoteControlProjectWatch {
    private active = true;
    private readonly callbacks: RemoteControlProjectWatchCallbacks;
    private readonly client: RemoteControlClient;
    private readonly project: ProjectReference;
    private requestId: string | null = null;
    private serverSubscriptionId: string | null = null;

    constructor(client: RemoteControlClient, project: ProjectReference, callbacks: RemoteControlProjectWatchCallbacks) {
        this.client = client;
        this.project = project;
        this.callbacks = callbacks;
    }

    /** Starts watching; a failed initial setup is reported through `onError`. */
    start() {
        this.client.addEventListener(WATCH_PROJECT_EVENT, this.handleEvent);
        this.client.addEventListener(SOCKET_OPENED_EVENT, this.handleSocketOpened);
        this.client.addEventListener(SOCKET_CLOSED_EVENT, this.handleSocketClosed);
        void this.startInitialSubscription();
    }

    /** Stops the watch and best-effort unsubscribes the server subscription. Safe to call repeatedly. */
    stop() {
        if (!this.active) return;

        this.active = false;
        this.client.removeEventListener(WATCH_PROJECT_EVENT, this.handleEvent);
        this.client.removeEventListener(SOCKET_OPENED_EVENT, this.handleSocketOpened);
        this.client.removeEventListener(SOCKET_CLOSED_EVENT, this.handleSocketClosed);
        this.requestId = null;
        const subscriptionId = this.serverSubscriptionId;
        this.serverSubscriptionId = null;
        if (!subscriptionId) return;

        this.client.unsubscribeBestEffort(subscriptionId);
    }

    private async startInitialSubscription() {
        try {
            await this.subscribe(false);
        } catch (error) {
            this.callbacks.onError(error as Error);
        }
    }

    private async restoreSubscription() {
        try {
            await this.subscribe(true);
        } catch (error) {
            reportSubscriptionFailure(WATCH_PROJECT_METHOD, error);
        }
    }

    private async subscribe(restored: boolean) {
        if (!this.active || this.requestId || this.serverSubscriptionId) return;

        const id = this.client.createRequestId();
        this.requestId = id;
        try {
            const result = await this.client.sendRequest<RemoteControlSubscriptionResult>(id, WATCH_PROJECT_METHOD, [this.project]);
            if (!this.active) {
                this.client.unsubscribeBestEffort(result.subscriptionId);
                return;
            }

            this.serverSubscriptionId = result.subscriptionId;
            if (restored) this.callbacks.onRestored();
        } finally {
            if (this.requestId === id) this.requestId = null;
        }
    }

    private readonly handleEvent = (event: Event) => {
        const payload = (event as CustomEvent<WatchProjectPayload>).detail;
        const matchesSubscription = !!this.serverSubscriptionId && payload.subscriptionId === this.serverSubscriptionId;
        const matchesRequest = !!this.requestId && payload.requestId === this.requestId;
        if (!matchesSubscription && !matchesRequest) return;
        if ('error' in payload.event) {
            this.callbacks.onError(new Error(payload.event.error));
            return;
        }

        this.callbacks.onChange(payload.event);
    };

    private readonly handleSocketOpened = () => {
        void this.restoreSubscription();
    };

    private readonly handleSocketClosed = () => {
        this.requestId = null;
        this.serverSubscriptionId = null;
    };
}
