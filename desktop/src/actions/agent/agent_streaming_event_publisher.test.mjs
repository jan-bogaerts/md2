import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    AgentStreamingEventPublisher,
    STREAMING_EVENT_MAX_EVENTS_PER_FLUSH,
    STREAMING_EVENT_PUBLISH_INTERVAL_MS,
} = require('./agent_streaming_event_publisher');

function providerEvent(providerItemId, content, status = 'inProgress') {
    return {
        event: { content, providerItemId, status, type: 'reasoning' },
        type: 'event',
    };
}

describe('AgentStreamingEventPublisher', () => {
    afterEach(() => vi.useRealTimers());

    it('coalesces dense interleaved assistant and provider deltas by stable identity', async () => {
        vi.useFakeTimers();
        const published = [];
        const publisher = new AgentStreamingEventPublisher(async (event) => published.push(event));

        for (let index = 0; index < 120; index += 1) {
            await publisher.publish({ content: String(index % 10), itemId: `message-${index % 2}`, type: 'assistant' });
            await publisher.publish(providerEvent(`reasoning-${index % 3}`, `revision-${index}`));
        }
        await vi.advanceTimersByTimeAsync(STREAMING_EVENT_PUBLISH_INTERVAL_MS);

        expect(published).toHaveLength(5);
        expect(published.map((event) => event.itemId ?? event.event.providerItemId)).toEqual([
            'message-0', 'reasoning-0', 'message-1', 'reasoning-1', 'reasoning-2',
        ]);
        expect(published.filter(({ type }) => type === 'assistant').map(({ content }) => content)).toEqual([
            '024680246802468024680246802468024680246802468024680246802468',
            '135791357913579135791357913579135791357913579135791357913579',
        ]);
        expect(published.filter(({ type }) => type === 'event').map(({ event }) => event.content)).toEqual([
            'revision-117', 'revision-118', 'revision-119',
        ]);
    });

    it('limits one scheduled flush and schedules remaining distinct events', async () => {
        vi.useFakeTimers();
        const published = [];
        const publisher = new AgentStreamingEventPublisher(async (event) => published.push(event));
        const total = STREAMING_EVENT_MAX_EVENTS_PER_FLUSH + 7;

        for (let index = 0; index < total; index += 1) await publisher.publish(providerEvent(`item-${index}`, String(index)));
        await vi.advanceTimersByTimeAsync(STREAMING_EVENT_PUBLISH_INTERVAL_MS);
        expect(published).toHaveLength(STREAMING_EVENT_MAX_EVENTS_PER_FLUSH);
        await vi.advanceTimersByTimeAsync(STREAMING_EVENT_PUBLISH_INTERVAL_MS);
        expect(published).toHaveLength(total);
    });

    it('limits completed child-history events without allowing turn completion to overtake them', async () => {
        vi.useFakeTimers();
        const published = [];
        const publisher = new AgentStreamingEventPublisher(async (event) => published.push(event));
        const total = (STREAMING_EVENT_MAX_EVENTS_PER_FLUSH * 2) + 7;

        for (let index = 0; index < total; index += 1) {
            await publisher.publish(providerEvent(`history-${index}`, String(index), 'completed'));
        }
        await vi.advanceTimersByTimeAsync(STREAMING_EVENT_PUBLISH_INTERVAL_MS);
        expect(published).toHaveLength(STREAMING_EVENT_MAX_EVENTS_PER_FLUSH);
        const completion = publisher.publish({ type: 'turnCompleted', usage: null });
        await vi.advanceTimersByTimeAsync(STREAMING_EVENT_PUBLISH_INTERVAL_MS);
        await completion;
        expect(published).toHaveLength(total + 1);
        expect(published.at(-1).type).toBe('turnCompleted');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('flushes pending content before completion and terminal events', async () => {
        vi.useFakeTimers();
        const published = [];
        const publisher = new AgentStreamingEventPublisher(async (event) => published.push(event));

        await publisher.publish(providerEvent('reasoning-1', 'draft'));
        await publisher.publish({ content: 'answer', itemId: 'message-1', type: 'assistant' });
        await publisher.publish(providerEvent('reasoning-1', 'done', 'completed'));
        await publisher.publish({ type: 'turnCompleted', usage: null });

        expect(published.map((event) => event.type === 'event' ? `${event.event.providerItemId}:${event.event.status}` : event.type)).toEqual([
            'reasoning-1:inProgress', 'assistant', 'reasoning-1:completed', 'turnCompleted',
        ]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears pending events and timer on disposal', async () => {
        vi.useFakeTimers();
        const onEvent = vi.fn();
        const publisher = new AgentStreamingEventPublisher(onEvent);

        await publisher.publish(providerEvent('reasoning-1', 'draft'));
        publisher.dispose();
        await vi.runAllTimersAsync();
        await publisher.publish(providerEvent('reasoning-1', 'late'));

        expect(onEvent).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
