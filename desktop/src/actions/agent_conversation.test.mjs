import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    createConversation,
    createEvent,
    createMessage,
    hasRequiredProviderConversationId,
    updateProviderSession,
} = require('./agent_conversation');

describe('agent conversation', () => {
    it('creates messages and events in persisted shapes', () => {
        expect(createMessage('message-1', 'assistant', 'done', 'now', 'codex')).toEqual({agent: 'codex', content: 'done', id: 'message-1', role: 'assistant', timestamp: 'now'});
        expect(createEvent('event-1', 'output', 'done', 'now')).toEqual({content: 'done', id: 'event-1', timestamp: 'now', type: 'output'});
    });

    it('creates a new running conversation', () => {
        expect(createConversation({ actionId: 'review', cardPath: 'design/card.md', title: 'Review' }, 'agent-1', 'now')).toEqual({
            actionId: 'review',
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
        const resumed = createConversation({ conversation }, 'unused', 'unused');

        expect(resumed).toEqual({ completedAt: null, events: [], id: 'agent-1', messages: [], providerSessions: [], status: 'running' });
        expect(resumed.events).not.toBe(conversation.events);
        expect(resumed.messages).not.toBe(conversation.messages);
        expect(resumed.providerSessions).not.toBe(conversation.providerSessions);
    });

    it('updates provider session cursor and validates required provider ids', () => {
        const run = {
            agent: 'codex',
            conversation: { providerSessions: [] },
            providerConversationId: 'thread-1',
            request: {},
        };

        expect(hasRequiredProviderConversationId(run)).toBe(true);
        updateProviderSession(run, 'message-1', 'now');
        expect(run.conversation.providerSessions).toEqual([{
            agent: 'codex',
            conversationId: 'thread-1',
            createdAt: 'now',
            lastUsedAt: 'now',
            synchronizedThroughMessageId: 'message-1',
        }]);
        expect(hasRequiredProviderConversationId({ ...run, providerConversationId: null, request: {} })).toBe(false);
        expect(hasRequiredProviderConversationId({ ...run, agent: 'generic', providerConversationId: null, request: {} })).toBe(true);
    });
});
