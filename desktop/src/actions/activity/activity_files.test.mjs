import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedAgentResult } from '../../../../shared/agent_conversations.mjs';

const require = createRequire(import.meta.url);
const {
    appendActionActivity,
    closeWaitingActivityConversation,
    compactActivityFiles,
    ensureActivityFile,
    listAgentConversationReferences,
    loadActivityConversation,
    loadActivityConversations,
    readActivityFile,
    upsertActivityConversation,
    updateCardActionSettings,
    updateActivityConversationViewed,
} = require('./activity_files');

const terminalTime = '2026-08-04T10:30:00.000Z';

function selection(activeAgent, model, thinkingLevel, permissionMode = 'ask-for-approval') {
    return { activeAgent, permissionMode, settingsByAgent: { [activeAgent]: { model, thinkingLevel } } };
}

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
        timer: { elapsedMs: 60_000, runningStartedAt: null },
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

            expect(JSON.parse(firstContent)).toEqual({ actionSettings: {}, conversations: [], origin, records: [], version: 5 });
            expect(await readFile(filePath, 'utf8')).toBe(firstContent);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads an empty activity file and all later conversations in stored order', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-load-file-'));
        const project = { branch: 'main', id: 'local', rootPath };
        const origin = { cardInternalId: 'card-1', kind: 'card' };
        try {
            await mkdir(join(rootPath, '.git'));
            const activityPath = await ensureActivityFile(project, 'design', origin);
            await expect(loadActivityConversations(project, activityPath)).resolves.toEqual([]);
            const first = { ...waitingConversation(), cardInternalId: 'card-1', id: 'conversation-1' };
            const second = { ...waitingConversation(), cardInternalId: 'card-1', id: 'conversation-2' };
            await upsertActivityConversation(project, 'design', origin, first);
            await upsertActivityConversation(project, 'design', origin, second);

            const loaded = await loadActivityConversations(project, activityPath);

            expect(loaded.map(({ id }) => id)).toEqual(['conversation-1', 'conversation-2']);
            expect(loaded.map(({ path }) => path)).toEqual([
                `${activityPath}#conversation=conversation-1`,
                `${activityPath}#conversation=conversation-2`,
            ]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('rejects unsafe activity-file paths', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-unsafe-'));
        const project = { branch: 'main', id: 'local', rootPath };
        try {
            await mkdir(join(rootPath, '.git'));

            await expect(loadActivityConversations(project, '../outside.json')).rejects.toThrow('escapes project root');
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
        const firstSettings = selection('codex', 'gpt-5', 'high');
        const secondSettings = selection('claude', 'sonnet', 'none', 'approve-for-me');
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
        const settings = selection('codex', 'gpt-5', 'high');
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
                contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
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
            expect(persisted.conversations[0].contextWindowUsage).toEqual({ capacityTokens: 258_400, usedTokens: 42_000 });
            expect(persisted.conversations[0]).not.toHaveProperty('messages');
            expect(persisted.conversations[0]).not.toHaveProperty('events');
            await expect(loadActivityConversation(
                project,
                'design/activity/project.json#conversation=conversation-1',
            )).resolves.toMatchObject({ contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 } });
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
            const filePath = join(rootPath, 'design', 'activity', 'project.json');
            const persistedBefore = JSON.parse(await readFile(filePath, 'utf8'));

            await expect(closeWaitingActivityConversation(project, reference, 'cancelled'))
                .rejects.toThrow(`Agent conversation is no longer waiting for input: ${reference}`);
            const persisted = JSON.parse(await readFile(filePath, 'utf8'));
            expect(persisted).toEqual(persistedBefore);
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

    it('compacts explicit current and released activity paths once without changing unrelated data', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-compaction-'));
        const project = { branch: 'main', rootPath };
        const origin = { cardInternalId: 'card-1', kind: 'card' };
        const currentPath = join('design', 'activity', 'card__card-1.json');
        const releasedPath = join('releases', 'v1', 'design', 'activity', 'card__released.json');
        const oversizedResult = `${'start'.repeat(1_000)}${'middle'.repeat(1_000)}${'end'.repeat(1_000)}`;
        const conversation = {
            ...waitingConversation(),
            cardInternalId: 'card-1',
            entries: [{
                command: 'npm test',
                content: 'short',
                id: 'command-1',
                kind: 'event',
                output: 'short',
                status: 'completed',
                timestamp: '2026-08-04T10:02:00.000Z',
                type: 'commandExecution',
            }, {
                content: 'query input',
                id: 'tool-1',
                kind: 'event',
                output: 'short',
                status: 'completed',
                timestamp: '2026-08-04T10:03:00.000Z',
                type: 'mcpToolCall',
            }],
        };
        const record = {
            commits: [], completedAt: terminalTime, conversationIds: [],
            details: { command: 'build', output: 'done', type: 'command' }, origin,
            rootActionId: 'build', rootActionLabel: 'Build', runId: 'run-1',
            startedAt: conversation.startedAt, status: 'completed',
        };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', origin, conversation);
            await appendActionActivity(project, 'design', origin, record);
            const currentFilePath = join(rootPath, currentPath);
            const before = JSON.parse(await readFile(currentFilePath, 'utf8'));
            before.conversations[0].entries[0].content = oversizedResult;
            before.conversations[0].entries[0].output = oversizedResult;
            before.conversations[0].entries[1].output = oversizedResult;
            await writeFile(currentFilePath, `${JSON.stringify(before, null, 2)}\n`);
            await mkdir(join(rootPath, 'releases', 'v1', 'design', 'activity'), { recursive: true });
            const releasedActivity = {
                actionSettings: {}, conversations: [],
                origin: { cardInternalId: 'released', kind: 'card' }, records: [], version: 5,
            };
            await writeFile(join(rootPath, releasedPath), `${JSON.stringify(releasedActivity, null, 2)}\n`);

            const first = await compactActivityFiles(project, [currentPath, releasedPath]);
            const after = JSON.parse(await readFile(currentFilePath, 'utf8'));
            const firstContent = await readFile(currentFilePath, 'utf8');
            const second = await compactActivityFiles(project, [currentPath]);

            expect(first.map(({ changed, path, status }) => ({ changed, path, status }))).toEqual([
                { changed: true, path: currentPath, status: 'valid' },
                { changed: false, path: releasedPath, status: 'valid' },
            ]);
            expect(after).toEqual({
                ...before,
                conversations: [{
                    ...before.conversations[0],
                    entries: [{
                        ...before.conversations[0].entries[0],
                        content: boundedAgentResult(oversizedResult),
                        output: undefined,
                    }, {
                        ...before.conversations[0].entries[1],
                        output: boundedAgentResult(oversizedResult),
                    }],
                }],
            });
            expect(second[0]).toMatchObject({ changed: false, path: currentPath, status: 'valid' });
            expect(await readFile(currentFilePath, 'utf8')).toBe(firstContent);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('reports malformed and future activity without partially rewriting either file', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-activity-compaction-invalid-'));
        const project = { branch: 'main', rootPath };
        const malformedPath = join('design', 'activity', 'card__malformed.json');
        const futurePath = join('design', 'activity', 'card__future.json');
        const malformedContent = '{broken';
        const futureContent = JSON.stringify({ version: 6 });
        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design', 'activity'), { recursive: true });
            await writeFile(join(rootPath, malformedPath), malformedContent);
            await writeFile(join(rootPath, futurePath), futureContent);

            const results = await compactActivityFiles(project, [malformedPath, futurePath]);

            expect(results.map(({ changed, status }) => ({ changed, status }))).toEqual([
                { changed: true, status: 'repaired' },
                { changed: false, status: 'future' },
            ]);
            expect(await readFile(join(rootPath, malformedPath), 'utf8')).toBe(malformedContent);
            expect(await readFile(join(rootPath, futurePath), 'utf8')).toBe(futureContent);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
