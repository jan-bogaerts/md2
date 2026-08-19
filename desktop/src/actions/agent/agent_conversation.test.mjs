import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { AGENT_RESULT_MAX_LENGTH } from '../../../../shared/agent_conversations.mjs';

const require = createRequire(import.meta.url);
const {
    accumulateUsage,
    createProviderEventEntry,
    createConversation,
    createEventEntry,
    createMessageEntry,
    snapshotConversation,
    transitionConversationStatus,
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

    it('preserves non-negative file-change counts in persisted provider events', () => {
        const providerEvent = {
            content: 'update: design/card.md',
            deletions: 2,
            insertions: 4,
            label: 'File changes',
            providerItemId: 'file-1',
            status: 'completed',
            type: 'fileChange',
        };

        expect(createProviderEventEntry(providerEvent, 'event-1', 'now', 2)).toMatchObject({
            deletions: 2,
            insertions: 4,
        });
        expect(createProviderEventEntry({ ...providerEvent, deletions: -1, insertions: 1.5 }, 'event-2', 'now', 3))
            .not.toMatchObject({ deletions: expect.anything(), insertions: expect.anything() });
    });

    it('bounds redacted provider results and never duplicates command output', () => {
        const oversizedResult = 'result'.repeat(2_000);
        const command = createProviderEventEntry({
            command: oversizedResult,
            content: oversizedResult,
            label: 'Command',
            output: oversizedResult,
            providerItemId: 'command-1',
            status: 'completed',
            type: 'commandExecution',
        }, 'event-1', 'now', 2);
        const tool = createProviderEventEntry({
            content: oversizedResult,
            label: 'Tool',
            output: oversizedResult,
            providerItemId: 'tool-1',
            status: 'completed',
            type: 'mcpToolCall',
        }, 'event-2', 'now', 3);

        expect(command.command).toBe(oversizedResult);
        expect(command.content).toHaveLength(AGENT_RESULT_MAX_LENGTH);
        expect(command).not.toHaveProperty('output');
        expect(tool.content).toBe(oversizedResult);
        expect(tool.output).toHaveLength(AGENT_RESULT_MAX_LENGTH);
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
            timer: { elapsedMs: 0, runningStartedAt: 'now' },
            title: 'Review',
            usageSchemaVersion: 1,
            viewed: true,
        });
    });

    it('resumes the canonical conversation at its requested reference', () => {
        const conversation = {
            completedAt: 'before', entries: [], id: 'agent-1', path: 'old.json', providerSessions: [],
            status: 'completed', timer: { elapsedMs: 10_000, runningStartedAt: null }, viewed: false,
        };
        const resumed = createConversation(
            { activityOrigin: { kind: 'project' }, conversation },
            'unused',
            '2026-01-01T00:01:00.000Z',
            'log.json',
        );

        expect(resumed).toEqual({
            completedAt: null, entries: [], id: 'agent-1', path: 'log.json', providerSessions: [], status: 'running',
            timer: { elapsedMs: 10_000, runningStartedAt: '2026-01-01T00:01:00.000Z' }, usageSchemaVersion: 1, viewed: false,
        });
        expect(resumed.entries).not.toBe(conversation.entries);
        expect(resumed.providerSessions).not.toBe(conversation.providerSessions);
    });

    it('keeps legacy conversation duration unavailable when resumed', () => {
        const conversation = { completedAt: 'before', entries: [], id: 'agent-1', providerSessions: [], status: 'completed' };

        const resumed = createConversation(
            { activityOrigin: { kind: 'project' }, conversation },
            'unused',
            '2026-01-01T00:01:00.000Z',
            'log.json',
        );

        expect(resumed.status).toBe('running');
        expect(resumed).not.toHaveProperty('timer');
    });

    it('adds each running period once across repeated pause and resume events', () => {
        const conversation = {
            status: 'running',
            timer: { elapsedMs: 0, runningStartedAt: '2026-01-01T00:00:00.000Z' },
        };

        transitionConversationStatus(conversation, 'waitingForInput', '2026-01-01T00:00:10.000Z');
        transitionConversationStatus(conversation, 'waitingForInput', '2026-01-01T00:00:20.000Z');
        transitionConversationStatus(conversation, 'running', '2026-01-01T00:00:20.000Z');
        transitionConversationStatus(conversation, 'running', '2026-01-01T00:00:25.000Z');
        transitionConversationStatus(conversation, 'completed', '2026-01-01T00:00:30.000Z');
        transitionConversationStatus(conversation, 'completed', '2026-01-01T00:00:40.000Z');

        expect(conversation).toEqual({
            status: 'completed',
            timer: { elapsedMs: 20_000, runningStartedAt: null },
        });
    });

    it('snapshots mutable conversation collections without cloning immutable entries', () => {
        const entry = { content: 'done', id: 'message-1', kind: 'message', role: 'assistant', timestamp: 'now' };
        const providerSession = { agent: 'codex', conversationId: 'thread-1' };
        const conversation = { entries: [entry], id: 'agent-1', providerSessions: [providerSession] };

        const snapshot = snapshotConversation(conversation);

        expect(snapshot).not.toBe(conversation);
        expect(snapshot.entries).not.toBe(conversation.entries);
        expect(snapshot.providerSessions).not.toBe(conversation.providerSessions);
        expect(snapshot.entries[0]).toBe(entry);
        expect(snapshot.providerSessions[0]).toBe(providerSession);
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
