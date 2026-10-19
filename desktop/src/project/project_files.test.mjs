import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { GitProcess } = require('../git/git_process');
const { checkoutOwnershipService } = require('../git/checkout_ownership_service');
const { projectOperationCoordinator } = require('./project_operation_coordinator');
const {
    commit,
    commitNow,
    isWatchedProjectPath,
    listRepositoryFiles,
    loadImageFile,
    loadProject,
    loadProjectRoot,
    loadTextFile,
    resolveExistingProjectEntry,
    writeFilesNow,
} = require('./project_files');

function deferred() {
    let resolve;
    const promise = new Promise((complete) => { resolve = complete; });

    return { promise, resolve };
}

describe('project-files', () => {
    it('watches Markdown, JSON, and text files case-insensitively', () => {
        expect(isWatchedProjectPath('README.MD')).toBe(true);
        expect(isWatchedProjectPath('README.TXT')).toBe(true);
        expect(isWatchedProjectPath('action.json')).toBe(true);
        expect(isWatchedProjectPath('image.png')).toBe(false);
    });

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

    it('stages existing commit-only paths as they are on disk and skips missing ones', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'design', 'activity'), { recursive: true });
            await writeFile(join(rootPath, 'design', 'activity', 'card__card-1.json'), '{"version":3}');
            const stagedChanges = Object.assign(new Error('staged changes'), { code: 1 });
            const runGitProcess = vi.spyOn(GitProcess.prototype, 'run').mockImplementation(async function run() {
                if (this.args[0] === 'diff') throw stagedChanges;

                return { stderr: '', stdout: '' };
            });

            await commitNow({
                branch: 'main',
                files: [],
                message: 'Update conversation view state',
                paths: ['design/activity/card__card-1.json', 'design/activity/card__deleted.json'],
            }, { branch: 'main', id: 'local', rootPath });

            const gitCommands = runGitProcess.mock.instances.map(({ args }) => args);
            await expect(readFile(join(rootPath, 'design', 'activity', 'card__card-1.json'), 'utf8')).resolves.toBe('{"version":3}');
            expect(gitCommands).toContainEqual(['add', '--', 'design/activity/card__card-1.json']);
            expect(gitCommands.some((args) => args.includes('design/activity/card__deleted.json'))).toBe(false);
            expect(gitCommands).toContainEqual(['commit', '-m', 'Update conversation view state']);
        } finally {
            vi.restoreAllMocks();
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('writes files and moves without git, and a following commit stages and commits them', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, 'actions'));
            await writeFile(join(rootPath, 'actions', 'new-action.json'), '{"id":"old"}');
            const stagedChanges = Object.assign(new Error('staged changes'), { code: 1 });
            const runGitProcess = vi.spyOn(GitProcess.prototype, 'run').mockImplementation(async function run() {
                if (this.args[0] === 'diff') throw stagedChanges;

                return { stderr: '', stdout: '' };
            });
            const project = { branch: 'main', id: 'local', rootPath };
            const writeRequest = {
                branch: 'main',
                files: [{ content: '# New card', path: 'design/F-001.md' }],
                moves: [{ content: '{"id":"review"}', fromPath: 'actions/new-action.json', toPath: 'actions/review.json' }],
            };

            await writeFilesNow(writeRequest, project);

            await expect(readFile(join(rootPath, 'design', 'F-001.md'), 'utf8')).resolves.toBe('# New card');
            await expect(readFile(join(rootPath, 'actions', 'review.json'), 'utf8')).resolves.toBe('{"id":"review"}');
            await expect(readFile(join(rootPath, 'actions', 'new-action.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
            expect(runGitProcess).not.toHaveBeenCalled();

            const commitRequest = { ...writeRequest, message: 'Save' };
            await commitNow(commitRequest, project);

            const gitArguments = runGitProcess.mock.instances.map(({ args }) => args);
            expect(gitArguments).toContainEqual(['add', '-u', '--', 'actions/new-action.json']);
            expect(gitArguments).toContainEqual(['add', 'actions/review.json']);
            expect(gitArguments).toContainEqual(['add', 'design/F-001.md']);
            expect(gitArguments.some(([command]) => command === 'commit')).toBe(true);
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

    describe('resolveExistingProjectEntry', () => {
        it('resolves existing files and folders to their full paths', async () => {
            const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));
            const project = { branch: 'main', id: 'local', rootPath };

            try {
                await mkdir(join(rootPath, 'design', 'active'), { recursive: true });
                await writeFile(join(rootPath, 'design', 'active', 'card.md'), '# Card');

                await expect(resolveExistingProjectEntry(project, 'design/active/card.md'))
                    .resolves.toBe(join(rootPath, 'design', 'active', 'card.md'));
                await expect(resolveExistingProjectEntry(project, 'design/active'))
                    .resolves.toBe(join(rootPath, 'design', 'active'));
            } finally {
                await rm(rootPath, { force: true, recursive: true });
            }
        });

        it('rejects missing, empty, and root-escaping paths', async () => {
            const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-files-'));
            const project = { branch: 'main', id: 'local', rootPath };

            try {
                await expect(resolveExistingProjectEntry(project, 'design/missing.md'))
                    .rejects.toThrow('Project entry does not exist: design/missing.md');
                await expect(resolveExistingProjectEntry(project, '')).rejects.toThrow('Missing project entry path');
                await expect(resolveExistingProjectEntry(project, '../outside.md'))
                    .rejects.toThrow('Local Git path escapes project root');
            } finally {
                await rm(rootPath, { force: true, recursive: true });
            }
        });
    });

    describe('loadImageFile', () => {
        it('returns base64 content and content type for an absolute image path', async () => {
            const folderPath = await mkdtemp(join(tmpdir(), 'md2-image-file-'));

            try {
                const imagePath = join(folderPath, 'Photo.PNG');
                await writeFile(imagePath, Buffer.from('image-bytes'));

                const asset = await loadImageFile(imagePath);

                expect(asset).toMatchObject({ content: Buffer.from('image-bytes').toString('base64'), contentType: 'image/png', encoding: 'base64' });
            } finally {
                await rm(folderPath, { force: true, recursive: true });
            }
        });

        it('rejects relative paths and unsupported extensions', async () => {
            await expect(loadImageFile('images/photo.png')).rejects.toThrow('Image file path must be absolute');
            await expect(loadImageFile(join(tmpdir(), 'notes.txt'))).rejects.toThrow('Unsupported image file type: .txt');
        });
    });

    it('holds a commit requested during a project-lock operation until that operation resolves', async () => {
        const calls = [];
        const releaseHeld = deferred();
        const acquire = vi.spyOn(checkoutOwnershipService, 'acquire').mockImplementation(() => {
            calls.push('commit-index');
            throw new Error('Index mutation reached');
        });

        try {
            const held = projectOperationCoordinator.run('C:/held-repo', async () => {
                calls.push('held-start');
                await releaseHeld.promise;
                calls.push('held-end');
            });
            const committing = commit({ files: [], message: 'Save' }, { branch: 'main', id: 'local', rootPath: 'C:/held-repo' });
            await new Promise((resolve) => { setTimeout(resolve, 0); });

            expect(calls).toEqual(['held-start']);
            releaseHeld.resolve();
            await held;
            await expect(committing).rejects.toThrow('Index mutation reached');
            expect(calls).toEqual(['held-start', 'held-end', 'commit-index']);
        } finally {
            acquire.mockRestore();
        }
    });
});
