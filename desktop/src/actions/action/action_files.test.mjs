import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { appendActionActivity, upsertActivityConversation } = require('../activity/activity_files');
const { loadActionFile, loadActionFiles, loadActionRunHistory, loadAgentConversation } = require('./action_files');
const { conversationActivityReference } = require('../../../../shared/activity_paths.mjs');

const origin = { cardInternalId: 'card-1', kind: 'card' };
const context = { cardInternalId: 'card-1', file: 'design/F-010.md', kind: 'card', type: 'feature' };

function activityRecord(runId, output = 'done') {
    return {
        commits: [], completedAt: '2026-07-20T10:01:00.000Z', conversationIds: [], runId,
        details: { command: 'implement', output, type: 'command' },
        origin, rootActionId: 'implement', rootActionLabel: 'Implement', startedAt: '2026-07-20T10:00:00.000Z',
        status: 'completed',
    };
}

async function createRoot(prefix) {
    const rootPath = await mkdtemp(join(tmpdir(), prefix));
    await mkdir(join(rootPath, '.git'));

    return rootPath;
}

describe('action-files', () => {
    it('loads JSON action files while skipping schedules and non-JSON files', async () => {
        const rootPath = await createRoot('md2-action-files-');
        try {
            await mkdir(join(rootPath, 'actions'));
            await writeFile(join(rootPath, 'actions', 'implement.json'), '{"name":"implement"}');
            await writeFile(join(rootPath, 'actions', '.md2-schedules.json'), '{"schedules":[]}');
            await writeFile(join(rootPath, 'actions', 'notes.md'), '# skip me');

            await expect(loadActionFiles({ branch: 'main', rootPath }, 'actions'))
                .resolves.toEqual([{ content: '{"name":"implement"}', path: 'actions/implement.json' }]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads one current action file by repository-relative path', async () => {
        const rootPath = await createRoot('md2-action-file-');
        try {
            await mkdir(join(rootPath, 'actions'));
            await writeFile(join(rootPath, 'actions', 'implement.json'), '{"id":"implement"}');

            await expect(loadActionFile({ branch: 'main', rootPath }, 'actions/implement.json'))
                .resolves.toEqual({ content: '{"id":"implement"}', path: 'actions/implement.json' });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads root action history from stable card activity', async () => {
        const rootPath = await createRoot('md2-action-history-');
        const project = { branch: 'main', rootPath };
        try {
            await appendActionActivity(project, 'design', origin, activityRecord('run-1'));

            await expect(loadActionRunHistory(project, { actionId: 'implement', context, projectFolder: 'design' }))
                .resolves.toEqual([{
                    command: 'implement', completedAt: '2026-07-20T10:01:00.000Z', output: 'done',
                    startedAt: '2026-07-20T10:00:00.000Z', status: 'completed', type: 'command',
                }]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads history for a diagram and a non-card file context from project activity', async () => {
        const rootPath = await createRoot('md2-project-history-');
        const project = { branch: 'main', rootPath };
        const projectOrigin = { kind: 'project' };
        try {
            await appendActionActivity(project, 'design', projectOrigin, { ...activityRecord('run-project'), origin: projectOrigin });

            const expected = [{
                command: 'implement', completedAt: '2026-07-20T10:01:00.000Z', output: 'done',
                startedAt: '2026-07-20T10:00:00.000Z', status: 'completed', type: 'command',
            }];
            await expect(loadActionRunHistory(project, { actionId: 'implement', context: { kind: 'diagram', type: 'root' }, projectFolder: 'design' }))
                .resolves.toEqual(expected);
            await expect(loadActionRunHistory(project, { actionId: 'implement', context: { file: 'design/notes.md', kind: 'file' }, projectFolder: 'design' }))
                .resolves.toEqual(expected);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads agent metadata and root conversation reference without transcript text', async () => {
        const rootPath = await createRoot('md2-agent-history-');
        const project = { branch: 'main', rootPath };
        const conversation = {
            actionId: 'implement', cardInternalId: 'card-1', cardPath: 'design/F-010.md', completedAt: '2026-07-20T10:01:00.000Z',
            entries: [{ content: 'secret transcript', id: 'message-1', kind: 'message', role: 'assistant', timestamp: '2026-07-20T10:01:00.000Z' }],
            id: 'conversation-1', providerSessions: [], startedAt: '2026-07-20T10:00:00.000Z', status: 'completed', title: 'Implement', viewed: true,
        };
        const record = {
            ...activityRecord('run-agent'),
            conversationIds: ['conversation-1'],
            details: { agent: 'codex', model: 'gpt-5', thinkingLevel: 'high', type: 'agent' },
            rootConversationId: 'conversation-1',
        };
        try {
            await upsertActivityConversation(project, 'design', origin, conversation);
            await appendActionActivity(project, 'design', origin, record);

            const entries = await loadActionRunHistory(project, { actionId: 'implement', context, projectFolder: 'design' });

            expect(entries).toEqual([{
                agent: 'codex', completedAt: '2026-07-20T10:01:00.000Z', model: 'gpt-5', rootConversationId: 'conversation-1',
                startedAt: '2026-07-20T10:00:00.000Z', status: 'completed', thinkingLevel: 'high', type: 'agent',
            }]);
            expect(JSON.stringify(entries)).not.toContain('secret transcript');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('serializes concurrent card activity appends without dropping records', async () => {
        const rootPath = await createRoot('md2-action-concurrency-');
        const project = { branch: 'main', rootPath };
        try {
            await Promise.all(Array.from({ length: 20 }, (_value, index) => (
                appendActionActivity(project, 'design', origin, activityRecord(`run-${index}`, `done-${index}`))
            )));
            const content = await readFile(join(rootPath, 'design', 'activity', 'card__card-1.json'), 'utf8');

            expect(JSON.parse(content).records).toHaveLength(20);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('reports malformed activity instead of returning empty history', async () => {
        const rootPath = await createRoot('md2-action-malformed-');
        const activityFolder = join(rootPath, 'design', 'activity');
        try {
            await mkdir(activityFolder, { recursive: true });
            await writeFile(join(activityFolder, 'card__card-1.json'), '{"actionSettings":{},"conversations":[],"origin":{"kind":"card","cardInternalId":"wrong"},"records":[],"version":4}');

            await expect(loadActionRunHistory({ branch: 'main', rootPath }, { actionId: 'implement', context, projectFolder: 'design' }))
                .rejects.toThrow('origin does not match');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads a terminal conversation embedded in activity by compound reference', async () => {
        const rootPath = await createRoot('md2-action-conversation-');
        const activityFolder = join(rootPath, 'design', 'activity');
        const reference = conversationActivityReference('design/activity/card__card-1.json', 'conversation-1');
        try {
            await mkdir(activityFolder, { recursive: true });
            await writeFile(join(activityFolder, 'card__card-1.json'), JSON.stringify({
                actionSettings: {},
                conversations: [{ cardInternalId: 'card-1', completedAt: 'done', entries: [], id: 'conversation-1', providerSessions: [], startedAt: 'start', status: 'completed', title: 'Run' }],
                origin, records: [], version: 4,
            }));

            await expect(loadAgentConversation({ branch: 'main', rootPath }, reference))
                .resolves.toMatchObject({ id: 'conversation-1', path: reference, status: 'completed' });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
