/** Raised when a still-finalizing action run no longer accepts prompts into its own queue. */
class ActionPromptQueueClosedError extends Error {
    constructor(runId) {
        super(`Action run no longer accepts queued prompts: ${runId}`);
        this.runId = runId;
    }
}

module.exports = { ActionPromptQueueClosedError };
