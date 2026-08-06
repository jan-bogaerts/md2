import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { runGit } = require('./git_commands');
const { WorktreeService } = require('./worktree_service');

async function createRepository() {
    const folderPath = await mkdtemp(join(tmpdir(), 'md2-worktree-sync-'));
    const primaryPath = join(folderPath, 'primary');
    const linkedPath = join(folderPath, 'linked');
    await mkdir(primaryPath);
    await runGit(primaryPath, ['init', '-b', 'main']);
    await runGit(primaryPath, ['config', 'user.email', 'test@example.com']);
    await runGit(primaryPath, ['config', 'user.name', 'MD2 Test']);
    await writeFile(join(primaryPath, 'base.txt'), 'base\n');
    await runGit(primaryPath, ['add', 'base.txt']);
    await runGit(primaryPath, ['commit', '-m', 'Initial commit']);
    await runGit(primaryPath, ['worktree', 'add', '-b', 'feature', linkedPath, 'main']);

    return { folderPath, linkedPath, primaryPath };
}

async function commitLinkedChange(linkedPath) {
    await writeFile(join(linkedPath, 'feature.txt'), 'feature\n');
    await runGit(linkedPath, ['add', 'feature.txt']);
    await runGit(linkedPath, ['commit', '-m', 'Feature change']);
}

function createService() {
    return new WorktreeService({
        clearTimeout: () => {},
        runGit,
        setTimeout: () => 1,
    });
}

describe('WorktreeService integration synchronization', () => {
    it('moves linked branch to squash commit before publishing integration state', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        const states = [];
        service.subscribe((state) => states.push(state));

        try {
            await service.startProject(project);
            await commitLinkedChange(repository.linkedPath);
            await service.refreshLocal();

            const integration = await service.integrate(project, 1);
            const linkedCommit = await runGit(repository.linkedPath, ['rev-parse', 'HEAD']);
            const linkedBranch = await runGit(repository.linkedPath, ['branch', '--show-current']);
            const finalRecord = states.at(-1).records[0];

            expect(linkedBranch).toBe('feature');
            expect(linkedCommit).toBe(integration.commit);
            expect(finalRecord.branch).toBe('feature');
            expect(finalRecord.status.baseAhead).toBe(0);
            expect(finalRecord.status.baseBehind).toBe(0);
            await expect(service.integrate(project, 1)).rejects.toThrow('Linked worktree has no changes to integrate');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('moves linked branch to project head and republishes after later activity commit', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        const states = [];
        service.subscribe((state) => states.push(state));

        try {
            await service.startProject(project);
            await commitLinkedChange(repository.linkedPath);
            await service.refreshLocal();
            await service.integrate(project, 1);
            await writeFile(join(repository.primaryPath, 'activity.json'), '{}\n');
            await runGit(repository.primaryPath, ['add', 'activity.json']);
            await runGit(repository.primaryPath, ['commit', '-m', 'Record activity']);

            await service.synchronize(project, 1);

            const projectCommit = await runGit(repository.primaryPath, ['rev-parse', 'HEAD']);
            const linkedCommit = await runGit(repository.linkedPath, ['rev-parse', 'HEAD']);
            const finalRecord = states.at(-1).records[0];
            expect(linkedCommit).toBe(projectCommit);
            expect(finalRecord.status.baseAhead).toBe(0);
            expect(finalRecord.status.baseBehind).toBe(0);
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('preserves linked branch when later synchronization finds uncommitted changes', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();

        try {
            await service.startProject(project);
            await commitLinkedChange(repository.linkedPath);
            await service.refreshLocal();
            await service.integrate(project, 1);
            await writeFile(join(repository.primaryPath, 'activity.json'), '{}\n');
            await runGit(repository.primaryPath, ['add', 'activity.json']);
            await runGit(repository.primaryPath, ['commit', '-m', 'Record activity']);
            await writeFile(join(repository.linkedPath, 'uncommitted.txt'), 'keep\n');

            await expect(service.synchronize(project, 1)).rejects.toThrow('Linked worktree has uncommitted changes');

            expect(await runGit(repository.linkedPath, ['branch', '--show-current'])).toBe('feature');
            expect(await runGit(repository.linkedPath, ['status', '--porcelain'])).toContain('uncommitted.txt');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});

describe('WorktreeService local branch deletion', () => {
    it('force-deletes a valid local branch after its worktree is parked', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();

        try {
            await service.startProject(project);
            await service.park(project, 1);
            await service.deleteBranch(project, 'feature');

            expect(await runGit(repository.primaryPath, ['branch', '--list', 'feature'])).toBe('');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('rejects project, parking, and checked-out branches', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();

        try {
            await service.startProject(project);
            const parkingBranch = service.getRecords(project)[0].parkingBranch;

            await expect(service.deleteBranch(project, 'main')).rejects.toThrow('Project branch cannot be deleted');
            await expect(service.deleteBranch(project, parkingBranch)).rejects.toThrow('Parking branch cannot be deleted');
            await expect(service.deleteBranch(project, 'feature')).rejects.toThrow('Branch is checked out by a worktree');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('rejects invalid and missing local branch names', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();

        try {
            await service.startProject(project);

            await expect(service.deleteBranch(project, 'bad name')).rejects.toThrow();
            await expect(service.deleteBranch(project, 'missing')).rejects.toThrow();
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});
