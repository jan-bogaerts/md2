import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    closeWaitingActivityConversation,
    listAgentConversationReferences,
    loadActivityConversation,
    readActivityFile,
    upsertActivityConversation,
    updateActivityConversationViewed,
} = require('./activity_files');

const terminalTime = '2026-08-04T10:30:00.000Z';

function waitingConversation() {
    return {
        actionId: 'review',
        cardInternalId: null,
        cardPath: null,
        completedAt: null,
        entries: [{ content: 'Need input', id: 'message-1', kind: 'message', role: 'assistant', timestamp: '2026-08-04T10:01:00.000Z' }],
        id: 'conversation-1',
        providerSessions: [],
        startedAt: '2026-08-04T10:00:00.000Z',
        status: 'waitingForInput',
        title: 'Review',
        usage: { cachedInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 4, totalTokens: 10 },
        viewed: true,
    };
}

describe('project activity conversations', () => {
    afterEach(() => vi.useRealTimers());

    it('writes migrated schema and viewed state once when reading legacy activity', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-migration-'));
        const filePath = join(rootPath, 'project.json');
        const conversation = waitingConversation();
        const legacyRecord = {
            commits: [], completedAt: terminalTime, conversationIds: [conversation.id],
            history: { agent: 'codex', completedAt: terminalTime, output: 'answer', prompt: 'question', status: 'completed' },
            origin: { kind: 'project' }, rootActionId: conversation.actionId, rootActionLabel: 'Review', runId: 'run-1',
            startedAt: conversation.startedAt, status: 'completed',
        };
        delete conversation.viewed;
        try {
            await writeFile(filePath, JSON.stringify({ conversations: [conversation], origin: { kind: 'project' }, records: [legacyRecord], version: 1 }));

            const activity = await readActivityFile(filePath, { kind: 'project' });
            const persisted = JSON.parse(await readFile(filePath, 'utf8'));

            expect(activity).toMatchObject({ version: 2, conversations: [{ viewed: true }] });
            expect(persisted).toEqual(activity);
            expect(persisted.records[0]).not.toHaveProperty('history');
            expect(persisted.records[0]).toMatchObject({ rootConversationId: conversation.id });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('lists conversation references without routing activity JSON through markdown loading', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-activity-'));
        const project = { branch: 'main', rootPath };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, {
                completedAt: '2026-07-21T10:01:00.000Z',
                entries: [],
                id: 'conversation-1',
                providerSessions: [],
                startedAt: '2026-07-21T10:00:00.000Z',
                status: 'completed',
                title: 'Project run',
                viewed: true,
            });

            await expect(listAgentConversationReferences(project, 'design')).resolves.toEqual([
                'design/activity/project.json#conversation=conversation-1',
            ]);
            const persisted = JSON.parse(await readFile(join(rootPath, 'design', 'activity', 'project.json'), 'utf8'));
            expect(persisted.conversations[0]).toHaveProperty('entries');
            expect(persisted.conversations[0]).not.toHaveProperty('messages');
            expect(persisted.conversations[0]).not.toHaveProperty('events');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('updates only targeted conversation viewed state', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-view-conversation-'));
        const project = { branch: 'main', rootPath };
        const reference = 'design/activity/project.json#conversation=conversation-1';
        const source = waitingConversation();
        const untouched = { ...waitingConversation(), id: 'conversation-2', title: 'Untouched' };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, source);
            await upsertActivityConversation(project, 'design', { kind: 'project' }, untouched);

            const updated = await updateActivityConversationViewed(project, reference, false);
            const persisted = JSON.parse(await readFile(join(rootPath, 'design', 'activity', 'project.json'), 'utf8'));

            expect(updated).toMatchObject({ id: source.id, path: reference, viewed: false });
            expect(persisted.conversations.find(({ id }) => id === source.id).viewed).toBe(false);
            expect(persisted.conversations.find(({ id }) => id === untouched.id).viewed).toBe(true);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('preserves latest stored viewed state when stale checkpoint is queued afterward', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-view-checkpoint-race-'));
        const project = { branch: 'main', rootPath };
        const reference = 'design/activity/project.json#conversation=conversation-1';
        const source = waitingConversation();
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, source);

            await Promise.all([
                updateActivityConversationViewed(project, reference, false),
                upsertActivityConversation(project, 'design', { kind: 'project' }, { ...source, entries: [] }),
            ]);

            await expect(loadActivityConversation(project, reference)).resolves.toMatchObject({ viewed: false });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it.each(['completed', 'cancelled'])('atomically closes a waiting conversation as %s', async (status) => {
        vi.useFakeTimers();
        vi.setSystemTime(terminalTime);
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-close-conversation-'));
        const project = { branch: 'main', rootPath };
        const reference = 'design/activity/project.json#conversation=conversation-1';
        const source = waitingConversation();
        const untouched = {
            ...waitingConversation(),
            completedAt: '2026-08-03T09:00:00.000Z',
            id: 'conversation-2',
            status: 'completed',
            title: 'Untouched',
        };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, source);
            await upsertActivityConversation(project, 'design', { kind: 'project' }, untouched);
            const persistedBefore = JSON.parse(await readFile(join(rootPath, 'design', 'activity', 'project.json'), 'utf8'));

            const updated = await closeWaitingActivityConversation(project, reference, status);
            const persisted = JSON.parse(await readFile(join(rootPath, 'design', 'activity', 'project.json'), 'utf8'));

            expect(updated).toEqual({ ...source, completedAt: terminalTime, hasExplicitTitle: true, path: reference, status });
            expect(persisted.conversations).toEqual(persistedBefore.conversations.map((conversation) => (
                conversation.id === source.id ? { ...conversation, completedAt: terminalTime, status } : conversation
            )));
            await expect(loadActivityConversation(project, reference)).resolves.toEqual(updated);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it.each(['completed', 'running'])('rejects stale %s state without changing persisted data', async (sourceStatus) => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-stale-conversation-'));
        const project = { branch: 'main', rootPath };
        const reference = 'design/activity/project.json#conversation=conversation-1';
        const source = {
            ...waitingConversation(),
            completedAt: sourceStatus === 'completed' ? terminalTime : null,
            status: sourceStatus,
        };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, source);

            await expect(closeWaitingActivityConversation(project, reference, 'cancelled'))
                .rejects.toThrow(`Agent conversation is no longer waiting for input: ${reference}`);
            const persisted = JSON.parse(await readFile(join(rootPath, 'design', 'activity', 'project.json'), 'utf8'));
            expect(persisted.conversations[0]).toEqual(source);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('rejects missing and malformed conversation references', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-invalid-conversation-reference-'));
        const project = { branch: 'main', rootPath };
        try {
            await mkdir(join(rootPath, '.git'));

            await expect(closeWaitingActivityConversation(project, '', 'completed'))
                .rejects.toThrow('Missing agent conversation reference');
            await expect(closeWaitingActivityConversation(project, 'not-an-activity-reference', 'completed'))
                .rejects.toThrow();
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
