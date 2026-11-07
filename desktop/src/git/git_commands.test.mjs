import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NOT_A_GIT_REPOSITORY_ERROR } from '../../../shared/bridge_errors.mjs';

const require = createRequire(import.meta.url);
const { GitProcess } = require('./git_process');
const {
    commitTrackedPathsNow,
    ensureInsideRoot,
    initializeLocalProject,
    isNotGitRepositoryError,
    listIgnoredPaths,
    parseShortStat,
    requireRootPath,
    resolveLocalProject,
    runGit,
} = require('./git_commands');

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

    it('classifies only Git not-repository stderr', () => {
        expect(isNotGitRepositoryError({ stderr: 'fatal: not a git repository (or any of the parent directories): .git\n' })).toBe(true);
        expect(isNotGitRepositoryError({ stderr: 'fatal: detected dubious ownership in repository at C:/repo' })).toBe(false);
        expect(isNotGitRepositoryError(new Error('fatal: not a git repository'))).toBe(false);
    });
});

describe('git-commands ignored paths', () => {
    it('lists only the paths Git ignores', async () => {
        const runGitProcess = vi.spyOn(GitProcess.prototype, 'run').mockResolvedValue({ stderr: '', stdout: 'design/F-1.md\0' });

        try {
            await expect(listIgnoredPaths('C:/repo', ['design/F-1.md', 'README.md'])).resolves.toEqual(new Set(['design/F-1.md']));
            expect(runGitProcess.mock.instances[0].args).toEqual(['check-ignore', '-z', '--', 'design/F-1.md', 'README.md']);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('returns no ignored paths when Git matches none', async () => {
        vi.spyOn(GitProcess.prototype, 'run').mockRejectedValue(Object.assign(new Error('no match'), { code: 1 }));

        try {
            await expect(listIgnoredPaths('C:/repo', ['README.md'])).resolves.toEqual(new Set());
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('commits nothing when every tracked-commit path is ignored', async () => {
        const runGitProcess = vi.spyOn(GitProcess.prototype, 'run').mockResolvedValue({ stderr: '', stdout: 'design/activity/card.json\0' });

        try {
            await expect(commitTrackedPathsNow('C:/repo', ['design/activity/card.json'], 'Update activity')).resolves.toBeNull();
            expect(runGitProcess.mock.instances.map(({ args }) => args[1])).not.toContain('add');
            expect(runGitProcess).toHaveBeenCalledOnce();
        } finally {
            vi.restoreAllMocks();
        }
    });
});

describe('git-commands working directory failures', () => {
    it('names the missing working directory instead of reporting a missing Git executable', async () => {
        const folderPath = await mkdtemp(join(tmpdir(), 'md2-git-missing-cwd-'));
        const missingPath = join(folderPath, 'gone');

        try {
            await expect(runGit(missingPath, ['status', '--porcelain']))
                .rejects.toThrow(/Git working directory does not exist/u);
            await expect(runGit(missingPath, ['status', '--porcelain'])).rejects.toThrow(missingPath);
            await expect(runGit(missingPath, ['status', '--porcelain'])).rejects.not.toThrow(/spawn git ENOENT/u);
        } finally {
            await rm(folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});

describe('local project validation', () => {
    it('marks a selected folder that is not a Git repository with its root path', async () => {
        const folderPath = await mkdtemp(join(tmpdir(), 'md2-not-git-'));

        try {
            await expect(resolveLocalProject(folderPath)).rejects.toMatchObject({
                code: NOT_A_GIT_REPOSITORY_ERROR,
                rootPath: folderPath,
            });
        } finally {
            await rm(folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('initializes the selected folder and resolves the resulting repository', async () => {
        const folderPath = await mkdtemp(join(tmpdir(), 'md2-git-init-'));

        try {
            const project = await initializeLocalProject(folderPath);

            expect(project).toMatchObject({ id: folderPath, rootPath: folderPath });
            expect(project.branch).toEqual(expect.any(String));
            await expect(runGit(folderPath, ['rev-parse', '--is-inside-work-tree'])).resolves.toBe('true');
        } finally {
            await rm(folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});
