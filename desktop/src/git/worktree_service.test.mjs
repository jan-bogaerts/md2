import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import worktreeModule from './worktree_service.js';
import gitCommands from './git_commands.js';

const execFileAsync = promisify(execFile);
const { WorktreeService } = worktreeModule;
const temporaryFolders = [];

async function git(rootPath, ...args) {
    const { stdout } = await execFileAsync('git', args, { cwd: rootPath });

    return stdout.trim();
}

async function createRepository() {
    const parentPath = await mkdtemp(join(tmpdir(), 'md2-worktrees-'));
    temporaryFolders.push(parentPath);
    const primaryPath = join(parentPath, 'primary');
    const linkedPath = join(parentPath, 'linked');
    await mkdir(primaryPath);
    await git(primaryPath, 'init', '-b', 'main');
    await git(primaryPath, 'config', 'user.email', 'md2@example.test');
    await git(primaryPath, 'config', 'user.name', 'MD2 Test');
    await writeFile(join(primaryPath, 'README.md'), 'primary\n');
    await git(primaryPath, 'add', 'README.md');
    await git(primaryPath, 'commit', '-m', 'Initial');
    await git(primaryPath, 'branch', 'feature');
    await git(primaryPath, 'worktree', 'add', linkedPath, 'feature');

    return { linkedPath, parentPath, primaryPath, project: { branch: 'main', id: primaryPath, rootPath: primaryPath } };
}

afterEach(async () => {
    for (const folderPath of temporaryFolders.splice(0)) await rm(folderPath, { force: true, recursive: true });
});

describe('WorktreeService', () => {
    it('loads linked worktrees directly from Git while excluding the primary worktree', async () => {
        const { linkedPath, project } = await createRepository();
        const service = new WorktreeService({ runGit: gitCommands.runGit });

        await expect(service.load(project)).resolves.toEqual([
            { branch: 'feature', error: null, path: linkedPath, valid: true },
        ]);
    }, 15000);

    it('adds a linked worktree using the selected folder name as the branch', async () => {
        const { parentPath, project } = await createRepository();
        const secondPath = join(parentPath, 'second');
        const service = new WorktreeService({ runGit: gitCommands.runGit });
        await mkdir(secondPath);

        const records = await service.add(project, secondPath);

        expect(records).toContainEqual({ branch: 'second', error: null, path: secondPath, valid: true });
    }, 15000);

    it('removes a clean linked worktree without deleting its branch', async () => {
        const { linkedPath, primaryPath, project } = await createRepository();
        const service = new WorktreeService({ runGit: gitCommands.runGit });

        await expect(service.remove(project, linkedPath)).resolves.toEqual([]);
        await expect(git(primaryPath, 'show-ref', '--verify', 'refs/heads/feature')).resolves.toMatch(/refs\/heads\/feature/u);
    }, 15000);

    it('reports detached worktrees as invalid', async () => {
        const { linkedPath, project } = await createRepository();
        const service = new WorktreeService({ runGit: gitCommands.runGit });
        await git(linkedPath, 'checkout', '--detach');

        const records = await service.load(project);

        expect(records[0]).toMatchObject({ branch: null, error: expect.stringMatching(/detached HEAD/u), valid: false });
    });
});
