import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worktreeModule from './worktree_service.js';
import gitCommands from './git_commands.js';

const execFileAsync = promisify(execFile);
const { WorktreeService } = worktreeModule;
const temporaryFolders = [];

async function git(rootPath, ...args) {
    const { stdout } = await execFileAsync('git', args, { cwd: rootPath });

    return stdout.trim();
}

async function createRepository(name = 'md2-worktrees-') {
    const parentPath = await mkdtemp(join(tmpdir(), name));
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

function createService(dependencies = {}) {
    return new WorktreeService({ clearTimeout: vi.fn(), runGit: gitCommands.runGit, setTimeout: vi.fn(() => 1), ...dependencies });
}

function createDeferred() {
    let resolve;
    const promise = new Promise((promiseResolve) => { resolve = promiseResolve; });

    return { promise, resolve };
}

afterEach(async () => {
    vi.restoreAllMocks();
    for (const folderPath of temporaryFolders.splice(0)) await rm(folderPath, { force: true, recursive: true });
});

describe('WorktreeService lifecycle', () => {
    it('scans once initially and does not rescan the same project', async () => {
        const { project } = await createRepository();
        const runGit = vi.fn(gitCommands.runGit);
        const service = createService({ runGit });

        await service.startProject(project);
        await service.startProject(project);

        expect(runGit.mock.calls.filter(([, arguments_]) => arguments_[0] === 'worktree')).toHaveLength(1);
    }, 30000);

    it('publishes an immediate snapshot and only publishes semantic changes', async () => {
        const { project } = await createRepository();
        const service = createService();
        const listener = vi.fn();
        service.subscribe(listener);

        await service.startProject(project);
        await service.refreshLocal();

        expect(listener).toHaveBeenCalledTimes(3);
        expect(listener.mock.calls[0][0]).toEqual({ error: null, project: null, records: [] });
        expect(listener.mock.calls[2][0].records).toHaveLength(1);
    }, 30000);

    it('isolates listener failures', async () => {
        const { project } = await createRepository();
        const errorReporter = vi.fn();
        const service = createService({ errorReporter });
        const listener = vi.fn();
        service.subscribe(() => { throw new Error('listener failed'); });
        service.subscribe(listener);

        await service.startProject(project);

        expect(errorReporter).toHaveBeenCalled();
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ records: expect.any(Array) }));
    }, 30000);

    it('discards a stale scan after switching projects', async () => {
        const firstRepository = await createRepository('md2-first-');
        const secondRepository = await createRepository('md2-second-');
        const firstScan = createDeferred();
        const runGit = vi.fn(async (rootPath, arguments_) => {
            if (rootPath === firstRepository.primaryPath && arguments_[0] === 'worktree') return firstScan.promise;
            if (rootPath === secondRepository.primaryPath && arguments_[0] === 'worktree') {
                return `worktree ${secondRepository.primaryPath}\nHEAD abc\nbranch refs/heads/main\n`;
            }
            throw new Error(`Unexpected Git call: ${arguments_.join(' ')}`);
        });
        const service = createService({ runGit });

        const firstStart = service.startProject(firstRepository.project);
        await vi.waitFor(() => expect(runGit).toHaveBeenCalled());
        await service.startProject(secondRepository.project);
        firstScan.resolve(`worktree ${firstRepository.primaryPath}\nHEAD abc\nbranch refs/heads/main\n`);
        await firstStart;

        expect(service.getRecords(secondRepository.project)).toEqual([]);
        expect(() => service.getRecords(firstRepository.project)).toThrow('not the active worktree project');
    }, 30000);

    it('starts the recursive timer only when linked worktrees exist and stops it on close', async () => {
        const { project } = await createRepository();
        const setTimeout = vi.fn(() => 7);
        const clearTimeout = vi.fn();
        const service = createService({ clearTimeout, setTimeout });

        await service.startProject(project);
        service.stopProject();

        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
        expect(clearTimeout).toHaveBeenCalledWith(7);
    }, 30000);

    it('stops the previous project timer when switching projects', async () => {
        const firstRepository = await createRepository('md2-first-timer-');
        const secondRepository = await createRepository('md2-second-timer-');
        const clearTimeout = vi.fn();
        const service = createService({ clearTimeout, setTimeout: vi.fn(() => 7) });
        await service.startProject(firstRepository.project);

        await service.startProject(secondRepository.project);

        expect(clearTimeout).toHaveBeenCalledWith(7);
    }, 30000);

    it('reuses an active refresh so timer and callers cannot overlap scans', async () => {
        const { project } = await createRepository();
        const setTimeout = vi.fn(() => 7);
        const service = createService({ setTimeout });
        await service.startProject(project);
        const records = service.getRecords(project);
        const pendingScan = createDeferred();
        service.readWorktreeRecords = vi.fn(() => pendingScan.promise);
        const timerCallback = setTimeout.mock.calls[0][0];

        timerCallback();
        const concurrentRefresh = service.refreshLocal();

        expect(service.readWorktreeRecords).toHaveBeenCalledOnce();
        pendingScan.resolve(records);
        await concurrentRefresh;
    }, 30000);

    it('retains the last good records and schedules retry after refresh failure', async () => {
        const { project } = await createRepository();
        const runGit = vi.fn(gitCommands.runGit);
        const setTimeout = vi.fn(() => 3);
        const service = createService({ runGit, setTimeout });
        await service.startProject(project);
        setTimeout.mockClear();
        runGit.mockRejectedValueOnce(new Error('scan failed'));

        await service.refreshLocal();

        expect(service.getRecords(project)).toHaveLength(1);
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    }, 30000);
});

describe('WorktreeService operations', () => {
    it('resolves cached records without Git calls', async () => {
        const { project } = await createRepository();
        const runGit = vi.fn(gitCommands.runGit);
        const service = createService({ runGit });
        await service.startProject(project);
        runGit.mockClear();

        const record = service.resolve(project, 1);

        expect(record.branch).toBe('feature');
        expect(runGit).not.toHaveBeenCalled();
    }, 30000);

    it('adds and removes a linked worktree with one final scan per mutation', async () => {
        const { linkedPath, parentPath, project } = await createRepository();
        const secondPath = join(parentPath, 'second');
        await mkdir(secondPath);
        const runGit = vi.fn(gitCommands.runGit);
        const service = createService({ runGit });
        await service.startProject(project);
        runGit.mockClear();

        await service.add(project, secondPath);
        expect(runGit.mock.calls.filter(([, arguments_]) => arguments_[0] === 'worktree' && arguments_[1] === 'list')).toHaveLength(1);
        expect(service.getRecords(project)).toHaveLength(2);
        runGit.mockClear();

        await service.remove(project, linkedPath);
        expect(runGit.mock.calls.filter(([, arguments_]) => arguments_[0] === 'worktree' && arguments_[1] === 'list')).toHaveLength(1);
        expect(service.getRecords(project)).toHaveLength(1);
    }, 30000);

    it('rechecks dirty state before parking and publishes the changed status', async () => {
        const { linkedPath, project } = await createRepository();
        const service = createService();
        const listener = vi.fn();
        service.subscribe(listener);
        await service.startProject(project);
        await writeFile(join(linkedPath, 'dirty.txt'), 'dirty\n');

        await expect(service.park(project, 1)).rejects.toThrow('uncommitted changes');

        expect(service.getRecords(project)[0].status.dirty).toBe(true);
        const dirtyRecord = expect.objectContaining({ status: expect.objectContaining({ dirty: true }) });
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ records: [dirtyRecord] }));
    }, 30000);

    it('rechecks the branch before deciding preparation is already complete', async () => {
        const { linkedPath, project } = await createRepository();
        const service = createService();
        await service.startProject(project);
        await git(linkedPath, 'switch', '-c', 'external-change');

        await service.prepare(project, 1, 'feature');

        expect(await git(linkedPath, 'branch', '--show-current')).toBe('feature');
        expect(service.getRecords(project)[0].branch).toBe('feature');
    }, 30000);

    it('prepares, commits and discards through pushed cached state', async () => {
        const { linkedPath, project } = await createRepository();
        const service = createService();
        await service.startProject(project);
        await service.prepare(project, 1, 'card-title');
        await writeFile(join(linkedPath, 'committed.txt'), 'committed\n');

        await service.commit(project, 1, 'Card changes');
        expect(service.getRecords(project)[0].status).toMatchObject({ ahead: 1, dirty: false });
        await writeFile(join(linkedPath, 'README.md'), 'modified\n');
        await service.discard(project, 1);

        expect(service.getRecords(project)[0].status.dirty).toBe(false);
    }, 30000);

    it('serializes concurrent mutations', async () => {
        const { project } = await createRepository();
        const service = createService();
        await service.startProject(project);
        const firstOperation = createDeferred();
        const execution = [];
        const first = service.enqueueMutation(async () => {
            execution.push('first-start');
            await firstOperation.promise;
            execution.push('first-end');
        });
        const second = service.enqueueMutation(async () => execution.push('second'));
        await vi.waitFor(() => expect(execution).toEqual(['first-start']));

        firstOperation.resolve();
        await Promise.all([first, second]);

        expect(execution).toEqual(['first-start', 'first-end', 'second']);
    }, 30000);
});
