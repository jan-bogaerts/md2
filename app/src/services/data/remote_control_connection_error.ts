/** Signals that the remote-control socket is unavailable, closed, or was replaced. */
export class RemoteControlConnectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RemoteControlConnectionError';
    }
}

export function isRemoteControlConnectionError(error: unknown): error is RemoteControlConnectionError {
    return error instanceof RemoteControlConnectionError;
}
