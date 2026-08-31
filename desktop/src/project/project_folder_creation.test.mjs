import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createMissingProjectFolders, PROJECT_README_TEMPLATE } = require('./project_folder_creation');

describe('createMissingProjectFolders', () => {
    it('creates each missing folder once and leaves an existing folder untouched', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-folders-'));

        try {
            await mkdir(join(rootPath, 'design', 'actions'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'actions', 'custom.json'), '{"id":"custom"}');

            await expect(createMissingProjectFolders(rootPath, [
                'design/active',
                'design/actions',
                'design/history',
                'design/active',
            ])).resolves.toEqual(['design/active', 'design/history']);

            await expect(readFile(join(rootPath, 'design', 'active', 'README.md'), 'utf8'))
                .resolves.toBe(PROJECT_README_TEMPLATE);
            await expect(readFile(join(rootPath, 'design', 'history', 'README.md'), 'utf8'))
                .resolves.toBe(PROJECT_README_TEMPLATE);
            await expect(readFile(join(rootPath, 'design', 'actions', 'custom.json'), 'utf8'))
                .resolves.toBe('{"id":"custom"}');
            await expect(readFile(join(rootPath, 'design', 'actions', 'README.md'), 'utf8'))
                .rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
