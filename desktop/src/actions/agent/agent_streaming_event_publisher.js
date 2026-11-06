const STREAMING_EVENT_PUBLISH_INTERVAL_MS = 16;
const STREAMING_EVENT_MAX_EVENTS_PER_FLUSH = 25;

function logDeferredStreamingEventError(error) {
    console.error('[agent:streaming-event-publisher]', error);
}

function streamingEventKey(event) {
    if (event.type === 'assistant' && typeof event.itemId === 'string') return `assistant:${event.itemId}`;
    if (
        event.type === 'event'
        && event.event?.status === 'inProgress'
        && typeof event.event.providerItemId === 'string'
    ) return `event:${event.event.providerItemId}`;

    return null;
}

function mergeStreamingEvent(current, event) {
    if (event.type !== 'assistant') return event;

    return { ...event, content: `${current.content}${event.content}` };
}

/** Coalesces dense provider deltas before they cross into renderer-facing run publication. */
class AgentStreamingEventPublisher {
    constructor(onEvent, dependencies = {}) {
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.onDeferredError = dependencies.onDeferredError ?? logDeferredStreamingEventError;
        this.onEvent = onEvent;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.disposed = false;
        this.pendingByKey = new Map();
        this.pendingEvents = [];
        this.publishChain = Promise.resolve();
        this.timer = null;
        this.timerCompletion = null;
    }

    publish(event) {
        if (this.disposed) return Promise.resolve();
        const key = streamingEventKey(event);
        if (key) {
            const current = this.pendingByKey.get(key);
            if (current) current.event = mergeStreamingEvent(current.event, event);
            else {
                const pending = { event, key };
                this.pendingByKey.set(key, pending);
                this.pendingEvents.push(pending);
            }
            this.scheduleFlush();

            return Promise.resolve();
        }
        if (event.type === 'event') {
            const pending = { event, key };
            this.pendingEvents.push(pending);
            this.scheduleFlush();

            return Promise.resolve();
        }

        return this.publishBarrier(event);
    }

    scheduleFlush() {
        if (this.timer !== null || this.disposed) return;
        this.timer = this.setTimeout(() => {
            this.timer = null;
            const operation = this.queueOperation(() => this.flushBatch(true));
            operation.catch(this.onDeferredError);
        }, STREAMING_EVENT_PUBLISH_INTERVAL_MS);
    }

    publishBarrier(event) {
        this.clearScheduledFlush();

        return this.queueOperation(async () => {
            await this.flushPending();
            if (!this.disposed) await this.onEvent(event);
        });
    }

    flush() {
        this.clearScheduledFlush();

        return this.queueOperation(() => this.flushPending());
    }

    dispose() {
        this.disposed = true;
        this.clearScheduledFlush();
        this.pendingByKey.clear();
        this.pendingEvents = [];
    }

    clearScheduledFlush() {
        if (this.timer === null) return;
        this.clearTimeout(this.timer);
        this.timer = null;
        const completion = this.timerCompletion;
        this.timerCompletion = null;
        completion?.();
    }

    queueOperation(operation) {
        const queued = this.publishChain.then(operation);
        this.publishChain = queued.catch(() => undefined);

        return queued;
    }

    async flushPending() {
        this.clearScheduledFlush();
        let firstBatch = true;
        while (!this.disposed && this.pendingEvents.length > 0) {
            if (!firstBatch) await this.waitForFlushInterval();
            if (this.disposed) return;
            await this.flushBatch(false);
            firstBatch = false;
        }
        this.clearScheduledFlush();
    }

    waitForFlushInterval() {
        return new Promise((resolve) => {
            this.timerCompletion = resolve;
            this.timer = this.setTimeout(() => {
                this.timer = null;
                this.timerCompletion = null;
                resolve();
            }, STREAMING_EVENT_PUBLISH_INTERVAL_MS);
        });
    }

    async flushBatch(scheduleRemaining) {
        if (this.disposed) return;
        const batch = this.pendingEvents.splice(0, STREAMING_EVENT_MAX_EVENTS_PER_FLUSH);
        for (const pending of batch) {
            if (pending.key && this.pendingByKey.get(pending.key) === pending) this.pendingByKey.delete(pending.key);
            await this.onEvent(pending.event);
            if (this.disposed) return;
        }
        if (scheduleRemaining && this.pendingEvents.length > 0) this.scheduleFlush();
    }
}

module.exports = {
    AgentStreamingEventPublisher,
    STREAMING_EVENT_MAX_EVENTS_PER_FLUSH,
    STREAMING_EVENT_PUBLISH_INTERVAL_MS,
};
