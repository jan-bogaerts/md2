/** Release cannot start while agent actions are running. */
export class ReleaseBlockedByRunningActionsError extends Error {
    constructor(labels: string[]) {
        super(`Cannot complete release while agent actions are running: ${labels.join(', ')}`);
        this.name = 'ReleaseBlockedByRunningActionsError';
    }
}
