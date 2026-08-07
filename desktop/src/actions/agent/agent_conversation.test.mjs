import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    accumulateUsage,
    createProviderEventEntry,
    createConversation,
    createEventEntry,
    createMessageEntry,
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
        expect(createMessageEntry('message-1', 'assistant', 'done', 'now', 'codex')).toEqual({agent: 'codex', content: 'done', id: 'message-1', kind: 'message', role: 'assistant', timestamp: 'now'});
        expect(createEventEntry('event-1', 'output', 'done', 'now')).toEqual({content: 'done', id: 'event-1', kind: 'event', timestamp: 'now', type: 'output'});
    });

    it('omits unavailable numeric event detail', () => {
        const providerEvent = {
            content: '',
            durationMs: null,
            exitCode: null,
            label: 'Command',
            providerItemId: 'command-1',
            status: 'inProgress',
            type: 'commandExecution',
        };

        expect(createProviderEventEntry(providerEvent, 'event-1', 'now', 2)).not.toMatchObject({
            durationMs: expect.anything(),
            exitCode: expect.anything(),
        });
    });

    it('creates a new running conversation', () => {
        expect(createConversation({ actionId: 'review', activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, cardPath: 'design/card.md', title: 'Review' }, 'agent-1', 'now', 'log.json')).toEqual({
            actionId: 'review',
            cardInternalId: 'card-1',
            cardPath: 'design/card.md',
            completedAt: null,
            entries: [],
            hasExplicitTitle: true,
            id: 'agent-1',
            path: 'log.json',
            providerSessions: [],
            startedAt: 'now',
            status: 'running',
            title: 'Review',
            viewed: true,
        });
    });

    it('resumes the canonical conversation at its requested reference', () => {
        const conversation = {completedAt: 'before', entries: [], id: 'agent-1', path: 'old.json', providerSessions: [], status: 'completed', viewed: false};
        const resumed = createConversation({ activityOrigin: { kind: 'project' }, conversation }, 'unused', 'unused', 'log.json');

        expect(resumed).toEqual({ completedAt: null, entries: [], id: 'agent-1', path: 'log.json', providerSessions: [], status: 'running', viewed: false });
        expect(resumed.entries).not.toBe(conversation.entries);
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
