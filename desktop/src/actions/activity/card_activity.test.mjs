import { describe, expect, it, vi } from 'vitest';
import {
    migrateActivityValue,
    parseActivityFileForMigration,
    parseActivityValue,
    repairActivityFile,
} from '../../../../shared/card_activity.mjs';

const origin = { cardInternalId: 'card-1', kind: 'card' };

function selection(activeAgent, model, thinkingLevel, permissionMode = 'ask-for-approval') {
    return { activeAgent, permissionMode, settingsByAgent: { [activeAgent]: { model, thinkingLevel } } };
}

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
    it('parses conversation values without serializing them again', () => {
        const conversation = {
            actionId: 'build', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: null,
            entries: [], id: 'conversation-1', providerSessions: [], startedAt: '2026-08-01T12:00:00.000Z',
            status: 'running', title: 'Build', viewed: true,
        };
        const stringify = vi.spyOn(JSON, 'stringify');

        parseActivityValue({ actionSettings: {}, conversations: [conversation], origin, records: [], version: 5 }, origin);

        expect(stringify).not.toHaveBeenCalled();
        stringify.mockRestore();
    });

    it('repairs malformed JSON to empty canonical activity when origin is known', () => {
        expect(repairActivityFile('{broken', origin)).toEqual({
            activity: { actionSettings: {}, conversations: [], origin, records: [], version: 5 },
            changed: true,
            status: 'repaired',
        });
    });

    it('leaves future and originless unparseable activity unchanged', () => {
        expect(repairActivityFile(JSON.stringify({ version: 6 }), origin)).toEqual({ activity: null, changed: false, status: 'future' });
        expect(repairActivityFile('{broken')).toEqual({ activity: null, changed: false, status: 'unrecoverable' });
    });

    it('repairs malformed current collections at smallest valid level', () => {
        const conversation = {
            actionId: 'build', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: '2026-08-01T12:01:00.000Z',
            entries: [
                { content: 'done', id: 'message-1', kind: 'message', role: 'assistant', timestamp: '2026-08-01T12:01:00.000Z' },
                { kind: 'broken' },
            ],
            id: 'conversation-1', providerSessions: [], startedAt: '2026-08-01T12:00:00.000Z', status: 'completed', title: 'Build', viewed: true,
        };
        const validCommit = {
            branch: 'main', commit: 'a'.repeat(40), committedAt: '2026-08-01T12:01:00.000Z', deletions: 1,
            filePaths: ['one.ts'], filesChanged: 1, insertions: 2,
        };
        const malformedRecord = { ...record(), commits: [validCommit, { commit: 'bad' }], conversationIds: ['conversation-1', null] };
        const value = {
            actionSettings: {
                build: selection('codex', '', 'high'),
                broken: { activeAgent: 'codex' },
            },
            conversations: [conversation, { id: null }],
            origin,
            records: [malformedRecord, { status: 'broken' }],
            version: 5,
        };

        const repaired = repairActivityFile(JSON.stringify(value), origin);

        expect(repaired.status).toBe('repaired');
        expect(repaired.activity?.actionSettings).toEqual({ build: selection('codex', '', 'high') });
        expect(repaired.activity?.conversations).toHaveLength(1);
        expect(repaired.activity?.conversations[0].entries).toHaveLength(1);
        expect(repaired.activity?.records).toHaveLength(1);
        expect(repaired.activity?.records[0].commits).toEqual([validCommit]);
        expect(repaired.activity?.records[0].conversationIds).toEqual(['conversation-1']);
    });

    it.each([1, 2, 3])('repairs version %s with missing collections to current defaults', (version) => {
        const value = { origin, version, ...(version === 3 ? { actionSettings: null } : {}) };
        const repaired = repairActivityFile(JSON.stringify(value), origin);

        expect(repaired).toEqual({
            activity: { actionSettings: {}, conversations: [], origin, records: [], version: 5 },
            changed: true,
            status: 'repaired',
        });
    });

    it.each([1, 2, 3])('strictly migrates recognized version %s activity while parsing', (version) => {
        const value = {
            ...(version === 3 ? { actionSettings: {} } : {}),
            conversations: [],
            origin,
            records: [],
            version,
        };

        expect(parseActivityFileForMigration(JSON.stringify(value), origin))
            .toEqual({ actionSettings: {}, conversations: [], origin, records: [], version: 5 });
    });

    it('drops repaired agent records whose required conversation link does not resolve', () => {
        const agentRecord = {
            ...record(),
            conversationIds: ['missing'],
            details: { agent: 'codex', type: 'agent' },
            rootConversationId: 'missing',
        };
        const activity = {actionSettings: {}, conversations: [], origin, records: [agentRecord], version: 5};
        const repaired = repairActivityFile(JSON.stringify(activity), origin);

        expect(repaired.activity?.records).toEqual([]);
    });

    it('parses the runId activity contract', () => {
        const activity = parseActivityValue({ actionSettings: {}, conversations: [], origin, records: [record()], version: 5 }, origin);

        expect(activity.records[0].runId).toBe('run-1');
    });

    it('rejects the removed executionId field', () => {
        const legacyRecord = { ...record(), executionId: 'execution-1' };
        delete legacyRecord.runId;

        expect(() => parseActivityValue({ actionSettings: {}, conversations: [], origin, records: [legacyRecord], version: 5 }, origin))
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

        expect(migrated).toMatchObject({ actionSettings: {}, version: 5, conversations: [{ viewed: true }, { viewed: true }] });
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

        expect(migrated).toEqual({ actionSettings: {}, conversations: [], origin, records: [record()], version: 5 });
    });

    it('migrates recognized version 3 settings and agent history to permissionMode only', () => {
        const conversation = {
            actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: '2026-08-01T12:01:00.000Z',
            entries: [], id: 'conversation-1', providerSessions: [], startedAt: '2026-08-01T12:00:00.000Z',
            status: 'completed', title: 'Review', viewed: true,
        };
        const agentRecord = {
            ...record(),
            conversationIds: ['conversation-1'],
            details: {accessLevel: '', agent: 'claude', approvalPolicy: 'auto', model: 'sonnet', thinkingLevel: 'high', type: 'agent'},
            rootActionId: 'review',
            rootConversationId: 'conversation-1',
        };
        const legacySettings = {accessLevel: 'workspace-write', agent: 'codex', approvalPolicy: 'on-request', model: 'gpt-5', thinkingLevel: 'high'};
        const versionThree = {
            actionSettings: { implement: legacySettings },
            conversations: [conversation],
            origin,
            records: [agentRecord],
            version: 3,
        };

        const migrated = migrateActivityValue(versionThree, origin);

        expect(migrated.actionSettings.implement).toEqual(selection('codex', 'gpt-5', 'high'));
        expect(migrated.records[0].details).toEqual({agent: 'claude', model: 'sonnet', permissionMode: 'approve-for-me', thinkingLevel: 'high', type: 'agent'});
        expect(JSON.stringify(migrated)).not.toContain('accessLevel');
        expect(JSON.stringify(migrated)).not.toContain('approvalPolicy');
    });

    it('rejects unrecognized version 3 permission combinations', () => {
        const legacySettings = {accessLevel: 'read-only', agent: 'codex', approvalPolicy: 'never', model: 'gpt-5', thinkingLevel: 'high'};
        const versionThree = {
            actionSettings: { implement: legacySettings },
            conversations: [],
            origin,
            records: [],
            version: 3,
        };

        expect(() => migrateActivityValue(versionThree, origin))
            .toThrow('unrecognised legacy permission combination in actionSettings.implement');
    });

    it('migrates version 4 flat settings without changing conversations or records', () => {
        const settings = { agent: 'claude', model: 'opus', permissionMode: 'full-access', thinkingLevel: 'max' };
        const versionFour = { actionSettings: { review: settings }, conversations: [], origin, records: [record()], version: 4 };

        expect(migrateActivityValue(versionFour, origin)).toEqual({
            actionSettings: { review: selection('claude', 'opus', 'max', 'full-access') },
            conversations: [],
            origin,
            records: [record()],
            version: 5,
        });
    });

    it.each([
        ['codex', 'workspace-write', 'on-request', 'ask-for-approval'],
        ['codex', 'danger-full-access', 'never', 'full-access'],
        ['claude', '', 'acceptEdits', 'ask-for-approval'],
        ['claude', '', 'auto', 'approve-for-me'],
        ['claude', '', 'bypassPermissions', 'full-access'],
    ])('migrates recognized %s %s/%s settings', (agent, accessLevel, approvalPolicy, permissionMode) => {
        const settings = { accessLevel, agent, approvalPolicy, model: 'model', thinkingLevel: 'none' };
        const versionThree = {actionSettings: { review: settings }, conversations: [], origin, records: [], version: 3};

        expect(migrateActivityValue(versionThree, origin).actionSettings.review)
            .toEqual(selection(agent, 'model', 'none', permissionMode));
    });

    it('parses complete action settings and preserves provider-default empty strings', () => {
        const settings = selection('codex', '', 'high');
        const activityValue = { actionSettings: { review: settings }, conversations: [], origin, records: [], version: 5 };
        const activity = parseActivityValue(activityValue, origin);

        expect(activity.actionSettings.review).toEqual(settings);
    });

    it.each([
        [{ review: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: { codex: { model: '' } } } }, 'thinkingLevel'],
        [{ review: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: { codex: { model: '', thinkingLevel: null } } } }, 'thinkingLevel'],
        [[], 'actionSettings must be an object'],
    ])('rejects malformed action settings %#', (actionSettings, expected) => {
        expect(() => parseActivityValue({ actionSettings, conversations: [], origin, records: [], version: 5 }, origin))
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
