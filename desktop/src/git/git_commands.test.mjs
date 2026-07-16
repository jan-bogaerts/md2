import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const {
    ensureInsideRoot,
    requireRootPath,
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
});
