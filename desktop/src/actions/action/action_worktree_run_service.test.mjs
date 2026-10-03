import { describe, expect, it, vi } from 'vitest';
import runModule from './action_worktree_run_service.js';

const { ActionWorktreeRunService } = runModule;
const primaryProject = { branch: 'main', id: 'C:/repo', rootPath: 'C:/repo' };
const cardProject = { branch: 'card', error: null, path: 'C:/worktrees/card', valid: true };

function action(needsWorkTree = false, overrides = {}) {
    return { label: 'Implement', needsWorkTree, type: 'command', ...overrides };
}

function result() {
    return { command: 'test', exitCode: 0, stderr: '', stdout: '' };
}

function service() {
    return new ActionWorktreeRunService({worktreeService: { resolveBranch: vi.fn(async () => ({ index: 1, record: cardProject })) }});
}

function runWithCardLock(runService, context, operation, options = {}) {
    return runService.runWithCardLock(primaryProject, context, operation, options);
}

describe('ActionWorktreeRunService', () => {
    it('routes by the captured branch while reporting the current display number', async () => {
        const runService = service();
        const runner = vi.fn(async () => result());
        const run = await runService.execute(primaryProject, action(true), { kind: 'card', worktree: '6', worktreeBranch: 'card' }, runner);
        expect(runService.worktreeService.resolveBranch).toHaveBeenCalledWith(primaryProject, 'card');
        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: cardProject.path, rootPath: cardProject.path });
        expect(run.runWorktree).toBe(1);
    });
    it('runs actions in an assigned card worktree without requiring needsWorkTree', async () => {
        const runner = vi.fn(async () => result());

        const run = await service().execute(
            primaryProject,
            action(),
            { file: 'design/F-1.md', kind: 'card', worktree: '1', worktreeBranch: 'card' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: 'C:/worktrees/card', rootPath: 'C:/worktrees/card' });
        expect(run).toMatchObject({ branch: 'card', runWorktree: 1, repositoryRoot: 'C:/worktrees/card' });
    });

    it('runs actions in the opened project when no worktree is assigned or required', async () => {
        const runner = vi.fn(async () => result());

        const run = await service().execute(primaryProject, action(), { kind: 'card' }, runner);

        expect(runner).toHaveBeenCalledWith(primaryProject);
        expect(run).toMatchObject({ branch: 'main', runWorktree: null, repositoryRoot: 'C:/repo' });
    });

    it('runs needsWorkTree actions in the assigned card worktree', async () => {
        const runner = vi.fn(async () => result());

        const run = await service().execute(
            primaryProject,
            action(true),
            { file: 'design/F-1.md', kind: 'card', worktree: '1', worktreeBranch: 'card' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: 'C:/worktrees/card', rootPath: 'C:/worktrees/card' });
        expect(run).toMatchObject({ branch: 'card', runWorktree: 1, repositoryRoot: 'C:/worktrees/card' });
    });

    it('runs actions in an assigned project worktree without requiring needsWorkTree', async () => {
        const runner = vi.fn(async () => result());

        const run = await service().execute(
            primaryProject,
            action(),
            { kind: 'project', worktree: '1', worktreeBranch: 'card' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: 'C:/worktrees/card', rootPath: 'C:/worktrees/card' });
        expect(run).toMatchObject({ branch: 'card', runWorktree: 1, repositoryRoot: 'C:/worktrees/card' });
    });

    it('binds merge conflict action to active session repository instead of context paths', async () => {
        const mergeConflictService = {
            requireSession: vi.fn(() => ({
                projectBranch: 'main', projectRoot: 'C:/repo', repositoryRoot: 'C:/worktrees/conflict',
                worktree: 2, worktreeBranch: 'feature/conflict',
            })),
        };
        const worktreeService = { requireConflictCheckout: vi.fn(async () => undefined), resolveBranch: vi.fn() };
        const runService = new ActionWorktreeRunService({ mergeConflictService, worktreeService });
        const runner = vi.fn(async () => result());

        const run = await runService.execute(
            primaryProject,
            action(),
            { conflictFile: '../../outside', conflictSessionId: 'session-1', kind: 'merge-conflict' },
            runner,
        );

        expect(mergeConflictService.requireSession).toHaveBeenCalledWith({ sessionId: 'session-1' });
        expect(worktreeService.requireConflictCheckout).toHaveBeenCalledWith(expect.objectContaining({ worktreeBranch: 'feature/conflict' }));
        expect(runner).toHaveBeenCalledWith({ branch: 'feature/conflict', id: 'C:/worktrees/conflict', rootPath: 'C:/worktrees/conflict' });
        expect(run).toMatchObject({ repositoryRoot: 'C:/worktrees/conflict', runWorktree: 2 });
    });

    it('rejects needsWorkTree actions without an assigned card worktree', async () => {
        const runner = vi.fn(async () => result());

        await expect(service().execute(primaryProject, action(true), { kind: 'card' }, runner))
            .rejects.toThrow(/requires a worktree assignment/u);
        await expect(service().execute(primaryProject, action(true), { kind: 'project' }, runner))
            .rejects.toThrow(/requires a worktree assignment/u);
        await expect(service().execute(primaryProject, action(true), { kind: 'file', worktree: '1', worktreeBranch: 'card' }, runner))
            .rejects.toThrow(/requires card or project context/u);
        expect(runner).not.toHaveBeenCalled();
    });

    it('rejects invalid card worktree assignments when needsWorkTree is not set', async () => {
        const runService = service();
        const runner = vi.fn(async () => result());

        await expect(runService.execute(
            primaryProject,
            action(),
            { kind: 'card', worktree: 'nope', worktreeError: 'broken' },
            runner,
        )).rejects.toThrow('broken');

        expect(runner).not.toHaveBeenCalled();
        expect(runService.worktreeService.resolveBranch).not.toHaveBeenCalled();
    });

    it('rejects needsWorkTree actions when the card reports a worktree error', async () => {
        const runner = vi.fn(async () => result());

        await expect(service().execute(primaryProject, action(true), { kind: 'card', worktree: '1', worktreeBranch: 'card', worktreeError: 'assignment broken' }, runner))
            .rejects.toThrow('assignment broken');
        expect(runner).not.toHaveBeenCalled();
    });

    it('propagates invalid configured worktree entries from the worktree service', async () => {
        const runService = new ActionWorktreeRunService({worktreeService: { resolveBranch: vi.fn(async () => { throw new Error('Configured worktree 2 is invalid: gone'); }) }});
        const runner = vi.fn(async () => result());

        await expect(runService.execute(primaryProject, action(true), { kind: 'card', worktree: '2', worktreeBranch: 'card' }, runner))
            .rejects.toThrow('Configured worktree 2 is invalid: gone');
        expect(runner).not.toHaveBeenCalled();
    });

    it('releases the card claim when the runner fails', async () => {
        const runService = service();
        const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' };
        await expect(runWithCardLock(runService, cardContext, async () => {
            throw new Error('runner boom');
        })).rejects.toThrow('runner boom');

        const runner = vi.fn(async () => result());
        await runWithCardLock(runService, cardContext, runner);
        expect(runner).toHaveBeenCalledTimes(1);
    });

    it.each(['project', 'diagram'])('runs %s actions without a card concurrently', async (kind) => {
        const runService = service();
        const firstCompletion = Promise.withResolvers();
        const secondCompletion = Promise.withResolvers();
        const order = [];
        const first = runWithCardLock(runService, { kind }, async () => {
            order.push('first-start');
            await firstCompletion.promise;
            order.push('first-end');
            return result();
        });
        const second = runWithCardLock(runService, { kind }, async () => {
            order.push('second-start');
            await secondCompletion.promise;
            order.push('second-end');
            return result();
        });

        await vi.waitFor(() => expect(order).toEqual(['first-start', 'second-start']));
        firstCompletion.resolve();
        secondCompletion.resolve();
        await Promise.all([first, second]);
        expect(order).toEqual(['first-start', 'second-start', 'first-end', 'second-end']);
    });

    it('runs actions concurrently for different cards', async () => {
        const runService = service();
        const firstCompletion = Promise.withResolvers();
        const secondCompletion = Promise.withResolvers();
        const order = [];
        const first = runWithCardLock(runService, {cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card'}, async () => {
            order.push('first-start');
            await firstCompletion.promise;
            order.push('first-end');
            return result();
        });
        const second = runWithCardLock(runService, {cardInternalId: 'card-2', file: 'design/F-2.md', kind: 'card'}, async () => {
            order.push('second-start');
            await secondCompletion.promise;
            order.push('second-end');
            return result();
        });

        await vi.waitFor(() => expect(order).toEqual(['first-start', 'second-start']));
        firstCompletion.resolve();
        secondCompletion.resolve();
        await Promise.all([first, second]);
        expect(order).toEqual(['first-start', 'second-start', 'first-end', 'second-end']);
    });

    it('runs actions for the same card across worktrees without queuing', async () => {
        const runService = service();
        const firstCompletion = Promise.withResolvers();
        const order = [];
        const queued = vi.fn();
        const first = runWithCardLock(runService, {cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card', worktree: '1', worktreeBranch: 'card'}, async () => {
            order.push('first-start');
            await firstCompletion.promise;
            order.push('first-end');
            return result();
        });
        const second = runWithCardLock(runService, {cardInternalId: 'card-1', file: 'design/F-1-renamed.md', kind: 'card', worktree: '2', worktreeBranch: 'card'}, async () => {
            order.push('second-start');
            order.push('second-end');
            return result();
        }, { onQueued: queued });

        await vi.waitFor(() => expect(order).toEqual(['first-start', 'second-start', 'second-end']));
        expect(queued).not.toHaveBeenCalled();
        firstCompletion.resolve();
        await Promise.all([first, second]);
        expect(order).toEqual(['first-start', 'second-start', 'second-end', 'first-end']);
    });

    it('keeps the card busy until every concurrent run completes', async () => {
        const runService = service();
        const firstCompletion = Promise.withResolvers();
        const secondCompletion = Promise.withResolvers();
        const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' };
        const first = runWithCardLock(runService, cardContext, async () => {
            await firstCompletion.promise;
            return result();
        });
        const second = runWithCardLock(runService, cardContext, async () => {
            await secondCompletion.promise;
            return result();
        });
        expect(() => runService.acquireReleaseCardLocks(primaryProject, ['card-1']))
            .toThrow('Cannot complete release while a target card has a running action');
        firstCompletion.resolve();
        await first;
        expect(() => runService.acquireReleaseCardLocks(primaryProject, ['card-1']))
            .toThrow('Cannot complete release while a target card has a running action');
        secondCompletion.resolve();
        await second;
        const leaseId = runService.acquireReleaseCardLocks(primaryProject, ['card-1']);
        runService.releaseReleaseCardLocks(leaseId);
    });

    it('rejects a cancelled run before acquiring its card claim', async () => {
        const controller = new AbortController();
        controller.abort();
        const runner = vi.fn(async () => result());
        await expect(runWithCardLock(service(), { cardInternalId: 'card-1', kind: 'card' }, runner, {signal: controller.signal})).rejects.toThrow('Action cancelled');
        expect(runner).not.toHaveBeenCalled();
    });

    it('rejects release locking while a target card action is running', async () => {
        const runService = service();
        const completion = Promise.withResolvers();
        const running = runWithCardLock(runService, { cardInternalId: 'card-1', kind: 'card' }, async () => {
            await completion.promise;
            return result();
        });
        await vi.waitFor(() => {
            expect(() => runService.acquireReleaseCardLocks(primaryProject, ['card-1']))
                .toThrow('Cannot complete release while a target card has a running action');
        });

        completion.resolve();
        await running;
    });

    it('rejects new target-card actions until release locks are released', async () => {
        const runService = service();
        const leaseId = runService.acquireReleaseCardLocks(primaryProject, ['card-1', 'card-2']);

        await expect(runWithCardLock(runService, { cardInternalId: 'card-1', kind: 'card' }, async () => result()))
            .rejects.toThrow('Cannot start action while card release is in progress');

        runService.releaseReleaseCardLocks(leaseId);
        await expect(runWithCardLock(runService, { cardInternalId: 'card-1', kind: 'card' }, async () => result()))
            .resolves.toEqual(result());
    });
});
