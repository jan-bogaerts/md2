import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { GitProcess } = require('../git/git_process');
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

    it('lists tracked and nonignored untracked repository files while excluding deleted paths', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'), { recursive: true });
            const runGitProcess = vi.spyOn(GitProcess.prototype, 'run');
            runGitProcess.mockResolvedValueOnce({
                stderr: '',
                stdout: 'app\\src\\main.tsx\0README.md\0notes.txt\0deleted.md\0',
            });
            runGitProcess.mockResolvedValueOnce({ stderr: '', stdout: 'deleted.md\0' });

            const files = await listRepositoryFiles({ branch: 'main', id: 'local', rootPath });

            expect(runGitProcess.mock.instances[0].args).toEqual([
                'ls-files',
                '--cached',
                '--others',
                '--exclude-standard',
                '--deduplicate',
                '-z',
            ]);
            expect(files).toEqual(['app/src/main.tsx', 'notes.txt', 'README.md']);
        } finally {
            vi.restoreAllMocks();
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
