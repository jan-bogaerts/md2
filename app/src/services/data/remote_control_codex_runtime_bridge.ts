import type { CodexRateLimitSnapshot, ElectronCodexRuntimeBridge } from '../../data/electron_codex_runtime_bridge';
import {
    startCallbackSubscription,
    type RemoteControlCallbackSubscriptionOptions,
    type RemoteControlSubscriptionPayload,
} from './remote_control_callback_subscription';
import type { RemoteControlClient } from './remote_control_client';

interface CodexRateLimitsPayload extends RemoteControlSubscriptionPayload {
    snapshot: CodexRateLimitSnapshot;
}

const CODEX_RATE_LIMITS_SUBSCRIPTION: RemoteControlCallbackSubscriptionOptions<CodexRateLimitsPayload, CodexRateLimitSnapshot> = {
    eventName: 'codexRateLimits',
    method: 'onCodexRateLimits',
    select: (payload) => payload.snapshot,
};

/** Codex runtime bridge backed by one remote-control client. */
export class RemoteControlCodexRuntimeBridge implements ElectronCodexRuntimeBridge {
    private readonly client: RemoteControlClient;

    constructor(client: RemoteControlClient) {
        this.client = client;
    }

    async getCodexRateLimits(accountId: string): Promise<CodexRateLimitSnapshot | null> {
        return this.client.request<CodexRateLimitSnapshot | null>('getCodexRateLimits', [accountId]);
    }

    onCodexRateLimits(callback: (snapshot: CodexRateLimitSnapshot) => void): () => void {
        return startCallbackSubscription(this.client, CODEX_RATE_LIMITS_SUBSCRIPTION, callback);
    }

    onConnectionChanged(callback: (connected: boolean) => void): () => void {
        return this.client.onConnectionChanged(callback);
    }
}
