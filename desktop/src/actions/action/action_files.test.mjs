import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { appendActionActivity } = require('../activity/activity_files');
const { loadActionFile, loadActionFiles, loadActionRunHistory, loadAgentConversation } = require('./action_files');
const { conversationActivityReference } = require('../../../../shared/activity_paths.mjs');

const origin = { cardInternalId: 'card-1', kind: 'card' };
const context = { cardInternalId: 'card-1', file: 'design/F-010.md', kind: 'card', type: 'feature' };

function activityRecord(executionId, output = 'done') {
    return {
        commits: [], completedAt: '2026-07-20T10:01:00.000Z', conversationIds: [], executionId,
        history: { completedAt: '2026-07-20T10:01:00.000Z', output, prompt: 'run', status: 'completed' },
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
            await appendActionActivity(project, 'design', origin, activityRecord('execution-1'));

            await expect(loadActionRunHistory(project, { actionId: 'implement', context, projectFolder: 'design' }))
                .resolves.toEqual([{ completedAt: '2026-07-20T10:01:00.000Z', output: 'done', prompt: 'run', status: 'completed' }]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('serializes concurrent card activity appends without dropping records', async () => {
        const rootPath = await createRoot('md2-action-concurrency-');
        const project = { branch: 'main', rootPath };
        try {
            await Promise.all(Array.from({ length: 20 }, (_value, index) => (
                appendActionActivity(project, 'design', origin, activityRecord(`execution-${index}`, `done-${index}`))
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
            await writeFile(join(activityFolder, 'card__card-1.json'), '{"version":1,"origin":{"kind":"card","cardInternalId":"wrong"},"records":[],"conversations":[]}');

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
                conversations: [{ cardInternalId: 'card-1', completedAt: 'done', events: [], id: 'conversation-1', messages: [], providerSessions: [], startedAt: 'start', status: 'completed', title: 'Run' }],
                origin, records: [], version: 1,
            }));

            await expect(loadAgentConversation({ branch: 'main', rootPath }, reference))
                .resolves.toMatchObject({ id: 'conversation-1', path: reference, status: 'completed' });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
