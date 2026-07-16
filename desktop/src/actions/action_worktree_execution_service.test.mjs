import { describe, expect, it, vi } from 'vitest';
import executionModule from './action_worktree_execution_service.js';

const { ActionWorktreeExecutionService } = executionModule;
const primaryProject = { branch: 'main', id: 'C:/repo', rootPath: 'C:/repo' };
const cardProject = { branch: 'card', error: null, path: 'C:/worktrees/card', valid: true };

function action(needsWorkTree = false) {
    return { name: 'implement', needsWorkTree };
}

function result() {
    return { command: 'test', exitCode: 0, stderr: '', stdout: '' };
}

function service() {
    return new ActionWorktreeExecutionService({worktreeService: { resolve: vi.fn(async () => cardProject) }});
}

describe('ActionWorktreeExecutionService', () => {
    it('runs actions in the opened project when no worktree is requested', async () => {
        const runner = vi.fn(async () => result());

        const execution = await service().execute(
            primaryProject,
            action(),
            { file: 'design/F-1.md', kind: 'card', worktree: '1' },
            runner,
        );

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

    it('rejects needsWorkTree actions without an assigned card worktree', async () => {
        const runner = vi.fn(async () => result());

        await expect(service().execute(primaryProject, action(true), { kind: 'card' }, runner))
            .rejects.toThrow(/requires a card worktree assignment/u);
        await expect(service().execute(primaryProject, action(true), { kind: 'file', worktree: '1' }, runner))
            .rejects.toThrow(/requires card context/u);
        expect(runner).not.toHaveBeenCalled();
    });

    it('ignores card worktree problems for actions that do not need a worktree', async () => {
        const executionService = service();
        const runner = vi.fn(async () => result());

        await executionService.execute(primaryProject, action(), { kind: 'card', worktree: 'nope', worktreeError: 'broken' }, runner);

        expect(runner).toHaveBeenCalledWith(primaryProject);
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

    it('releases the repository lock when the runner fails', async () => {
        const executionService = service();
        await expect(executionService.execute(primaryProject, action(), { kind: 'file' }, async () => {
            throw new Error('runner boom');
        })).rejects.toThrow('runner boom');

        const runner = vi.fn(async () => result());
        await executionService.execute(primaryProject, action(), { kind: 'file' }, runner);
        expect(runner).toHaveBeenCalledTimes(1);
    });

    it('serializes executions for one repository', async () => {
        const executionService = service();
        const order = [];
        const first = executionService.execute(primaryProject, action(), { kind: 'file' }, async () => {
            order.push('first-start');
            await new Promise((resolve) => setTimeout(resolve, 20));
            order.push('first-end');
            return result();
        });
        const second = executionService.execute(primaryProject, action(), { kind: 'file' }, async () => {
            order.push('second-start');
            order.push('second-end');
            return result();
        });

        await Promise.all([first, second]);
        expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    });
});
