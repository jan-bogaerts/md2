import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import worktreeModule from './worktree_service.js';
import gitCommands from './git_commands.js';

const execFileAsync = promisify(execFile);
const { WORKTREES_FILE, WorktreeService } = worktreeModule;
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

    return { linkedPath, primaryPath, project: { branch: 'main', id: primaryPath, rootPath: primaryPath } };
}

afterEach(async () => {
    for (const folderPath of temporaryFolders.splice(0)) await rm(folderPath, { force: true, recursive: true });
});

describe('WorktreeService', () => {
    it('validates, saves and restores ordered linked worktrees while updating gitignore', async () => {
        const { linkedPath, primaryPath, project } = await createRepository();
        const service = new WorktreeService({ runGit: gitCommands.runGit });

        const record = await service.validateForAdd(project, linkedPath);
        const saved = await service.save(project, [record.path]);
        const restored = await service.load(project);

        expect(saved).toEqual([{ branch: 'feature', error: null, path: linkedPath, valid: true }]);
        expect(restored).toEqual(saved);
        expect(JSON.parse(await readFile(join(primaryPath, WORKTREES_FILE), 'utf8'))).toEqual([linkedPath]);
        expect(await readFile(join(primaryPath, '.gitignore'), 'utf8')).toContain('/.md2-worktrees.json');
    }, 15000);

    it('keeps stale stored entries and reports them invalid', async () => {
        const { linkedPath, primaryPath, project } = await createRepository();
        const service = new WorktreeService({ runGit: gitCommands.runGit });
        await writeFile(join(primaryPath, WORKTREES_FILE), `${JSON.stringify([linkedPath])}\n`);
        await rm(linkedPath, { force: true, recursive: true });

        const records = await service.load(project);

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({ path: linkedPath, valid: false });
        expect(records[0].error).toMatch(/ENOENT|cannot find|no such file/iu);
    });

    it('rejects detached worktrees and worktrees from another clone', async () => {
        const { linkedPath, primaryPath, project } = await createRepository();
        const service = new WorktreeService({ runGit: gitCommands.runGit });
        await git(linkedPath, 'checkout', '--detach');
        const detached = await service.validateForAdd(project, linkedPath).catch((error) => error);

        const clonePath = join(primaryPath, '..', 'clone');
        await git(primaryPath, 'clone', primaryPath, clonePath);
        const clone = await service.validateForAdd(project, clonePath).catch((error) => error);

        expect(detached).toBeInstanceOf(Error);
        expect(detached.message).toMatch(/detached HEAD/u);
        expect(clone).toBeInstanceOf(Error);
        expect(clone.message).toMatch(/common directory/u);
    });

    it('fails clearly for invalid JSON', async () => {
        const { primaryPath, project } = await createRepository();
        const service = new WorktreeService({ runGit: gitCommands.runGit });
        await writeFile(join(primaryPath, WORKTREES_FILE), '{bad');

        await expect(service.load(project)).rejects.toThrow(/Invalid JSON/u);
    });
});
