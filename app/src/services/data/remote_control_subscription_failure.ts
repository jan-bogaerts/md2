import { isRemoteControlConnectionError } from './remote_control_connection_error';

/**
 * Reports a failed remote subscription setup or restoration.
 * Connection errors are expected while the socket is down; reconnect restores the subscription.
 */
export function reportSubscriptionFailure(method: string, error: unknown) {
    if (isRemoteControlConnectionError(error)) return;

    console.error(`Remote subscription ${method} failed`, error);
}
