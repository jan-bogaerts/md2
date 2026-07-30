import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    appendAndCommitSystemActivity,
    listAgentConversationReferences,
    resolveActivityPath,
    upsertActivityConversation,
} = require('./activity_files');
const { runGit } = require('../git/git_commands');

describe('project activity conversations', () => {
    it('lists conversation references without routing activity JSON through markdown loading', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-activity-'));
        const project = { branch: 'main', rootPath };
        try {
            await mkdir(join(rootPath, '.git'));
            await upsertActivityConversation(project, 'design', { kind: 'project' }, {
                completedAt: '2026-07-21T10:01:00.000Z',
                events: [],
                id: 'conversation-1',
                messages: [],
                providerSessions: [],
                startedAt: '2026-07-21T10:00:00.000Z',
                status: 'completed',
                title: 'Project run',
            });

            await expect(listAgentConversationReferences(project, 'design')).resolves.toEqual([
                'design/activity/project.json#conversation=conversation-1',
            ]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});

describe('system activity', () => {
    it('serializes and commits one system record through the activity writer', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-system-activity-'));
        const project = { branch: 'main', rootPath };
        const origin = { cardInternalId: 'stable-card-id', kind: 'card' };
        const completedAt = '2026-07-30T12:00:00.000Z';
        const record = {
            commits: [{
                branch: 'main',
                commit: 'a'.repeat(40),
                committedAt: completedAt,
                deletions: 1,
                filePaths: ['design/F-1.md'],
                filesChanged: 1,
                insertions: 2,
            }],
            completedAt,
            label: 'Integrate into project',
            origin,
            type: 'system',
        };
        try {
            await runGit(rootPath, ['init', '-b', 'main']);
            await runGit(rootPath, ['config', 'user.email', 'tests@example.com']);
            await runGit(rootPath, ['config', 'user.name', 'MD2 Tests']);

            const result = await appendAndCommitSystemActivity(
                project,
                'design',
                origin,
                record,
                'Record Integrate into project activity',
            );

            const { absolutePath } = resolveActivityPath(rootPath, 'design', origin);
            expect(result.activity.records).toEqual([record]);
            expect(result.commit).toBe(await runGit(rootPath, ['rev-parse', 'HEAD']));
            expect(JSON.parse(await readFile(absolutePath, 'utf8')).records).toEqual([record]);
            expect(await runGit(rootPath, ['show', '--format=', '--name-only', 'HEAD'])).toBe(
                'design/activity/card__stable-card-id.json',
            );
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
