import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { runGit } = require('./git_commands');
const { WorktreeService } = require('./worktree_service');

const roots = [];

async function createRepository() {
    const rootPath = await mkdtemp(join(tmpdir(), 'md2-worktree-integration-'));
    const worktreePath = `${rootPath}-feature`;
    roots.push(rootPath, worktreePath);
    await runGit(rootPath, ['init', '-b', 'main']);
    await runGit(rootPath, ['config', 'user.email', 'tests@example.com']);
    await runGit(rootPath, ['config', 'user.name', 'MD2 Tests']);
    await writeFile(join(rootPath, 'base.txt'), 'base\n');
    await runGit(rootPath, ['add', '-A']);
    await runGit(rootPath, ['commit', '-m', 'Base']);
    await runGit(rootPath, ['worktree', 'add', '-b', 'feature', worktreePath]);

    return { project: { branch: 'main', id: rootPath, rootPath }, rootPath, worktreePath };
}

async function commitFile(rootPath, fileName, content, message) {
    await writeFile(join(rootPath, fileName), content);
    await runGit(rootPath, ['add', '-A']);
    await runGit(rootPath, ['commit', '-m', message]);
}

function createService(runGitOverride = runGit) {
    return new WorktreeService({
        clearTimeout: vi.fn(),
        refreshIntervalMs: 60_000,
        runGit: runGitOverride,
        setTimeout: vi.fn(() => 1),
    });
}

afterEach(async () => {
    for (const rootPath of roots.splice(0).reverse()) await rm(rootPath, { force: true, recursive: true });
});

describe('WorktreeService integration', () => {
    it.each([1, 3])('squashes %i source commits into one project commit', async (sourceCommitCount) => {
        const { project, rootPath, worktreePath } = await createRepository();
        for (let index = 1; index <= sourceCommitCount; index += 1) {
            await commitFile(worktreePath, `feature-${index}.txt`, `change ${index}\n`, `Feature ${index}`);
        }
        const service = createService();
        await service.startProject(project);
        const beforeCount = Number.parseInt(await runGit(rootPath, ['rev-list', '--count', 'main']), 10);

        const result = await service.integrate(project, 1);

        expect(result).toEqual({ branch: 'main', commit: await runGit(rootPath, ['rev-parse', 'HEAD']) });
        expect(Number.parseInt(await runGit(rootPath, ['rev-list', '--count', 'main']), 10)).toBe(beforeCount + 1);
        expect(await runGit(rootPath, ['show', '-s', '--format=%s', 'HEAD'])).toBe('Integrate into project');
        expect((await runGit(rootPath, ['show', '--format=', '--name-only', 'HEAD'])).split(/\r?\n/u)).toHaveLength(sourceCommitCount);
    });

    it('rebases a behind worktree before creating the squash commit', async () => {
        const { project, rootPath, worktreePath } = await createRepository();
        await commitFile(worktreePath, 'feature.txt', 'feature\n', 'Feature');
        await commitFile(rootPath, 'project.txt', 'project\n', 'Project');
        const service = createService();
        await service.startProject(project);

        await service.integrate(project, 1);

        expect(await readFile(join(rootPath, 'feature.txt'), 'utf8')).toBe('feature\n');
        expect(await readFile(join(rootPath, 'project.txt'), 'utf8')).toBe('project\n');
        expect(await runGit(rootPath, ['rev-list', '--count', 'HEAD^..HEAD'])).toBe('1');
        expect((await runGit(rootPath, ['rev-list', '--parents', '-n', '1', 'HEAD'])).split(/\s+/u)).toHaveLength(2);
    });

    it('keeps the primary checkpoint outside the squash commit', async () => {
        const { project, rootPath, worktreePath } = await createRepository();
        await commitFile(worktreePath, 'feature.txt', 'feature\n', 'Feature');
        await writeFile(join(rootPath, 'checkpoint.txt'), 'checkpoint\n');
        const service = createService();
        await service.startProject(project);

        await service.integrate(project, 1);

        expect(await runGit(rootPath, ['show', '--format=', '--name-only', 'HEAD'])).toBe('feature.txt');
        expect(await runGit(rootPath, ['show', '--format=', '--name-only', 'HEAD^'])).toBe('checkpoint.txt');
    });

    it('rejects source commits with no combined change', async () => {
        const { project, rootPath, worktreePath } = await createRepository();
        await commitFile(worktreePath, 'base.txt', 'changed\n', 'Change');
        await commitFile(worktreePath, 'base.txt', 'base\n', 'Revert');
        const service = createService();
        await service.startProject(project);
        const beforeCommit = await runGit(rootPath, ['rev-parse', 'HEAD']);

        await expect(service.integrate(project, 1)).rejects.toThrow('no changes to integrate');

        expect(await runGit(rootPath, ['rev-parse', 'HEAD'])).toBe(beforeCommit);
        expect(await runGit(rootPath, ['status', '--porcelain'])).toBe('');
    });

    it.each(['merge', 'commit'])('restores the post-checkpoint primary checkout after squash %s failure', async (failedCommand) => {
        const { project, rootPath, worktreePath } = await createRepository();
        await commitFile(worktreePath, 'feature.txt', 'feature\n', 'Feature');
        await writeFile(join(rootPath, 'checkpoint.txt'), 'checkpoint\n');
        const runGitOverride = vi.fn(async (folderPath, args) => {
            if (args[0] === failedCommand && (failedCommand !== 'commit' || args[2] === 'Integrate into project')) {
                throw new Error(`${failedCommand} failed`);
            }

            return runGit(folderPath, args);
        });
        const service = createService(runGitOverride);
        await service.startProject(project);

        await expect(service.integrate(project, 1)).rejects.toThrow(`${failedCommand} failed`);

        expect(await runGit(rootPath, ['show', '-s', '--format=%s', 'HEAD'])).toBe('Save project changes before worktree synchronization');
        expect(await readFile(join(rootPath, 'checkpoint.txt'), 'utf8')).toBe('checkpoint\n');
        expect(await runGit(rootPath, ['status', '--porcelain'])).toBe('');
    });
});
