import { execFile } from 'node:child_process';
import { access, chmod, mkdtemp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const {
    commitTrackedPaths,
    ensureInsideRoot,
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
    it('requires a project root path', () => {
        expect(() => requireRootPath({ id: 'local' })).toThrow('Missing local Git project rootPath');
    });

    it('rejects paths that escape the root', () => {
        expect(() => ensureInsideRoot('C:\\repo', 'C:\\outside\\file.md')).toThrow('Local Git path escapes project root');
    });

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

    it('preserves unrelated staged changes and handles rename paths', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-tracked-rename-'));

        try {
            await initializeRepository(rootPath);
            await writeFile(join(rootPath, 'old.md'), 'renamed');
            await writeFile(join(rootPath, 'unrelated.md'), 'before');
            await runGit(rootPath, ['add', '.']);
            await runGit(rootPath, ['commit', '-m', 'Initial']);
            await writeFile(join(rootPath, 'unrelated.md'), 'staged elsewhere');
            await runGit(rootPath, ['add', 'unrelated.md']);
            await rename(join(rootPath, 'old.md'), join(rootPath, 'new.md'));

            const commit = await commitTrackedPaths(rootPath, ['old.md', 'new.md'], 'Rename file');
            const { stdout: committedFiles } = await execFileAsync('git', ['show', '--no-renames', '--pretty=format:', '--name-only', commit], { cwd: rootPath });
            const { stdout: stagedFiles } = await execFileAsync('git', ['diff', '--cached', '--name-only'], { cwd: rootPath });

            expect(committedFiles.trim().split(/\r?\n/u)).toEqual(['new.md', 'old.md']);
            expect(stagedFiles.trim()).toBe('unrelated.md');
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
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
