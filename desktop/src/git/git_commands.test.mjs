import { execFile } from 'node:child_process';
import { access, chmod, mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const REMOVE_RETRY_COUNT = 5;
const REMOVE_RETRY_DELAY_MS = 100;
const {
    commitTrackedPaths,
    ensureInsideRoot,
    parseShortStat,
    readFileAtCommit,
    requireRootPath,
    resolveCommitMetadata,
    resolveLocalProject,
    runCommand,
} = require('./git_commands');

async function runGit(rootPath, args) {
    await execFileAsync('git', args, { cwd: rootPath });
}

async function initializeRepository(rootPath) {
    await runGit(rootPath, ['init', '-b', 'main']);
    await runGit(rootPath, ['config', 'user.email', 'md2-test@example.com']);
    await runGit(rootPath, ['config', 'user.name', 'MD2 Test']);
}

async function commitFile(rootPath) {
    await writeFile(join(rootPath, 'README.md'), '# Test');
    await runGit(rootPath, ['add', 'README.md']);
    await runGit(rootPath, ['commit', '-m', 'Initial commit']);
}

describe('git-commands', () => {
    it('parses optional singular and plural short-stat categories', () => {
        expect(parseShortStat(' 3 files changed, 12 insertions(+), 1 deletion(-)')).toEqual({
            deletions: 1,
            filesChanged: 3,
            insertions: 12,
        });
        expect(parseShortStat(' 1 file changed')).toEqual({ deletions: 0, filesChanged: 1, insertions: 0 });
        expect(parseShortStat('')).toEqual({ deletions: 0, filesChanged: 0, insertions: 0 });
    });

    it('requires a project root path', () => {
        expect(() => requireRootPath({ id: 'local' })).toThrow('Missing local Git project rootPath');
    });

    it('rejects paths that escape the root', () => {
        expect(() => ensureInsideRoot('C:\\repo', 'C:\\outside\\file.md')).toThrow('Local Git path escapes project root');
    });

    it('reads root-commit files with an empty parent and preserves file content', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-git-historical-'));
        try {
            await initializeRepository(rootPath);
            await writeFile(join(rootPath, 'card.md'), '---\ntitle: Card\n---\n\nBody\n');
            await runGit(rootPath, ['add', 'card.md']);
            await runGit(rootPath, ['commit', '-m', 'Root card']);
            const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: rootPath });
            const commit = stdout.trim();
            const project = { branch: 'main', rootPath };

            await expect(readFileAtCommit(project, { commit, parent: true, path: 'card.md' }))
                .resolves.toEqual({ content: '', exists: false });
            await expect(readFileAtCommit(project, { commit, parent: false, path: 'card.md' }))
                .resolves.toEqual({ content: '---\ntitle: Card\n---\n\nBody\n', exists: true });
            await expect(readFileAtCommit(project, { commit, parent: false, path: 'missing.md' }))
                .resolves.toEqual({ content: '', exists: false });
            await expect(readFileAtCommit(project, { commit, parent: false, path: '../outside.md' }))
                .rejects.toThrow('escapes project root');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    }, 15000);

    it('runs commands from the project root and captures output', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-git-commands-'));

        try {
            await mkdir(join(rootPath, '.git'));

            const result = await runCommand(
                { branch: 'main', id: 'local', rootPath },
                'node -e "process.stdout.write(process.cwd())"',
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(rootPath);
            expect(result.stderr).toBe('');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('normalizes a nested selection to the repository root and current branch', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-git-project-'));
        const nestedPath = join(rootPath, 'nested', 'folder');

        try {
            await initializeRepository(rootPath);
            await mkdir(nestedPath, { recursive: true });

            await expect(resolveLocalProject(nestedPath)).resolves.toEqual({ branch: 'main', id: resolve(rootPath), rootPath: resolve(rootPath) });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('accepts a Git worktree whose .git metadata is a file', async () => {
        const parentPath = await mkdtemp(join(tmpdir(), 'md2-git-worktree-'));
        const repositoryPath = join(parentPath, 'repository');
        const worktreePath = join(parentPath, 'worktree');

        try {
            await mkdir(repositoryPath);
            await initializeRepository(repositoryPath);
            await commitFile(repositoryPath);
            await runGit(repositoryPath, ['worktree', 'add', '-b', 'feature', worktreePath]);

            expect((await stat(join(worktreePath, '.git'))).isFile()).toBe(true);
            await expect(resolveLocalProject(worktreePath)).resolves.toEqual({ branch: 'feature', id: resolve(worktreePath), rootPath: resolve(worktreePath) });
        } finally {
            await rm(parentPath, { force: true, recursive: true });
        }
    });

    it('rejects a folder outside a Git work tree', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-not-git-'));

        try {
            await expect(resolveLocalProject(rootPath)).rejects.toThrow(/not a git repository/iu);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('reports a detached HEAD without inventing a branch', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-detached-git-'));

        try {
            await initializeRepository(rootPath);
            await commitFile(rootPath);
            await runGit(rootPath, ['checkout', '--detach']);

            await expect(resolveLocalProject(rootPath)).resolves.toEqual({
                branch: 'HEAD (detached)',
                id: resolve(rootPath),
                rootPath: resolve(rootPath),
            });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('resolves full commit hash, Git timestamp, and changed paths', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-commit-metadata-'));

        try {
            await initializeRepository(rootPath);
            await commitFile(rootPath);
            const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootPath });

            const metadata = await resolveCommitMetadata(rootPath, stdout.trim());

            expect(metadata.commit).toMatch(/^[0-9a-f]{40}$/u);
            expect(metadata.committedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
            expect(metadata.filePaths).toEqual(['README.md']);
            expect(metadata).toMatchObject({ deletions: 0, filesChanged: 1, insertions: 1 });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('reports binary files without inventing text line changes', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-binary-commit-metadata-'));

        try {
            await initializeRepository(rootPath);
            await writeFile(join(rootPath, 'image.bin'), Buffer.from([0, 1, 2, 3]));
            await runGit(rootPath, ['add', 'image.bin']);
            await runGit(rootPath, ['commit', '-m', 'Binary']);

            const metadata = await resolveCommitMetadata(rootPath, 'HEAD');

            expect(metadata).toMatchObject({ deletions: 0, filesChanged: 1, insertions: 0 });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('creates serialized commits scoped to disjoint tracked paths', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-tracked-commits-'));

        try {
            await initializeRepository(rootPath);
            await writeFile(join(rootPath, 'first.md'), 'first');
            await writeFile(join(rootPath, 'second.md'), 'second');
            await runGit(rootPath, ['add', '.']);
            await runGit(rootPath, ['commit', '-m', 'Initial']);
            await writeFile(join(rootPath, 'first.md'), 'first changed');
            await writeFile(join(rootPath, 'second.md'), 'second changed');

            const [firstCommit, secondCommit] = await Promise.all([
                commitTrackedPaths(rootPath, ['first.md'], 'First action'),
                commitTrackedPaths(rootPath, ['second.md'], 'Second action'),
            ]);
            const { stdout: firstFiles } = await execFileAsync('git', ['show', '--pretty=format:', '--name-only', firstCommit], { cwd: rootPath });
            const { stdout: secondFiles } = await execFileAsync('git', ['show', '--pretty=format:', '--name-only', secondCommit], { cwd: rootPath });

            expect(firstFiles.trim()).toBe('first.md');
            expect(secondFiles.trim()).toBe('second.md');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('returns null when tracked paths have no changes', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-tracked-noop-'));

        try {
            await initializeRepository(rootPath);
            await commitFile(rootPath);

            await expect(commitTrackedPaths(rootPath, ['README.md'], 'No changes')).resolves.toBeNull();
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('treats tracked filenames as literal Git paths', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-tracked-literal-'));

        try {
            await initializeRepository(rootPath);
            await writeFile(join(rootPath, 'file[1].md'), 'literal');
            await writeFile(join(rootPath, 'file1.md'), 'pattern match');
            await runGit(rootPath, ['add', '.']);
            await runGit(rootPath, ['commit', '-m', 'Initial']);
            await writeFile(join(rootPath, 'file[1].md'), 'literal changed');
            await writeFile(join(rootPath, 'file1.md'), 'pattern changed');

            const commit = await commitTrackedPaths(rootPath, ['file[1].md'], 'Literal path');
            const { stdout: committedFiles } = await execFileAsync('git', ['show', '--pretty=format:', '--name-only', commit], { cwd: rootPath });
            const { stdout: remainingFiles } = await execFileAsync('git', ['diff', '--name-only'], { cwd: rootPath });

            expect(committedFiles.trim()).toBe('file[1].md');
            expect(remainingFiles.trim()).toBe('file1.md');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('skips a queued tracked commit cancelled before its queue slot starts', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-tracked-cancel-'));
        const hookStartedPath = join(rootPath, '.git', 'hook-started');
        const releaseHookPath = join(rootPath, '.git', 'release-hook');

        try {
            await initializeRepository(rootPath);
            await writeFile(join(rootPath, 'first.md'), 'first');
            await writeFile(join(rootPath, 'second.md'), 'second');
            await runGit(rootPath, ['add', '.']);
            await runGit(rootPath, ['commit', '-m', 'Initial']);
            await writeFile(join(rootPath, 'first.md'), 'first changed');
            await writeFile(join(rootPath, 'second.md'), 'second changed');
            const hookPath = join(rootPath, '.git', 'hooks', 'pre-commit');
            await writeFile(hookPath, '#!/bin/sh\ntouch .git/hook-started\nwhile [ ! -f .git/release-hook ]; do sleep 0.05; done\n');
            await chmod(hookPath, 0o755);

            const firstCommit = commitTrackedPaths(rootPath, ['first.md'], 'First action');
            await vi.waitFor(() => expect(access(hookStartedPath)).resolves.toBeUndefined());
            const controller = new AbortController();
            const secondCommit = commitTrackedPaths(rootPath, ['second.md'], 'Second action', controller.signal);
            controller.abort();
            await writeFile(releaseHookPath, 'release');

            await expect(firstCommit).resolves.toMatch(/^[0-9a-f]{40}$/u);
            await expect(secondCommit).resolves.toBeNull();
            const { stdout: remainingFiles } = await execFileAsync('git', ['diff', '--name-only'], { cwd: rootPath });
            expect(remainingFiles.trim()).toBe('second.md');
        } finally {
            await rm(rootPath, {
                force: true,
                maxRetries: REMOVE_RETRY_COUNT,
                recursive: true,
                retryDelay: REMOVE_RETRY_DELAY_MS,
            });
        }
    });
});
