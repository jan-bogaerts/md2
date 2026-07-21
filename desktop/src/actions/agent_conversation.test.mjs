import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    accumulateUsage,
    createConversation,
    createEvent,
    createMessage,
    updateProviderSession,
} = require('./agent_conversation');

describe('agent conversation', () => {
    it('accumulates token buckets and optional reported cost', () => {
        const current = { cachedInputTokens: 2, costUsd: 0.1, inputTokens: 10, outputTokens: 3, reasoningTokens: 1, totalTokens: 16 };
        const turn = { cachedInputTokens: 4, inputTokens: 20, outputTokens: 6, reasoningTokens: 2, totalTokens: 32 };

        expect(accumulateUsage(current, turn)).toEqual({
            cachedInputTokens: 6,
            costUsd: 0.1,
            inputTokens: 30,
            outputTokens: 9,
            reasoningTokens: 3,
            totalTokens: 48,
        });
    });

    it('creates messages and events in persisted shapes', () => {
        expect(createMessage('message-1', 'assistant', 'done', 'now', 'codex')).toEqual({agent: 'codex', content: 'done', id: 'message-1', role: 'assistant', timestamp: 'now'});
        expect(createEvent('event-1', 'output', 'done', 'now')).toEqual({content: 'done', id: 'event-1', timestamp: 'now', type: 'output'});
    });

    it('creates a new running conversation', () => {
        expect(createConversation({ actionId: 'review', activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, cardPath: 'design/card.md', title: 'Review' }, 'agent-1', 'now')).toEqual({
            actionId: 'review',
            cardInternalId: 'card-1',
            cardPath: 'design/card.md',
            completedAt: null,
            events: [],
            hasExplicitTitle: true,
            id: 'agent-1',
            messages: [],
            providerSessions: [],
            startedAt: 'now',
            status: 'running',
            title: 'Review',
        });
    });

    it('resumes a conversation without persisting its path', () => {
        const conversation = {completedAt: 'before', events: [], id: 'agent-1', messages: [], path: 'log.json', providerSessions: [], status: 'completed'};
        const resumed = createConversation({ activityOrigin: { kind: 'project' }, conversation }, 'unused', 'unused');

        expect(resumed).toEqual({ completedAt: null, events: [], id: 'agent-1', messages: [], providerSessions: [], status: 'running' });
        expect(resumed.events).not.toBe(conversation.events);
        expect(resumed.messages).not.toBe(conversation.messages);
        expect(resumed.providerSessions).not.toBe(conversation.providerSessions);
    });

    it('updates a provider session cursor when an id is available', () => {
        const run = {
            agent: 'codex',
            conversation: { providerSessions: [] },
            providerConversationId: 'thread-1',
            request: {},
        };

        updateProviderSession(run, 'message-1', 'now');
        expect(run.conversation.providerSessions).toEqual([{
            agent: 'codex',
            conversationId: 'thread-1',
            createdAt: 'now',
            lastUsedAt: 'now',
            synchronizedThroughMessageId: 'message-1',
        }]);
        const runWithoutConversationId = { ...run, conversation: { providerSessions: [] }, providerConversationId: null };
        updateProviderSession(runWithoutConversationId, 'message-2', 'later');
        expect(runWithoutConversationId.conversation.providerSessions).toEqual([]);
    });
});
