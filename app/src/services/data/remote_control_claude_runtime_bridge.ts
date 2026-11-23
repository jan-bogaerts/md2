import type { ClaudeRateLimitSnapshot, ElectronClaudeRuntimeBridge } from '../../data/electron_claude_runtime_bridge';
import {
    startCallbackSubscription,
    type RemoteControlCallbackSubscriptionOptions,
    type RemoteControlSubscriptionPayload,
} from './remote_control_callback_subscription';
import type { RemoteControlClient } from './remote_control_client';

interface ClaudeRateLimitsPayload extends RemoteControlSubscriptionPayload {
    snapshot: ClaudeRateLimitSnapshot;
}

const CLAUDE_RATE_LIMITS_SUBSCRIPTION: RemoteControlCallbackSubscriptionOptions<ClaudeRateLimitsPayload, ClaudeRateLimitSnapshot> = {
    eventName: 'claudeRateLimits',
    method: 'onClaudeRateLimits',
    select: (payload) => payload.snapshot,
};

/** Claude runtime bridge backed by one remote-control client. */
export class RemoteControlClaudeRuntimeBridge implements ElectronClaudeRuntimeBridge {
    private readonly client: RemoteControlClient;

    constructor(client: RemoteControlClient) {
        this.client = client;
    }

    async getClaudeRateLimits(accountId: string): Promise<ClaudeRateLimitSnapshot | null> {
        return this.client.request<ClaudeRateLimitSnapshot | null>('getClaudeRateLimits', [accountId]);
    }

    onClaudeRateLimits(callback: (snapshot: ClaudeRateLimitSnapshot) => void): () => void {
        return startCallbackSubscription(this.client, CLAUDE_RATE_LIMITS_SUBSCRIPTION, callback);
    }

    onConnectionChanged(callback: (connected: boolean) => void): () => void {
        return this.client.onConnectionChanged(callback);
    }
}
