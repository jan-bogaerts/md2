import fs from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const indexCoordinator = require('./git_index_coordinator');
vi.spyOn(indexCoordinator, 'withGitIndexMutations').mockImplementation(mockedIndexMutation);
const { WorktreeService } = require('./worktree_service');
const project = { branch: 'main', id: '/repo', rootPath: '/repo' };
const selected = {
    branch: 'feature/selected', error: null, parkingBranch: 'md2/parking/selected', path: '/selected',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
};
const other = { ...selected, branch: 'feature/other', path: '/other' };

async function mockedIndexMutation(rootPaths, operation) {
    return operation();
}

async function mockedGit(folder, argumentsList) {
    const command = argumentsList.join(' ');
    if (command === 'rev-parse --git-common-dir') return '/repo/.git';
    if (command === 'branch --show-current') return folder === project.rootPath ? project.branch : selected.branch;
    if (command === 'status --porcelain') return '';
    if (command.startsWith('rev-list ')) return '0 0';
    if (command.startsWith('for-each-ref ')) return '';
    throw new Error(`Unexpected Git read in ${folder}: ${command}`);
}

async function unchangedPath(folder) {
    return folder;
}

function createService(records) {
    const service = new WorktreeService({ runGit: vi.fn(mockedGit), setTimeout: () => 1, clearTimeout: () => {} });
    service.project = project;
    service.records = [other, selected];
    vi.spyOn(service, 'readWorktreeRecords').mockResolvedValue(records);

    return service;
}

describe('live worktree resolution', () => {
    beforeEach(() => {
        vi.spyOn(fs.promises, 'realpath').mockImplementation(unchangedPath);
    });

    afterEach(() => {
        vi.mocked(fs.promises.realpath).mockRestore();
        vi.clearAllMocks();
    });

    afterAll(() => vi.restoreAllMocks());

    it('uses the current registration list instead of the stale position', async () => {
        const service = createService([selected, other]);
        const resolution = await service.resolveBranch(project, selected.branch);
        expect(resolution.index).toBe(1);
        expect(resolution.record.path).toBe(selected.path);
        expect(service.readWorktreeRecords).toHaveBeenCalledWith(project);
    });

    it('does not accept a cached checkout that has disappeared from Git', async () => {
        const service = createService([other]);
        await expect(service.resolveBranch(project, selected.branch)).rejects.toThrow(/unavailable/u);
        expect(service.runGit).not.toHaveBeenCalled();
    });

    it('rejects a registered folder replaced with another repository', async () => {
        const service = createService([selected]);
        service.runGit.mockResolvedValueOnce('/repo/.git').mockResolvedValueOnce('/foreign/.git');
        await expect(service.resolveBranch(project, selected.branch)).rejects.toThrow(/another repository/u);
    });

    it('rejects a branch changed after the registration list was read', async () => {
        const service = createService([selected]);
        service.runGit.mockResolvedValueOnce('/repo/.git').mockResolvedValueOnce('/repo/.git').mockResolvedValueOnce('feature/changed');
        await expect(service.resolveBranch(project, selected.branch)).rejects.toThrow(/expected feature\/selected/u);
    });

    it('does not run Git inside a checkout already known to be invalid', async () => {
        const service = createService([{ ...selected, error: 'prunable', valid: false }]);
        await expect(service.resolveBranch(project, selected.branch)).rejects.toThrow(/prunable/u);
        expect(service.runGit).not.toHaveBeenCalled();
    });

    it.each(['prepare', 'commit', 'push', 'pull', 'rebase', 'integrate', 'synchronize', 'discard', 'park', 'readDiffContext'])(
        'blocks %s before any Git command when the assigned branch disappears', async (operation) => {
            const service = createService([other]);
            await expect(service[operation](project, selected.branch, 'message')).rejects.toThrow(/unavailable/u);
            expect(service.runGit).not.toHaveBeenCalled();
        },
    );

    it.each(['prepare', 'pull', 'rebase', 'integrate', 'synchronize', 'park'])(
        'preserves dirty checkout protection for %s', async (operation) => {
            const service = createService([selected]);
            service.runGit.mockImplementation(async (folder, argumentsList) => {
                if (argumentsList.join(' ') === 'status --porcelain') return ' M dirty.txt';

                return mockedGit(folder, argumentsList);
            });
            await expect(service[operation](project, selected.branch, 'message')).rejects.toThrow(/uncommitted changes/u);
            expect(service.runGit.mock.calls.some(([, argumentsList]) => ['add', 'commit', 'reset', 'clean', 'rebase', 'switch', 'pull'].includes(argumentsList[0]))).toBe(false);
        },
    );

    it('commits the selected branch after an earlier worktree is removed', async () => {
        const service = createService([selected]);
        vi.spyOn(service, 'refreshAfterMutation').mockResolvedValue();
        service.runGit.mockImplementation(async (folder, argumentsList) => {
            if (argumentsList.join(' ') === 'status --porcelain') return ' M dirty.txt';
            if (argumentsList[0] === 'add' || argumentsList[0] === 'commit') return '';

            return mockedGit(folder, argumentsList);
        });
        await service.commit(project, selected.branch, 'Selected change');
        expect(indexCoordinator.withGitIndexMutations).toHaveBeenCalledWith([project.rootPath, selected.path], expect.any(Function));
        expect(service.runGit).toHaveBeenCalledWith(selected.path, ['commit', '-m', 'Selected change']);
        expect(service.runGit.mock.calls.some(([folder]) => folder === other.path)).toBe(false);
    });

    it('keeps conflict recovery on its stored checkout after list renumbering', async () => {
        const service = createService([selected, other]);
        const initialSession = { worktree: 2, worktreeBranch: selected.branch, worktreeRoot: selected.path };
        service.mergeConflictService = { getInternalSession: () => initialSession };
        await expect(service.resolveConflictWorktree(project)).resolves.toMatchObject({ path: selected.path });
        const replacedSession = { ...initialSession, worktreeRoot: '/original-selected' };
        service.mergeConflictService = { getInternalSession: () => replacedSession };
        await expect(service.resolveConflictWorktree(project)).rejects.toThrow(/checkout changed/u);
    });

    it('allows detached HEAD only during the captured active rebase', async () => {
        const service = createService([selected]);
        const session = { phase: 'rebase', projectBranch: project.branch, projectRoot: project.rootPath, worktreeBranch: selected.branch, worktreeRoot: selected.path };
        service.mergeConflictService = { isRebaseActive: vi.fn(async () => true) };
        service.runGit.mockImplementation(async (folder, argumentsList) => {
            if (folder === selected.path && argumentsList.join(' ') === 'branch --show-current') return '';

            return mockedGit(folder, argumentsList);
        });
        await expect(service.requireConflictCheckout(session)).resolves.toBeUndefined();
        service.mergeConflictService.isRebaseActive.mockResolvedValue(false);
        await expect(service.requireConflictCheckout(session)).rejects.toThrow(/detached HEAD/u);
    });

    it.each(['continueConflict', 'abortConflict'])('blocks %s when the captured checkout changes branch', async (operation) => {
        const service = createService([selected]);
        const session = { phase: 'rebase', projectBranch: project.branch, projectRoot: project.rootPath, worktreeBranch: 'original', worktreeRoot: selected.path };
        service.mergeConflictService = { requireSession: () => session };
        await expect(service[operation]({ sessionId: 'session' })).rejects.toThrow(/expected original/u);
        expect(service.runGit.mock.calls.some(([, argumentsList]) => ['reset', 'rebase'].includes(argumentsList[0]))).toBe(false);
    });

    it('blocks conflict work when the primary checkout changes branch', async () => {
        const service = createService([selected]);
        const session = {
            projectBranch: project.branch, projectRoot: project.rootPath,
            worktreeBranch: selected.branch, worktreeRoot: selected.path,
        };
        service.runGit.mockImplementation(async (folder, argumentsList) => {
            if (folder === project.rootPath && argumentsList.join(' ') === 'branch --show-current') return 'unexpected-primary';

            return mockedGit(folder, argumentsList);
        });
        await expect(service.requireConflictCheckout(session)).rejects.toThrow(/Primary worktree.*expected main/u);
    });
});
