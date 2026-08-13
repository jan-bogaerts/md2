import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    appendActionActivity,
    closeWaitingActivityConversation,
    ensureActivityFile,
    listAgentConversationReferences,
    loadActivityConversation,
    readActivityFile,
    upsertActivityConversation,
    updateCardActionSettings,
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

    it('creates an empty card activity file without replacing an existing file', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-reservation-'));
        const project = { branch: 'main', id: 'local', rootPath };
        const origin = { cardInternalId: 'card-1', kind: 'card' };
        try {
            await mkdir(join(rootPath, '.git'));
            const relativePath = await ensureActivityFile(project, 'design', origin);
            const filePath = join(rootPath, relativePath);
            const firstContent = await readFile(filePath, 'utf8');
            await ensureActivityFile(project, 'design', origin);

            expect(JSON.parse(firstContent)).toEqual({ actionSettings: {}, conversations: [], origin, records: [], version: 4 });
            expect(await readFile(filePath, 'utf8')).toBe(firstContent);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('does not migrate or write legacy activity during a read', async () => {
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

            await expect(readActivityFile(filePath, { kind: 'project' }))
                .rejects.toThrow('unsupported version 1');
            expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({conversations: [conversation], origin: { kind: 'project' }, records: [legacyRecord], version: 1});
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('leaves legacy activity untouched when concurrent readers race', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-migration-race-'));
        const filePath = join(rootPath, 'project.json');
        const conversation = waitingConversation();
        const legacyRecord = {
            commits: [], completedAt: terminalTime, conversationIds: [conversation.id],
            history: { agent: 'codex', completedAt: terminalTime, output: 'answer', prompt: 'question', status: 'completed' },
            origin: { kind: 'project' }, rootActionId: conversation.actionId, rootActionLabel: 'Review', runId: 'run-1',
            startedAt: conversation.startedAt, status: 'completed',
        };
        const rename = vi.spyOn(fs.promises, 'rename');
        try {
            await writeFile(filePath, JSON.stringify({ conversations: [conversation], origin: { kind: 'project' }, records: [legacyRecord], version: 1 }));

            const results = await Promise.allSettled([
                readActivityFile(filePath, { kind: 'project' }),
                readActivityFile(filePath, { kind: 'project' }),
                readActivityFile(filePath, { kind: 'project' }),
            ]);

            expect(results.map(({ status }) => status)).toEqual(['rejected', 'rejected', 'rejected']);
            expect(rename).not.toHaveBeenCalled();
            await expect(readdir(rootPath)).resolves.toEqual(['project.json']);
        } finally {
            rename.mockRestore();
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('updates one card action setting without replacing conversations or other action settings', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-settings-'));
        const project = { branch: 'main', rootPath };
        const origin = { cardInternalId: 'card-1', kind: 'card' };
        const firstSettings = { agent: 'codex', model: 'gpt-5', permissionMode: 'ask-for-approval', thinkingLevel: 'high' };
        const secondSettings = { agent: 'claude', model: 'sonnet', permissionMode: 'approve-for-me', thinkingLevel: 'none' };
        const conversation = { ...waitingConversation(), cardInternalId: 'card-1' };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', origin, conversation);
            await updateCardActionSettings(project, 'design', 'card-1', 'review', firstSettings);
            await updateCardActionSettings(project, 'design', 'card-1', 'build', secondSettings);
            const persisted = JSON.parse(await readFile(join(rootPath, 'design', 'activity', 'card__card-1.json'), 'utf8'));

            expect(persisted.actionSettings).toEqual({ build: secondSettings, review: firstSettings });
            expect(persisted.conversations).toHaveLength(1);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('serializes settings, conversation, history, and viewed-state writes without losing fields', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-settings-race-'));
        const project = { branch: 'main', rootPath };
        const origin = { cardInternalId: 'card-1', kind: 'card' };
        const settings = { agent: 'codex', model: 'gpt-5', permissionMode: 'ask-for-approval', thinkingLevel: 'high' };
        const conversation = { ...waitingConversation(), cardInternalId: 'card-1' };
        const secondConversation = { ...conversation, id: 'conversation-2', title: 'Second' };
        const reference = 'design/activity/card__card-1.json#conversation=conversation-1';
        const record = {
            commits: [], completedAt: terminalTime, conversationIds: [],
            details: { command: 'build', output: 'done', type: 'command' }, origin,
            rootActionId: 'build', rootActionLabel: 'Build', runId: 'run-1',
            startedAt: conversation.startedAt, status: 'completed',
        };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', origin, conversation);
            await Promise.all([
                updateCardActionSettings(project, 'design', 'card-1', 'review', settings),
                upsertActivityConversation(project, 'design', origin, secondConversation),
                appendActionActivity(project, 'design', origin, record),
                updateActivityConversationViewed(project, reference, false),
            ]);
            const persisted = JSON.parse(await readFile(join(rootPath, 'design', 'activity', 'card__card-1.json'), 'utf8'));

            expect(persisted.actionSettings.review).toEqual(settings);
            expect(persisted.conversations).toHaveLength(2);
            expect(persisted.conversations.find(({ id }) => id === conversation.id).viewed).toBe(false);
            expect(persisted.records).toEqual([record]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('keeps an unwritten activity for the next write instead of losing it', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-write-failure-'));
        const activityFolder = join(rootPath, 'design', 'activity');
        const project = { branch: 'main', rootPath };
        const seed = { ...waitingConversation(), id: 'conversation-seed', title: 'Seed' };
        const unwritten = { ...waitingConversation(), id: 'conversation-unwritten', title: 'Unwritten' };
        const recovered = { ...waitingConversation(), id: 'conversation-recovered', title: 'Recovered' };
        const rename = vi.spyOn(fs.promises, 'rename');
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, seed);

            rename.mockClear();
            rename.mockRejectedValue(Object.assign(new Error('rename failed'), { code: 'EPERM' }));
            await expect(upsertActivityConversation(project, 'design', { kind: 'project' }, unwritten))
                .rejects.toThrow('rename failed');
            expect(rename).toHaveBeenCalledTimes(5);
            expect((await readdir(activityFolder)).filter((name) => name.endsWith('.tmp'))).toEqual([]);

            rename.mockRestore();
            await upsertActivityConversation(project, 'design', { kind: 'project' }, recovered);
            const persisted = JSON.parse(await readFile(join(activityFolder, 'project.json'), 'utf8'));

            expect(persisted.conversations.map(({ id }) => id)).toEqual([seed.id, unwritten.id, recovered.id]);
        } finally {
            rename.mockRestore();
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('retries a locked rename while preserving the existing activity file', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-rename-retry-'));
        const activityFolder = join(rootPath, 'design', 'activity');
        const filePath = join(activityFolder, 'project.json');
        const project = { branch: 'main', rootPath };
        const seed = { ...waitingConversation(), id: 'conversation-seed', title: 'Seed' };
        const added = { ...waitingConversation(), id: 'conversation-added', title: 'Added' };
        const originalRename = fs.promises.rename.bind(fs.promises);
        const rename = vi.spyOn(fs.promises, 'rename');
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, seed);
            const originalContent = await readFile(filePath, 'utf8');
            rename.mockClear();
            rename.mockImplementationOnce(async () => {
                expect(await readFile(filePath, 'utf8')).toBe(originalContent);
                throw Object.assign(new Error('file is locked'), { code: 'EPERM' });
            });
            rename.mockImplementation(originalRename);

            await upsertActivityConversation(project, 'design', { kind: 'project' }, added);
            const persisted = JSON.parse(await readFile(filePath, 'utf8'));

            expect(rename).toHaveBeenCalledTimes(2);
            expect(persisted.conversations.map(({ id }) => id)).toEqual([seed.id, added.id]);
        } finally {
            rename.mockRestore();
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
