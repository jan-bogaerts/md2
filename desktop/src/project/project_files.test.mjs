import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { GitProcess } = require('../git/git_process');
const {
    commitNow,
    listRepositoryFiles,
    loadProject,
    loadProjectRoot,
    loadTextFile,
} = require('./project_files');

describe('project-files', () => {
    it('writes move target and stages tracked source deletion when source is already absent', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            const stagedChanges = Object.assign(new Error('staged changes'), { code: 1 });
            const runGitProcess = vi.spyOn(GitProcess.prototype, 'run').mockImplementation(async function run() {
                if (this.args[0] === 'diff') throw stagedChanges;

                return { stderr: '', stdout: '' };
            });

            await commitNow({
                branch: 'main',
                files: [],
                message: 'Rename action',
                moves: [{
                    content: '{"id":"review"}',
                    fromPath: 'actions/new-action.json',
                    toPath: 'actions/review.json',
                }],
            }, { branch: 'main', id: 'local', rootPath });

            await expect(readFile(join(rootPath, 'actions', 'review.json'), 'utf8')).resolves.toBe('{"id":"review"}');
            expect(runGitProcess.mock.instances.map(({ args }) => args)).toContainEqual([
                'add', '-u', '--', 'actions/new-action.json',
            ]);
            expect(runGitProcess.mock.instances.map(({ args }) => args)).toContainEqual(['add', 'actions/review.json']);
        } finally {
            vi.restoreAllMocks();
            await rm(rootPath, { force: true, recursive: true });
        }
    });

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

    it('excludes working-folder root files while retaining nested project files', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design', 'active', 'nested'), { recursive: true });
            await mkdir(join(rootPath, 'design', 'history'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'active', 'F-1-root.md'), '# Root');
            await writeFile(join(rootPath, 'design', 'active', 'nested', 'F-2-nested.md'), '# Nested');
            await writeFile(join(rootPath, 'design', 'history', 'F-3-old.md'), '# Old');

            const project = { branch: 'main', id: 'local', rootPath };
            const rootFiles = await loadProjectRoot(project, 'design/active');
            const backgroundFiles = await loadProject(project, 'design', 'design/active');
            const rootPaths = new Set(rootFiles.files.map((file) => file.path));

            expect(rootFiles.files.map((file) => file.path)).toEqual(['design/active/F-1-root.md']);
            expect(backgroundFiles.files.map((file) => file.path).sort()).toEqual([
                'design/active/nested/F-2-nested.md',
                'design/history/F-3-old.md',
            ]);
            expect(backgroundFiles.files.some((file) => rootPaths.has(file.path))).toBe(false);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('loads a repository text file without requiring a markdown extension', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design', 'activity'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'activity', 'card__card-1.json'), '{"version":2}');

            await expect(loadTextFile(
                { branch: 'main', id: 'local', rootPath },
                'design/activity/card__card-1.json',
            )).resolves.toEqual({ content: '{"version":2}', path: 'design/activity/card__card-1.json' });
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
