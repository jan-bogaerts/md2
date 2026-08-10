import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    MERGE_CONFLICT_SESSION_STORE_KEY,
    MergeConflictService,
    parseConflictedPaths,
    resolveResolverCommand,
} = require('./merge_conflict_service');

function createStore(initial = {}) {
    const values = new Map(Object.entries(initial));

    return {
        delete: vi.fn((key) => values.delete(key)),
        get: vi.fn((key) => values.get(key)),
        set: vi.fn((key, value) => values.set(key, value)),
        value: (key) => values.get(key),
    };
}

function sessionInput() {
    return {
        checkpointCommit: 'primary-before',
        metadata: { deleteBranch: true },
        operation: 'integrate',
        phase: 'squash',
        projectBranch: 'main',
        projectId: 'C:/repo',
        projectRoot: 'C:/repo',
        repositoryRoot: 'C:/repo',
        worktree: 2,
        worktreeBranch: 'feature/conflict',
        worktreeCheckpointCommit: 'worktree-before',
        worktreeRoot: 'C:/worktrees/2',
    };
}

describe('MergeConflictService', () => {
    it('persists exact unique unmerged paths and restores stable public state', async () => {
        const store = createStore();
        const runGit = vi.fn(async () => 'src/one.js\0src/one.js\0src/two.js\0');
        const service = new MergeConflictService({ configProvider: () => ({ mergeConflictResolverCommand: '' }), runGit, store });

        const session = await service.create(sessionInput());

        expect(session).toMatchObject({
            conflictedPaths: ['src/one.js', 'src/two.js'],
            externalResolverConfigured: false,
            operation: 'integrate',
            phase: 'squash',
            repositoryRoot: 'C:/repo',
            worktree: 2,
        });
        expect(store.value(MERGE_CONFLICT_SESSION_STORE_KEY)).toMatchObject({ id: session.id, metadata: { deleteBranch: true } });

        const restored = new MergeConflictService({ configProvider: () => ({ mergeConflictResolverCommand: '' }), runGit, store });
        expect(restored.getSnapshot()).toEqual(session);
        expect(restored.getSnapshot()).toBe(restored.getSnapshot());
    });

    it('returns null and stores nothing when failed Git command has no unmerged entries', async () => {
        const store = createStore();
        const service = new MergeConflictService({
            configProvider: () => ({ mergeConflictResolverCommand: '' }),
            runGit: vi.fn(async () => ''),
            store,
        });

        await expect(service.create(sessionInput())).resolves.toBeNull();
        expect(store.value(MERGE_CONFLICT_SESSION_STORE_KEY)).toBeUndefined();
    });

    it('stages only selected active path then rescans Git', async () => {
        const store = createStore();
        const runGit = vi.fn()
            .mockResolvedValueOnce('src/one.js\0src/two.js\0')
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce('src/two.js\0');
        const service = new MergeConflictService({ configProvider: () => ({ mergeConflictResolverCommand: '' }), runGit, store });
        const session = await service.create(sessionInput());

        const updated = await service.markResolved({ path: 'src/one.js', sessionId: session.id });

        expect(runGit).toHaveBeenNthCalledWith(2, 'C:/repo', ['--literal-pathspecs', 'add', '-A', '--', 'src/one.js']);
        expect(updated.conflictedPaths).toEqual(['src/two.js']);
        await expect(service.markResolved({ path: 'src/missing.js', sessionId: session.id })).rejects.toThrow('not an active merge conflict');
    });

    it('keeps rebase phase during file-only rescan', async () => {
        const store = createStore();
        const runGit = vi.fn()
            .mockResolvedValueOnce('src/one.js\0')
            .mockResolvedValueOnce('');
        const service = new MergeConflictService({ configProvider: () => ({ mergeConflictResolverCommand: '' }), runGit, store });
        const conflictSession = await service.create({ ...sessionInput(), phase: 'rebase' });

        const rescanned = await service.rescan({ sessionId: conflictSession.id });

        expect(rescanned).toMatchObject({ conflictedPaths: [], operation: 'integrate', phase: 'rebase' });
    });

    it('waits for configured resolver exit without changing conflict paths', async () => {
        const store = createStore();
        const child = new EventEmitter();
        const spawnProcess = vi.fn(() => child);
        const service = new MergeConflictService({
            configProvider: () => ({ mergeConflictResolverCommand: 'merge-tool "{{file}}" --repo "{{repository-folder}}"' }),
            runGit: vi.fn(async () => 'src/one.js\0'),
            spawnProcess,
            store,
        });
        const session = await service.create(sessionInput());
        const launch = service.launchResolver({ path: 'src/one.js', sessionId: session.id });
        child.emit('exit', 0);

        await expect(launch).resolves.toBeUndefined();
        expect(spawnProcess).toHaveBeenCalledWith(
            `merge-tool "${path.resolve('C:/repo', 'src/one.js')}" --repo "C:/repo"`,
            { cwd: 'C:/repo', shell: true },
        );
        expect(service.getSnapshot().conflictedPaths).toEqual(['src/one.js']);
    });

    it('rejects same-repository mutations while session remains active', async () => {
        const service = new MergeConflictService({
            configProvider: () => ({ mergeConflictResolverCommand: '' }),
            runGit: vi.fn(async () => 'src/one.js\0'),
            store: createStore(),
        });
        await service.create(sessionInput());

        expect(() => service.assertMutationAllowed('C:/repo')).toThrow('active merge conflict session');
        expect(() => service.assertMutationAllowed('C:/other')).not.toThrow();
    });

    it('persists integration finalization progress without exposing internal metadata', async () => {
        const store = createStore();
        const service = new MergeConflictService({
            configProvider: () => ({ mergeConflictResolverCommand: '' }),
            runGit: vi.fn(async () => 'src/one.js\0'),
            store,
        });
        const session = await service.create(sessionInput());

        expect(service.updateMetadata({ sessionId: session.id }, { activityTracked: true }))
            .toEqual({ activityTracked: true, deleteBranch: true });
        expect(store.value(MERGE_CONFLICT_SESSION_STORE_KEY).metadata)
            .toEqual({ activityTracked: true, deleteBranch: true });
        expect(service.getSnapshot()).not.toHaveProperty('metadata');
    });

    it('clears a stale restored rebase session only after Git confirms no rebase or conflicts', async () => {
        const storedSession = { ...sessionInput(), conflictedPaths: ['src/one.js'], id: 'session-1', operation: 'rebase', phase: 'rebase' };
        const store = createStore({ [MERGE_CONFLICT_SESSION_STORE_KEY]: storedSession });
        const runGit = vi.fn()
            .mockResolvedValueOnce('true')
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce('.git/rebase-merge')
            .mockResolvedValueOnce('.git/rebase-apply');
        const service = new MergeConflictService({ configProvider: () => ({ mergeConflictResolverCommand: '' }), pathExists: () => false, runGit, store });

        await expect(service.verify()).resolves.toBeNull();
        expect(store.value(MERGE_CONFLICT_SESSION_STORE_KEY)).toBeUndefined();
    });

    it('restores externally completed integration rebase at squash phase', async () => {
        const storedSession = { ...sessionInput(), conflictedPaths: ['src/one.js'], id: 'session-1', phase: 'rebase' };
        const store = createStore({ [MERGE_CONFLICT_SESSION_STORE_KEY]: storedSession });
        const runGit = vi.fn()
            .mockResolvedValueOnce('true')
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce('.git/rebase-merge')
            .mockResolvedValueOnce('.git/rebase-apply');
        const service = new MergeConflictService({ configProvider: () => ({ mergeConflictResolverCommand: '' }), pathExists: () => false, runGit, store });

        await expect(service.verify()).resolves.toMatchObject({ conflictedPaths: [], phase: 'squash' });
        expect(store.value(MERGE_CONFLICT_SESSION_STORE_KEY)).toMatchObject({ phase: 'squash', repositoryRoot: 'C:/repo' });
    });
});

describe('merge conflict helpers', () => {
    it('parses unique null-separated paths', () => {
        expect(parseConflictedPaths('one\0two\0one\0')).toEqual(['one', 'two']);
    });

    it('requires file placeholder in configured resolver command', () => {
        expect(() => resolveResolverCommand('merge-tool', 'C:/repo', 'one.js')).toThrow('requires {{file}} placeholder');
        expect(() => resolveResolverCommand('', 'C:/repo', 'one.js')).toThrow('not configured');
    });
});
