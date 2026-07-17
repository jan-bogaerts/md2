import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    appendActionRunHistory,
    loadActionFiles,
    loadActionRunHistory,
    loadAgentConversation,
} = require('./action_files');

describe('action-files', () => {
    it('loads json action files from the actions folder', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'actions'));
            await writeFile(join(rootPath, 'actions', 'implement.json'), '{"name":"implement"}');
            await writeFile(join(rootPath, 'actions', '.md2-schedules.json'), '{"schedules":[]}');
            await writeFile(join(rootPath, 'actions', 'notes.md'), '# skip me');

            const files = await loadActionFiles({ branch: 'main', id: 'local', rootPath }, 'actions');

            expect(files).toEqual([{ content: '{"name":"implement"}', path: 'actions/implement.json' }]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('persists and loads action run history for the same action and context', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-files-'));
        const request = {
            actionId: 'implement',
            context: { file: 'design/F-010.md', kind: 'card', type: 'feature' },
            projectFolder: 'design',
        };
        const entry = { completedAt: '2026-07-05T10:00:00.000Z', output: 'done', prompt: 'run', status: 'completed' };

        try {
            await mkdir(join(rootPath, '.git'));
            await appendActionRunHistory({ branch: 'main', id: 'local', rootPath }, request, entry);

            await expect(loadActionRunHistory({ branch: 'main', id: 'local', rootPath }, request)).resolves.toEqual([entry]);
            await expect(stat(join(rootPath, 'design', 'logs', 'history__card__f_010__implement.json'))).resolves.toBeDefined();
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('preserves every concurrent append to one action history file', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-files-'));
        const project = { branch: 'main', id: 'local', rootPath };
        const request = {
            actionId: 'implement',
            context: { file: 'design/F-010.md', kind: 'card', type: 'feature' },
            projectFolder: 'design',
        };
        const entries = Array.from({ length: 20 }, (_value, index) => ({
            completedAt: `2026-07-05T10:00:${String(index).padStart(2, '0')}.000Z`,
            output: `done-${index}`,
            prompt: 'run',
            status: 'completed',
        }));

        try {
            await mkdir(join(rootPath, '.git'));
            await Promise.all(entries.map((entry) => appendActionRunHistory(project, request, entry)));

            await expect(loadActionRunHistory(project, request)).resolves.toEqual(entries);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('rejects malformed conversation messages at the Electron boundary', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await writeFile(join(rootPath, 'conversation.json'), JSON.stringify({
                completedAt: null,
                events: [],
                id: 'conversation-1',
                messages: [{ content: 'missing identity', role: 'user', timestamp: 'now' }],
                startedAt: 'now',
                status: 'running',
            }));

            await expect(loadAgentConversation({ branch: 'main', id: 'local', rootPath }, 'conversation.json'))
                .rejects.toThrow('messages[0].id');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('preserves missing-title metadata at the Electron boundary', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await writeFile(join(rootPath, 'conversation.json'), JSON.stringify({
                completedAt: null,
                events: [],
                id: 'conversation-1',
                messages: [],
                startedAt: 'now',
                status: 'completed',
            }));

            const conversation = await loadAgentConversation({ branch: 'main', id: 'local', rootPath }, 'conversation.json');

            expect(conversation).toMatchObject({ hasExplicitTitle: false, title: 'conversation-1' });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
