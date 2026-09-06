import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { runGit } = require('./git_commands');
const { MergeConflictService } = require('./merge_conflict_service');
const { WorktreeService, parseWorktreeList } = require('./worktree_service');

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

function createStore() {
    const values = new Map();

    return {
        delete: (key) => values.delete(key),
        get: (key) => values.get(key),
        set: (key, value) => values.set(key, value),
    };
}

function createService(options = {}) {
    const mergeConflictService = options.mergeConflicts
        ? new MergeConflictService({ configProvider: () => ({ mergeConflictResolverCommand: '' }), runGit, store: createStore() })
        : null;

    return new WorktreeService({
        clearTimeout: () => {},
        mergeConflictService,
        runGit,
        setTimeout: () => 1,
    });
}

describe('WorktreeService linked worktree mutations', () => {
    it('creates a linked worktree and prepares its parking branch', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        const addedPath = join(repository.folderPath, 'added');

        try {
            await service.startProject(project);
            await service.add(project, addedPath);

            const addedRecord = service.getRecords(project).find((record) => record.path === addedPath);
            expect(addedRecord).toBeDefined();
            expect(await runGit(addedPath, ['branch', '--show-current'])).toBe(addedRecord.parkingBranch);
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('removes a clean checkout without deleting its branch', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();

        try {
            await service.startProject(project);
            await service.remove(project, repository.linkedPath);

            expect(service.getRecords(project)).toEqual([]);
            expect(await runGit(repository.primaryPath, ['branch', '--list', 'feature'])).toBe('feature');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('rejects adding a folder that already holds files, leaving Git untouched', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        const occupiedPath = join(repository.folderPath, 'occupied');
        await mkdir(occupiedPath);
        await writeFile(join(occupiedPath, 'existing.txt'), 'existing\n');

        try {
            await service.startProject(project);

            await expect(service.add(project, occupiedPath)).rejects.toThrow(/Linked worktree folder is not empty/u);
            expect(await listWorktreePaths(repository.primaryPath)).not.toContain(occupiedPath);
            expect(await readdir(occupiedPath)).toEqual(['existing.txt']);
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});

async function listWorktreePaths(primaryPath) {
    const output = await runGit(primaryPath, ['worktree', 'list', '--porcelain']);

    return parseWorktreeList(output).map((worktree) => resolve(worktree.path));
}

async function folderExists(folderPath) {
    try {
        return (await stat(folderPath)).isDirectory();
    } catch {
        return false;
    }
}

describe('WorktreeService removal modes', () => {
    it('force-removes a dirty checkout and deletes its folder in folder mode', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        await writeFile(join(repository.linkedPath, 'untracked.txt'), 'agent output\n');
        await writeFile(join(repository.linkedPath, 'base.txt'), 'modified\n');

        try {
            await service.startProject(project);
            await service.remove(project, repository.linkedPath, 'folder');

            expect(service.getRecords(project)).toEqual([]);
            expect(await listWorktreePaths(repository.primaryPath)).not.toContain(repository.linkedPath);
            expect(await folderExists(repository.linkedPath)).toBe(false);
            expect(await runGit(repository.primaryPath, ['branch', '--list', 'feature'])).toBe('feature');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('leaves an empty folder behind in files mode', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        await writeFile(join(repository.linkedPath, 'untracked.txt'), 'agent output\n');

        try {
            await service.startProject(project);
            await service.remove(project, repository.linkedPath, 'files');

            expect(await listWorktreePaths(repository.primaryPath)).not.toContain(repository.linkedPath);
            expect(await folderExists(repository.linkedPath)).toBe(true);
            expect(await readdir(repository.linkedPath)).toEqual([]);
            expect(await runGit(repository.primaryPath, ['branch', '--list', 'feature'])).toBe('feature');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('keeps folder and files in unregister mode and leaves no dangling .git link', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        await writeFile(join(repository.linkedPath, 'untracked.txt'), 'agent output\n');

        try {
            await service.startProject(project);
            await service.remove(project, repository.linkedPath, 'unregister');

            expect(await listWorktreePaths(repository.primaryPath)).not.toContain(repository.linkedPath);
            expect((await readdir(repository.linkedPath)).sort()).toEqual(['base.txt', 'untracked.txt']);
            expect(await folderExists(join(repository.linkedPath, '.git'))).toBe(false);
            await expect(stat(join(repository.linkedPath, '.git'))).rejects.toThrow();
            expect(await runGit(repository.primaryPath, ['branch', '--list', 'feature'])).toBe('feature');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('prunes the stale registration of a worktree folder that is gone from disk', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();

        try {
            await service.startProject(project);
            await rm(repository.linkedPath, { force: true, recursive: true });
            await service.refreshLocal();

            const [record] = service.getRecords(project);
            expect(record).toMatchObject({ parkingBranch: null, path: repository.linkedPath, valid: false });

            await service.remove(project, repository.linkedPath, 'folder');
            expect(service.getRecords(project)).toEqual([]);
            expect(await listWorktreePaths(repository.primaryPath)).not.toContain(repository.linkedPath);
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});

describe('WorktreeService record reading', () => {
    it('keeps healthy records when another worktree folder is missing', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService();
        const healthyPath = join(repository.folderPath, 'healthy');

        try {
            await service.startProject(project);
            await service.add(project, healthyPath);
            await rm(repository.linkedPath, { force: true, recursive: true });
            await service.refreshLocal();

            const records = service.getRecords(project);
            const broken = records.find(({ path: recordPath }) => recordPath === repository.linkedPath);
            const healthy = records.find(({ path: recordPath }) => recordPath === healthyPath);
            expect(records).toHaveLength(2);
            expect(broken).toMatchObject({ parkingBranch: null, valid: false });
            expect(broken.error).toMatch(/prunable/u);
            expect(healthy).toMatchObject({ error: null, valid: true });
            expect(healthy.parkingBranch).toMatch(/^md2\/parking\//u);
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});

async function commitConflictingChanges(repository) {
    await writeFile(join(repository.linkedPath, 'base.txt'), 'linked\n');
    await runGit(repository.linkedPath, ['add', 'base.txt']);
    await runGit(repository.linkedPath, ['commit', '-m', 'Linked conflict']);
    await writeFile(join(repository.primaryPath, 'base.txt'), 'primary\n');
}

describe('WorktreeService merge conflict lifecycle', () => {
    it('completes when agent already continued explicit rebase', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService({ mergeConflicts: true });

        try {
            await service.startProject(project);
            await commitConflictingChanges(repository);
            await runGit(repository.primaryPath, ['add', 'base.txt']);
            await runGit(repository.primaryPath, ['commit', '-m', 'Primary conflict']);
            await service.refreshLocal();

            const outcome = await service.rebase(project, 1);
            expect(outcome).toMatchObject({ status: 'conflict', session: { conflictedPaths: ['base.txt'], operation: 'rebase', phase: 'rebase' } });
            await expect(service.push(project, 1)).rejects.toThrow('active merge conflict session');

            await writeFile(join(repository.linkedPath, 'base.txt'), 'resolved\n');
            await service.mergeConflictService.markResolved({ path: 'base.txt', sessionId: outcome.session.id });
            await runGit(repository.linkedPath, ['-c', 'core.editor=true', 'rebase', '--continue']);
            await service.mergeConflictService.rescan({ sessionId: outcome.session.id });
            const completed = await service.continueConflict({ sessionId: outcome.session.id });

            expect(completed).toEqual({ status: 'completed' });
            expect(service.mergeConflictService.getSnapshot()).toBeNull();
            expect(await runGit(repository.linkedPath, ['status', '--porcelain'])).toBe('');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('pauses preliminary integration rebase and abort restores both worktrees to checkpoints', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService({ mergeConflicts: true });

        try {
            await service.startProject(project);
            await commitConflictingChanges(repository);
            await service.refreshLocal();
            const linkedCheckpoint = await runGit(repository.linkedPath, ['rev-parse', 'HEAD']);

            const outcome = await service.integrate(project, 1, { cardInternalId: 'card-1', deleteBranch: true, projectFolder: 'design' });
            expect(outcome).toMatchObject({ status: 'conflict', session: { conflictedPaths: ['base.txt'], operation: 'integrate', phase: 'rebase' } });
            const primaryCheckpoint = service.mergeConflictService.getInternalSession().checkpointCommit;

            await service.abortConflict({ sessionId: outcome.session.id });

            expect(service.mergeConflictService.getSnapshot()).toBeNull();
            expect(await runGit(repository.primaryPath, ['rev-parse', 'HEAD'])).toBe(primaryCheckpoint);
            expect(await runGit(repository.linkedPath, ['rev-parse', 'HEAD'])).toBe(linkedCheckpoint);
            expect(await runGit(repository.primaryPath, ['status', '--porcelain'])).toBe('');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('restores checkpoints when agent completed rebase before abort', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService({ mergeConflicts: true });

        try {
            await service.startProject(project);
            await commitConflictingChanges(repository);
            await service.refreshLocal();
            const linkedCheckpoint = await runGit(repository.linkedPath, ['rev-parse', 'HEAD']);
            const outcome = await service.integrate(project, 1, { cardInternalId: 'card-1', projectFolder: 'design' });
            const primaryCheckpoint = service.mergeConflictService.getInternalSession().checkpointCommit;
            await writeFile(join(repository.linkedPath, 'base.txt'), 'resolved\n');
            await service.mergeConflictService.markResolved({ path: 'base.txt', sessionId: outcome.session.id });
            await runGit(repository.linkedPath, ['-c', 'core.editor=true', 'rebase', '--continue']);
            await runGit(repository.primaryPath, ['merge', '--no-ff', '-m', 'Agent integration', 'feature']);
            const rescanned = await service.mergeConflictService.rescan({ sessionId: outcome.session.id });

            expect(rescanned).toMatchObject({ conflictedPaths: [], phase: 'rebase' });
            await service.abortConflict({ sessionId: outcome.session.id });

            expect(service.mergeConflictService.getSnapshot()).toBeNull();
            expect(await runGit(repository.primaryPath, ['rev-parse', 'HEAD'])).toBe(primaryCheckpoint);
            expect(await runGit(repository.linkedPath, ['rev-parse', 'HEAD'])).toBe(linkedCheckpoint);
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('keeps agent-continued integration durable until controlled finalization succeeds', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService({ mergeConflicts: true });

        try {
            await service.startProject(project);
            await commitConflictingChanges(repository);
            await service.refreshLocal();
            const outcome = await service.integrate(project, 1, { cardInternalId: 'card-1', projectFolder: 'design' });
            await writeFile(join(outcome.session.repositoryRoot, 'base.txt'), 'resolved\n');
            await service.mergeConflictService.markResolved({ path: 'base.txt', sessionId: outcome.session.id });
            await runGit(repository.linkedPath, ['-c', 'core.editor=true', 'rebase', '--continue']);
            const rescanned = await service.mergeConflictService.rescan({ sessionId: outcome.session.id });

            expect(rescanned).toMatchObject({ conflictedPaths: [], phase: 'rebase' });
            const completed = await service.continueConflict({ sessionId: outcome.session.id });

            expect(completed).toMatchObject({ branch: 'main', status: 'completed', session: { phase: 'finalize' } });
            expect(service.mergeConflictService.getSnapshot()).toMatchObject({ phase: 'finalize' });
            service.completeConflict({ sessionId: outcome.session.id });
            expect(service.mergeConflictService.getSnapshot()).toBeNull();
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('accepts integration already completed by agent and retains finalization metadata', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService({ mergeConflicts: true });

        try {
            await service.startProject(project);
            await commitConflictingChanges(repository);
            await service.refreshLocal();
            const outcome = await service.integrate(project, 1, { cardInternalId: 'card-1', projectFolder: 'design' });
            await writeFile(join(repository.linkedPath, 'base.txt'), 'resolved\n');
            await service.mergeConflictService.markResolved({ path: 'base.txt', sessionId: outcome.session.id });
            await runGit(repository.linkedPath, ['-c', 'core.editor=true', 'rebase', '--continue']);
            await runGit(repository.primaryPath, ['merge', '--no-ff', '-m', 'Agent integration', 'feature']);
            const agentCommit = await runGit(repository.primaryPath, ['rev-parse', 'HEAD']);
            await service.mergeConflictService.rescan({ sessionId: outcome.session.id });

            const completed = await service.continueConflict({ sessionId: outcome.session.id });

            expect(completed).toMatchObject({ branch: 'main', commit: agentCommit, status: 'completed', session: { phase: 'finalize' } });
            expect(service.mergeConflictService.getSnapshot()).toMatchObject({ phase: 'finalize' });
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);

    it('commits an already-resolved squash conflict without rerunning the squash merge', async () => {
        const repository = await createRepository();
        const project = { branch: 'main', id: repository.primaryPath, rootPath: repository.primaryPath };
        const service = createService({ mergeConflicts: true });

        try {
            await service.startProject(project);
            await commitConflictingChanges(repository);
            await runGit(repository.primaryPath, ['add', 'base.txt']);
            await runGit(repository.primaryPath, ['commit', '-m', 'Primary conflict']);
            await service.refreshLocal();
            const checkpointCommit = await runGit(repository.primaryPath, ['rev-parse', 'HEAD']);
            const worktreeCheckpointCommit = await runGit(repository.linkedPath, ['rev-parse', 'HEAD']);
            await expect(runGit(repository.primaryPath, ['merge', '--squash', 'feature'])).rejects.toThrow();
            const session = await service.mergeConflictService.create({
                checkpointCommit,
                metadata: {},
                operation: 'integrate',
                phase: 'squash',
                projectBranch: project.branch,
                projectId: project.id,
                projectRoot: project.rootPath,
                repositoryRoot: project.rootPath,
                worktree: 1,
                worktreeBranch: 'feature',
                worktreeCheckpointCommit,
                worktreeRoot: repository.linkedPath,
            });
            await writeFile(join(repository.primaryPath, 'base.txt'), 'resolved\n');
            await service.mergeConflictService.markResolved({ path: 'base.txt', sessionId: session.id });

            const completed = await service.continueConflict({ sessionId: session.id });

            expect(completed).toMatchObject({ branch: 'main', status: 'completed', session: { phase: 'finalize' } });
            expect(await runGit(repository.primaryPath, ['show', 'HEAD:base.txt'])).toBe('resolved');
        } finally {
            service.stopProject();
            await rm(repository.folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});

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
