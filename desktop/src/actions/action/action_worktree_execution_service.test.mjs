import { describe, expect, it, vi } from 'vitest';
import executionModule from './action_worktree_execution_service.js';

const { ActionWorktreeExecutionService } = executionModule;
const primaryProject = { branch: 'main', id: 'C:/repo', rootPath: 'C:/repo' };
const cardProject = { branch: 'card', error: null, path: 'C:/worktrees/card', valid: true };

function action(needsWorkTree = false, overrides = {}) {
    return { label: 'Implement', needsWorkTree, type: 'command', ...overrides };
}

function result() {
    return { command: 'test', exitCode: 0, stderr: '', stdout: '' };
}

function service() {
    return new ActionWorktreeExecutionService({worktreeService: { resolve: vi.fn(async () => cardProject) }});
}

function runWithCardLock(executionService, context, operation, options = {}) {
    return executionService.runWithCardLock(primaryProject, context, operation, options);
}

describe('ActionWorktreeExecutionService', () => {
    it('runs actions in an assigned card worktree without requiring needsWorkTree', async () => {
        const runner = vi.fn(async () => result());

        const execution = await service().execute(
            primaryProject,
            action(),
            { file: 'design/F-1.md', kind: 'card', worktree: '1' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: 'C:/worktrees/card', rootPath: 'C:/worktrees/card' });
        expect(execution).toMatchObject({ branch: 'card', executionWorktree: 1, repositoryRoot: 'C:/worktrees/card' });
    });

    it('runs actions in the opened project when no worktree is assigned or required', async () => {
        const runner = vi.fn(async () => result());

        const execution = await service().execute(primaryProject, action(), { kind: 'card' }, runner);

        expect(runner).toHaveBeenCalledWith(primaryProject);
        expect(execution).toMatchObject({ branch: 'main', executionWorktree: null, repositoryRoot: 'C:/repo' });
    });

    it('runs needsWorkTree actions in the assigned card worktree', async () => {
        const runner = vi.fn(async () => result());

        const execution = await service().execute(
            primaryProject,
            action(true),
            { file: 'design/F-1.md', kind: 'card', worktree: '1' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: 'C:/worktrees/card', rootPath: 'C:/worktrees/card' });
        expect(execution).toMatchObject({ branch: 'card', executionWorktree: 1, repositoryRoot: 'C:/worktrees/card' });
    });

    it('runs actions in an assigned project worktree without requiring needsWorkTree', async () => {
        const runner = vi.fn(async () => result());

        const execution = await service().execute(
            primaryProject,
            action(),
            { kind: 'project', worktree: '1' },
            runner,
        );

        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: 'C:/worktrees/card', rootPath: 'C:/worktrees/card' });
        expect(execution).toMatchObject({ branch: 'card', executionWorktree: 1, repositoryRoot: 'C:/worktrees/card' });
    });

    it('rejects needsWorkTree actions without an assigned card worktree', async () => {
        const runner = vi.fn(async () => result());

        await expect(service().execute(primaryProject, action(true), { kind: 'card' }, runner))
            .rejects.toThrow(/requires a worktree assignment/u);
        await expect(service().execute(primaryProject, action(true), { kind: 'project' }, runner))
            .rejects.toThrow(/requires a worktree assignment/u);
        await expect(service().execute(primaryProject, action(true), { kind: 'file', worktree: '1' }, runner))
            .rejects.toThrow(/requires card or project context/u);
        expect(runner).not.toHaveBeenCalled();
    });

    it('rejects invalid card worktree assignments when needsWorkTree is not set', async () => {
        const executionService = service();
        const runner = vi.fn(async () => result());

        await expect(executionService.execute(
            primaryProject,
            action(),
            { kind: 'card', worktree: 'nope', worktreeError: 'broken' },
            runner,
        )).rejects.toThrow('broken');

        expect(runner).not.toHaveBeenCalled();
        expect(executionService.worktreeService.resolve).not.toHaveBeenCalled();
    });

    it('rejects needsWorkTree actions when the card reports a worktree error', async () => {
        const runner = vi.fn(async () => result());

        await expect(service().execute(primaryProject, action(true), { kind: 'card', worktree: '1', worktreeError: 'assignment broken' }, runner))
            .rejects.toThrow('assignment broken');
        expect(runner).not.toHaveBeenCalled();
    });

    it('propagates invalid configured worktree entries from the worktree service', async () => {
        const executionService = new ActionWorktreeExecutionService({worktreeService: { resolve: vi.fn(async () => { throw new Error('Configured worktree 2 is invalid: gone'); }) }});
        const runner = vi.fn(async () => result());

        await expect(executionService.execute(primaryProject, action(true), { kind: 'card', worktree: '2' }, runner))
            .rejects.toThrow('Configured worktree 2 is invalid: gone');
        expect(runner).not.toHaveBeenCalled();
    });

    it('releases the card lock when the runner fails', async () => {
        const executionService = service();
        const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' };
        await expect(runWithCardLock(executionService, cardContext, async () => {
            throw new Error('runner boom');
        })).rejects.toThrow('runner boom');

        const runner = vi.fn(async () => result());
        await runWithCardLock(executionService, cardContext, runner);
        expect(runner).toHaveBeenCalledTimes(1);
    });

    it('runs actions without a card concurrently', async () => {
        const executionService = service();
        const firstCompletion = Promise.withResolvers();
        const secondCompletion = Promise.withResolvers();
        const order = [];
        const first = runWithCardLock(executionService, { kind: 'project' }, async () => {
            order.push('first-start');
            await firstCompletion.promise;
            order.push('first-end');
            return result();
        });
        const second = runWithCardLock(executionService, { kind: 'project' }, async () => {
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
        const executionService = service();
        const firstCompletion = Promise.withResolvers();
        const secondCompletion = Promise.withResolvers();
        const order = [];
        const first = runWithCardLock(executionService, {cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card'}, async () => {
            order.push('first-start');
            await firstCompletion.promise;
            order.push('first-end');
            return result();
        });
        const second = runWithCardLock(executionService, {cardInternalId: 'card-2', file: 'design/F-2.md', kind: 'card'}, async () => {
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

    it('serializes actions for the same card across worktrees and reports the wait as queued', async () => {
        const executionService = service();
        const firstCompletion = Promise.withResolvers();
        const order = [];
        const queued = vi.fn();
        const first = runWithCardLock(executionService, {cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card', worktree: '1'}, async () => {
            order.push('first-start');
            await firstCompletion.promise;
            order.push('first-end');
            return result();
        });
        const second = runWithCardLock(executionService, {cardInternalId: 'card-1', file: 'design/F-1-renamed.md', kind: 'card', worktree: '2'}, async () => {
            order.push('second-start');
            order.push('second-end');
            return result();
        }, { onQueued: queued });

        await vi.waitFor(() => expect(order).toEqual(['first-start']));
        expect(queued).toHaveBeenCalledTimes(1);
        firstCompletion.resolve();
        await Promise.all([first, second]);
        expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    });

    it('cancels an action waiting for a card lock', async () => {
        const executionService = service();
        const firstCompletion = Promise.withResolvers();
        const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' };
        const firstRunner = vi.fn(async () => {
            await firstCompletion.promise;
            return result();
        });
        const first = runWithCardLock(executionService, cardContext, firstRunner);
        await vi.waitFor(() => expect(firstRunner).toHaveBeenCalledTimes(1));

        const controller = new AbortController();
        const queued = vi.fn();
        const secondRunner = vi.fn(async () => result());
        const second = runWithCardLock(executionService, cardContext, secondRunner, {
            onQueued: queued,
            signal: controller.signal,
        });
        const cancelled = expect(second).rejects.toThrow('Action cancelled');
        await vi.waitFor(() => expect(queued).toHaveBeenCalledTimes(1));
        controller.abort();
        await cancelled;
        expect(secondRunner).not.toHaveBeenCalled();

        firstCompletion.resolve();
        await first;

        const laterRunner = vi.fn(async () => result());
        await runWithCardLock(executionService, cardContext, laterRunner);
        expect(laterRunner).toHaveBeenCalledTimes(1);
    });
});
