import { promises as fsPromises } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const LARGE_REPOSITORY_FILE_COUNT = 150_000;

const require = createRequire(import.meta.url);
const {
    listRepositoryFiles,
    loadProject,
} = require('./project_files');

describe('project-files', () => {
    it('loads markdown files from the working folder and subfolders', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design', 'history'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root');
            await writeFile(join(rootPath, 'design', 'history', 'F-2-old.md'), '# Old');

            const projectFiles = await loadProject({ branch: 'main', id: 'local', rootPath }, 'design');

            expect(projectFiles.files.map((file) => file.path).sort()).toEqual(['design/F-1-root.md', 'design/history/F-2-old.md']);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('lists repository files as normalized repo-relative paths excluding git internals', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'), { recursive: true });
            await writeFile(join(rootPath, '.git', 'config'), 'git config');
            await mkdir(join(rootPath, 'app', 'src'), { recursive: true });
            await writeFile(join(rootPath, 'app', 'src', 'main.tsx'), 'main');
            await writeFile(join(rootPath, 'README.md'), 'readme');

            const files = await listRepositoryFiles({ branch: 'main', id: 'local', rootPath });

            expect(files).toEqual(['app/src/main.tsx', 'README.md']);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('lists a subtree with more files than the function argument limit', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));
        const largeFolderPath = join(rootPath, 'large');

        try {
            await mkdir(join(rootPath, '.git'));
            const fileEntries = Array.from({ length: LARGE_REPOSITORY_FILE_COUNT }, (_, index) => ({
                isDirectory: () => false,
                isFile: () => true,
                name: `file-${String(index).padStart(6, '0')}.txt`,
            }));
            vi.spyOn(fsPromises, 'readdir').mockImplementation(async (folderPath) => {
                if (folderPath === rootPath) {
                    return [{ isDirectory: () => true, isFile: () => false, name: 'large' }];
                }

                if (folderPath === largeFolderPath) return fileEntries;
                throw new Error(`Unexpected folder path: ${folderPath}`);
            });

            const files = await listRepositoryFiles({ branch: 'main', id: 'local', rootPath });

            expect(files).toHaveLength(LARGE_REPOSITORY_FILE_COUNT);
            expect(files[0]).toBe('large/file-000000.txt');
            expect(files.at(-1)).toBe('large/file-149999.txt');
        } finally {
            vi.restoreAllMocks();
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
