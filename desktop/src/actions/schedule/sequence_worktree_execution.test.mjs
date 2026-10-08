import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { SequenceWorktreeExecution } = require('./sequence_worktree_execution');
const { ScheduledCardSequenceEngine } = require('./scheduled_card_sequence_engine');
const { checkoutOwnershipService } = require('../../git/checkout_ownership_service');

const CHECKOUT = 'C:/sequence-test-checkout';
const PROJECT = { branch: 'main', id: 'project', rootPath: 'C:/sequence-test-project' };
const executions = [];

function schedule(progress) {
    return {
        actionCompleted: false, actionId: 'build', cardInternalIds: ['card-1', 'card-2'], currentIndex: 0,
        currentRunId: null, failure: null, id: 'sequence-test', kind: 'sequence', readyState: 'ready', readyStateMet: false,
        status: 'running', worktreeBranch: 'parking', ...(progress ? { branchProgress: progress } : {}),
    };
}

function progress(phase = 'running') {
    return {
        baseCommit: 'base', checkoutPath: CHECKOUT, childBranch: 'sequence-card-1', childBranches: ['sequence-card-1'],
        childCommits: {}, expectedBranch: 'sequence-card-1', integrationCommit: null, phase, sequenceBranch: 'sequence',
        sourceCommit: null, sourceTree: null, targetCommit: 'base', runId: null,
    };
}

/** In-memory Git boundary; no Git processes or filesystem watchers run. */
function harness(initial = schedule()) {
    const state = {
        branch: initial.branchProgress?.expectedBranch ?? 'parking',
        branches: new Map([['main', 'base'], ['parking', 'base'], ['sequence', 'base'], ['sequence-card-1', 'change']]),
        commits: new Map([['base', { parent: null, tree: 'base-tree' }], ['change', { parent: 'base', tree: 'changed-tree' }]]),
        dirty: false, indexTree: null, persisted: initial, cancelled: false, saveFailure: null, watcher: null,
    };
    const worktreeService = {
        branchExists: vi.fn(async (_root, branch) => state.branches.has(branch)),
        getRecords: vi.fn(() => [{ branch: state.branch, path: CHECKOUT, valid: true }]),
        refreshLocal: vi.fn(async () => undefined),
        requireRepositoryMatch: vi.fn(async () => undefined),
        resolveBranch: vi.fn(async () => ({ index: 1, record: { branch: state.branch, path: CHECKOUT, valid: true } })),
        runGit: vi.fn(async (root, argumentsValue) => {
            const [command, ...argumentsRest] = argumentsValue;
            const head = state.branches.get(root === PROJECT.rootPath ? 'main' : state.branch);
            if (command === 'status') return state.dirty ? 'M file' : '';
            if (command === 'check-ref-format' || command === 'merge-base') return '';
            if (command === 'branch' && argumentsRest[0] === '--show-current') return root === PROJECT.rootPath ? PROJECT.branch : state.branch;
            if (command === 'branch' && argumentsRest[0] === '-D') { state.branches.delete(argumentsRest[1]); return ''; }
            if (command === 'switch') {
                if (argumentsRest[0] === '-c') {
                    state.branches.set(argumentsRest[1], state.branches.get(argumentsRest[2]) ?? argumentsRest[2]);
                    state.branch = argumentsRest[1];
                } else state.branch = argumentsRest[0];
                return '';
            }
            if (command === 'rev-parse') {
                const reference = argumentsRest[0];
                if (reference === 'HEAD') return head;
                if (reference === 'HEAD^') return state.commits.get(head).parent;
                if (reference === 'HEAD^{tree}') return state.commits.get(head).tree;
                return state.branches.get(reference) ?? reference;
            }
            if (command === 'merge') {
                state.indexTree = state.commits.get(argumentsRest[1]).tree;
                state.dirty = true;
                return '';
            }
            if (command === 'diff' || command === 'ls-files') return '';
            if (command === 'write-tree') return state.indexTree;
            if (command === 'commit') {
                state.commits.set('integrated', { message: argumentsRest[1], parent: head, tree: state.indexTree });
                state.branches.set(state.branch, 'integrated');
                state.indexTree = null;
                state.dirty = false;
                return '';
            }
            if (command === 'log') return state.commits.get(head).message;
            throw new Error(`Unexpected mocked Git command: ${argumentsValue.join(' ')}`);
        }),
    };
    const localGitService = {
        appendAndCommitSystemActivity: vi.fn(async () => undefined),
        loadFile: vi.fn(async () => ({ content: '---\ninternalId: card-1\nstatus: ready\n---\n' })),
        loadProject: vi.fn(async () => ({ files: [{ content: '---\ninternalId: card-1\nstatus: todo\n---\n', path: 'cards/card-1.md' }] })),
        resolveCommitMetadata: vi.fn(async (root, commit) => ({ commit, committedAt: '2026-10-07T10:00:00Z' })),
        watchProject: vi.fn((_project, callback) => { state.watcher = callback; return vi.fn(); }),
    };
    const saveSequence = vi.fn(async (next) => {
        if (state.saveFailure === next.branchProgress?.phase) throw new Error('disk full');
        state.persisted = next;
        return next;
    });
    const execution = new SequenceWorktreeExecution({
        activeCardsFolder: 'cards', isCancelled: () => state.cancelled, localGitService,
        onError: vi.fn(), onStateChange: vi.fn(), project: PROJECT, projectFolder: 'design', saveSequence, worktreeService,
    });
    executions.push(execution);

    return { execution, localGitService, saveSequence, state, worktreeService };
}

afterEach(() => executions.splice(0).forEach((execution) => execution.stop()));

describe('SequenceWorktreeExecution', () => {
    it('creates sequence from opened branch and children from the latest sequence result', async () => {
        const test = harness();
        const first = await test.execution.prepare(test.state.persisted);
        expect(test.worktreeService.runGit).toHaveBeenCalledWith(CHECKOUT, ['switch', '-c', first.branchProgress.sequenceBranch, 'base']);
        expect(first.branchProgress.childBranches).toEqual([first.branchProgress.childBranch]);
        test.state.branches.set(first.branchProgress.childBranch, 'change');
        const integrated = await test.execution.integrate(first);
        expect(integrated.branchProgress.integrationCommit).toBe('integrated');
        const next = { ...integrated, currentIndex: 1, branchProgress: { ...integrated.branchProgress, childBranch: null, phase: 'sequence-ready' } };
        const prepared = await test.execution.prepare(next);
        expect(test.worktreeService.runGit).toHaveBeenCalledWith(CHECKOUT, ['switch', '-c', prepared.branchProgress.childBranch, 'integrated']);
        expect(() => checkoutOwnershipService.assertAvailable(CHECKOUT)).toThrow('owned by a sequence');
    });

    it('integrates a clean child once and records sequence branch in existing activity format', async () => {
        const test = harness(schedule(progress()));
        const integrated = await test.execution.integrate(test.state.persisted);
        await test.execution.integrate(integrated);
        expect(test.state.branch).toBe('sequence');
        expect(test.localGitService.appendAndCommitSystemActivity).toHaveBeenCalledOnce();
        expect(test.localGitService.appendAndCommitSystemActivity.mock.calls[0][3]).toMatchObject({commits: [{ branch: 'sequence', commit: 'integrated' }], origin: { cardInternalId: 'card-1', kind: 'card' }, type: 'system'});
        expect(test.worktreeService.runGit.mock.calls.filter(([, argumentsValue]) => argumentsValue[0] === 'commit')).toHaveLength(1);
        expect(test.state.branches.has('sequence-card-1')).toBe(true);
    });

    it('stops dirty integration without committing, switching, or discarding files', async () => {
        const test = harness(schedule(progress()));
        test.state.dirty = true;
        await expect(test.execution.integrate(test.state.persisted)).rejects.toThrow('uncommitted changes');
        expect(test.state.branch).toBe('sequence-card-1');
        expect(test.worktreeService.runGit.mock.calls.some(([, argumentsValue]) => ['commit', 'switch', 'reset'].includes(argumentsValue[0]))).toBe(false);
    });

    it('advances unchanged children without empty commit or activity record', async () => {
        const test = harness(schedule(progress()));
        test.state.branches.set('sequence-card-1', 'base');
        const integrated = await test.execution.integrate(test.state.persisted);
        expect(integrated.branchProgress).toMatchObject({ integrationCommit: null, phase: 'recorded' });
        expect(test.localGitService.appendAndCommitSystemActivity).not.toHaveBeenCalled();
        expect(test.worktreeService.runGit.mock.calls.some(([, argumentsValue]) => argumentsValue[0] === 'commit')).toBe(false);
    });

    it('recovers completed branch creation without overwriting an unrelated branch', async () => {
        const test = harness(schedule({ ...progress('preparing-child'), expectedBranch: 'sequence' }));
        test.state.branch = 'sequence-card-1';
        test.state.branches.set('sequence-card-1', 'base');
        const recovered = await test.execution.prepare(test.state.persisted);
        expect(recovered.branchProgress.phase).toBe('child-ready');
        expect(test.worktreeService.runGit.mock.calls.some(([, argumentsValue]) => argumentsValue[0] === 'switch')).toBe(false);
        test.execution.stop();
        test.state.branch = 'sequence';
        await expect(test.execution.prepare(test.state.persisted = schedule({ ...progress('preparing-child'), expectedBranch: 'sequence' })))
            .rejects.toThrow('already exists');
    });

    it.each(['switching-target', 'squashing', 'committing', 'integrated', 'recording', 'recorded'])('recovers %s without repeating completed integration', async (phase) => {
        const test = harness(schedule({
            ...progress(phase), expectedBranch: phase === 'switching-target' ? 'sequence-card-1' : 'sequence',
            sourceCommit: 'change', sourceTree: 'changed-tree', integrationCommit: ['integrated', 'recording', 'recorded'].includes(phase) ? 'integrated' : null,
        }));
        test.state.branch = 'sequence';
        if (['squashing', 'committing'].includes(phase)) { test.state.dirty = true; test.state.indexTree = 'changed-tree'; }
        if (['integrated', 'recording', 'recorded'].includes(phase)) {
            test.state.commits.set('integrated', { message: 'Integrate into project', parent: 'base', tree: 'changed-tree' });
            test.state.branches.set('sequence', 'integrated');
        }
        const recovered = await test.execution.integrate(test.state.persisted);
        expect(recovered.branchProgress.phase).toBe('recorded');
        expect(test.worktreeService.runGit.mock.calls.filter(([, argumentsValue]) => argumentsValue[0] === 'merge')).toHaveLength(phase === 'switching-target' ? 1 : 0);
    });

    it('recognizes commit completed before persistence and never commits twice', async () => {
        const test = harness(schedule({ ...progress('committing'), expectedBranch: 'sequence', sourceCommit: 'change', sourceTree: 'changed-tree' }));
        test.state.commits.set('integrated', { message: 'Integrate into project', parent: 'base', tree: 'changed-tree' });
        test.state.branches.set('sequence', 'integrated');
        const recovered = await test.execution.integrate(test.state.persisted);
        expect(recovered.branchProgress.integrationCommit).toBe('integrated');
        expect(test.worktreeService.runGit.mock.calls.some(([, argumentsValue]) => argumentsValue[0] === 'commit')).toBe(false);
    });

    it('preserves unknown recovery changes and external branch switches', async () => {
        const test = harness(schedule({ ...progress('squashing'), expectedBranch: 'sequence', sourceCommit: 'change', sourceTree: 'changed-tree' }));
        test.state.dirty = true;
        test.state.indexTree = 'unknown';
        await expect(test.execution.integrate(test.state.persisted)).rejects.toThrow('Cannot prove sequence squash index');
        test.state.branch = 'external';
        await expect(test.execution.integrate(test.state.persisted)).rejects.toThrow('expected sequence');
        expect(test.state.dirty).toBe(true);
    });

    it('persists intent before mutation and stops when persistence fails', async () => {
        const test = harness(schedule(progress()));
        test.state.saveFailure = 'switching-target';
        await expect(test.execution.integrate(test.state.persisted)).rejects.toThrow('disk full');
        expect(test.state.branch).toBe('sequence-card-1');
        expect(test.worktreeService.runGit.mock.calls.some(([, argumentsValue]) => argumentsValue[0] === 'switch')).toBe(false);
    });

    it('retries activity after write failure without repeating Git integration', async () => {
        const test = harness(schedule(progress()));
        test.localGitService.appendAndCommitSystemActivity.mockRejectedValueOnce(new Error('history failed'));
        await expect(test.execution.integrate(test.state.persisted)).rejects.toThrow('history failed');
        expect(test.state.persisted.branchProgress.phase).toBe('recording');
        await test.execution.integrate(test.state.persisted);
        expect(test.worktreeService.runGit.mock.calls.filter(([, argumentsValue]) => argumentsValue[0] === 'commit')).toHaveLength(1);
    });

    it('deletes only persisted child branches after success and leaves sequence checked out', async () => {
        const test = harness(schedule({ ...progress('recorded'), expectedBranch: 'sequence', childCommits: { 'sequence-card-1': 'change' } }));
        const completed = await test.execution.finish(test.state.persisted);
        expect(completed.branchProgress.phase).toBe('completed');
        expect(test.state.branch).toBe('sequence');
        expect(test.state.branches.has('sequence-card-1')).toBe(false);
        expect(test.state.branches.has('parking')).toBe(true);
    });

    it('refuses externally changed sequence results before creating the next child', async () => {
        const test = harness(schedule({ ...progress('sequence-ready'), childBranch: null, expectedBranch: 'sequence' }));
        test.state.branches.set('sequence', 'change');
        await expect(test.execution.prepare(test.state.persisted)).rejects.toThrow('changed externally before child preparation');
        expect(test.worktreeService.runGit.mock.calls.some(([, argumentsValue]) => argumentsValue[0] === 'switch')).toBe(false);
    });

    it.each(['finishing', 'completed'])('recovers %s without deleting unrelated or unfinished branches', async (phase) => {
        const test = harness(schedule({ ...progress(phase), expectedBranch: 'sequence', childCommits: { 'sequence-card-1': 'change' } }));
        test.state.branches.delete('sequence-card-1');
        const recovered = await test.execution.finish(test.state.persisted);
        expect(recovered.branchProgress.phase).toBe('completed');
        expect(test.state.branches.has('parking')).toBe(true);
        expect(test.worktreeService.runGit.mock.calls.some(([, argumentsValue]) => argumentsValue[0] === 'branch' && argumentsValue[1] === '-D')).toBe(false);
    });

    it('preserves every child when any completed child ref changed before cleanup', async () => {
        const test = harness(schedule({ ...progress('recorded'), expectedBranch: 'sequence', childCommits: { 'sequence-card-1': 'base' } }));
        await expect(test.execution.finish(test.state.persisted)).rejects.toThrow('changed externally before cleanup');
        expect(test.state.branches.has('sequence-card-1')).toBe(true);
    });

    it('recovers history on a failed sequence without starting another card or deleting branches', async () => {
        const test = harness(schedule(progress()));
        test.localGitService.appendAndCommitSystemActivity.mockRejectedValueOnce(new Error('history failed'));
        await expect(test.execution.integrate(test.state.persisted)).rejects.toThrow('history failed');
        test.state.persisted = { ...test.state.persisted, status: 'failed' };
        const actionRunnerService = { start: vi.fn(), wait: vi.fn() };
        const engine = new ScheduledCardSequenceEngine({
            actionRunnerService, isCurrent: () => true, loadSchedules: async () => [test.state.persisted],
            reportError: vi.fn(), saveSequence: test.saveSequence, worktreeExecution: test.execution,
        });
        await engine.recoverHistory('sequence-test');
        expect(test.state.persisted.branchProgress.phase).toBe('recorded');
        expect(test.state.persisted.status).toBe('failed');
        expect(actionRunnerService.start).not.toHaveBeenCalled();
        expect(test.state.branches.has('sequence-card-1')).toBe(true);
        expect(test.worktreeService.runGit.mock.calls.filter(([, argumentsValue]) => argumentsValue[0] === 'commit')).toHaveLength(1);
    });

    it('cancellation prevents branch mutation and cleanup', async () => {
        const test = harness(schedule(progress()));
        test.state.cancelled = true;
        await expect(test.execution.integrate(test.state.persisted)).rejects.toThrow('cancelled');
        expect(test.state.branches.has('sequence-card-1')).toBe(true);
        expect(test.state.branch).toBe('sequence-card-1');
    });

    it('observes readiness from selected checkout and retains lease during readiness waits', async () => {
        const test = harness(schedule(progress('child-ready')));
        await test.execution.prepare(test.state.persisted);
        await test.state.watcher({ changeKind: 'modified', path: 'cards/card-1.md' });
        expect(test.execution.onStateChange).toHaveBeenCalledWith('card-1', 'ready', CHECKOUT);
        expect(test.localGitService.loadFile).toHaveBeenCalledWith(expect.objectContaining({ rootPath: CHECKOUT }), 'cards/card-1.md');
        expect(() => checkoutOwnershipService.acquire(CHECKOUT, 'other-sequence', true)).toThrow('owned by another run');
    });

    it('integrates before starting next card and ignores primary-checkout ready events', async () => {
        const test = harness(schedule(progress('child-ready')));
        const completions = new Map();
        let runNumber = 0;
        const actionRunnerService = {
            start: vi.fn(async (_request, { runId }) => runId),
            wait: vi.fn((runId) => new Promise((resolve) => completions.set(runId, resolve))),
        };
        const engine = new ScheduledCardSequenceEngine({
            actionRunnerService, allocateRunId: () => `run-${++runNumber}`, isCurrent: () => true,
            loadSchedules: async () => [test.state.persisted],
            resolveCardContext: async (cardInternalId) => ({ cardInternalId, kind: 'card', state: 'todo' }),
            reportError: vi.fn(), saveSequence: test.saveSequence, states: ['todo', 'ready'], worktreeExecution: test.execution,
        });
        await engine.activate('sequence-test');
        await engine.handleCardStateChange('card-1', 'ready');
        expect(test.state.persisted.readyStateMet).toBe(false);
        completions.get('run-1')({ status: 'completed' });
        await vi.waitFor(() => expect(test.state.persisted.actionCompleted).toBe(true));
        expect(actionRunnerService.start).toHaveBeenCalledOnce();
        await engine.handleCardStateChange('card-1', 'ready', CHECKOUT);
        expect(actionRunnerService.start).toHaveBeenCalledTimes(2);
        const integrationCall = test.localGitService.appendAndCommitSystemActivity.mock.invocationCallOrder[0];
        expect(integrationCall).toBeLessThan(actionRunnerService.start.mock.invocationCallOrder[1]);
    });
});
