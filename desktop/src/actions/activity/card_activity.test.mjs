import { describe, expect, it } from 'vitest';
import { migrateActivityValue, parseActivityValue } from '../../../../shared/card_activity.mjs';

const origin = { cardInternalId: 'card-1', kind: 'card' };

function record() {
    return {
        commits: [],
        completedAt: '2026-08-01T12:01:00.000Z',
        conversationIds: [],
        details: { command: 'build', output: 'done', type: 'command' },
        origin,
        rootActionId: 'build',
        rootActionLabel: 'Build',
        runId: 'run-1',
        startedAt: '2026-08-01T12:00:00.000Z',
        status: 'completed',
    };
}

describe('card activity action runs', () => {
    it('parses the runId activity contract', () => {
        const activity = parseActivityValue({ actionSettings: {}, conversations: [], origin, records: [record()], version: 3 }, origin);

        expect(activity.records[0].runId).toBe('run-1');
    });

    it('rejects the removed executionId field', () => {
        const legacyRecord = { ...record(), executionId: 'execution-1' };
        delete legacyRecord.runId;

        expect(() => parseActivityValue({ actionSettings: {}, conversations: [], origin, records: [legacyRecord], version: 3 }, origin))
            .toThrow('Malformed activity file: missing records[0].runId');
    });

    it('migrates agent history to metadata and an explicit root conversation', () => {
        const conversation = {
            actionId: 'build', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: '2026-08-01T12:01:00.000Z',
            entries: [
                { content: 'run', id: 'user-1', kind: 'message', role: 'user', timestamp: '2026-08-01T12:00:00.000Z' },
                { content: 'done', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: '2026-08-01T12:01:00.000Z' },
            ],
            id: 'conversation-root', providerSessions: [], startedAt: '2026-08-01T12:00:00.000Z', status: 'completed', title: 'Build',
        };
        const legacyRecord = {
            ...record(),
            conversationIds: ['conversation-child', 'conversation-root'],
            history: {
                agent: 'codex', completedAt: '2026-08-01T12:01:00.000Z', model: 'gpt-5', output: 'done', prompt: 'run',
                status: 'completed', thinkingLevel: 'high',
            },
        };
        delete legacyRecord.details;
        const child = { ...conversation, actionId: 'review', id: 'conversation-child', title: 'Review' };

        const conversations = [child, conversation];
        const legacyActivity = { conversations, origin, records: [legacyRecord], version: 1 };
        const migrated = migrateActivityValue(legacyActivity, origin);

        expect(migrated).toMatchObject({ actionSettings: {}, version: 3, conversations: [{ viewed: true }, { viewed: true }] });
        expect(migrated.records[0]).toMatchObject({
            conversationIds: ['conversation-child', 'conversation-root'],
            details: { agent: 'codex', model: 'gpt-5', thinkingLevel: 'high', type: 'agent' },
            rootConversationId: 'conversation-root',
        });
        expect(migrated.records[0]).not.toHaveProperty('history');
        expect(migrated.records[0].details).not.toHaveProperty('output');
        expect(migrated.records[0].details).not.toHaveProperty('prompt');
    });

    it('migrates version 2 by adding empty action settings', () => {
        const migrated = migrateActivityValue({ conversations: [], origin, records: [record()], version: 2 }, origin);

        expect(migrated).toEqual({ actionSettings: {}, conversations: [], origin, records: [record()], version: 3 });
    });

    it('parses complete action settings and preserves provider-default empty strings', () => {
        const settings = { accessLevel: '', agent: 'codex', approvalPolicy: '', model: '', thinkingLevel: 'high' };
        const activityValue = { actionSettings: { review: settings }, conversations: [], origin, records: [], version: 3 };
        const activity = parseActivityValue(activityValue, origin);

        expect(activity.actionSettings.review).toEqual(settings);
    });

    it.each([
        [{ review: { accessLevel: '', agent: 'codex', approvalPolicy: '', model: '' } }, 'thinkingLevel'],
        [{ review: { accessLevel: '', agent: 'codex', approvalPolicy: '', model: '', thinkingLevel: null } }, 'thinkingLevel'],
        [[], 'actionSettings must be an object'],
    ])('rejects malformed action settings %#', (actionSettings, expected) => {
        expect(() => parseActivityValue({ actionSettings, conversations: [], origin, records: [], version: 3 }, origin))
            .toThrow(expected);
    });

    it.each([
        { conversations: [], expected: '0 matching root conversations' },
        {
            conversations: [
                { id: 'conversation-root' },
                { id: 'conversation-second' },
            ],
            expected: '2 matching root conversations',
        },
    ])('rejects agent migration with $expected', ({ conversations: candidateOverrides, expected }) => {
        const baseConversation = {
            actionId: 'build', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: '2026-08-01T12:01:00.000Z',
            entries: [], providerSessions: [], startedAt: '2026-08-01T12:00:00.000Z', status: 'completed', title: 'Build',
        };
        const conversations = candidateOverrides.map((candidate) => ({ ...baseConversation, ...candidate }));
        const legacyRecord = {
            ...record(),
            conversationIds: ['conversation-root', 'conversation-second'],
            history: { agent: 'codex', completedAt: '2026-08-01T12:01:00.000Z', output: '', prompt: '', status: 'failed' },
        };
        delete legacyRecord.details;

        expect(() => migrateActivityValue({conversations, origin, records: [legacyRecord], version: 1}, origin)).toThrow(expected);
    });
});
