import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    listAgentConversationReferences,
    upsertActivityConversation,
} = require('./activity_files');

describe('project activity conversations', () => {
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
});
