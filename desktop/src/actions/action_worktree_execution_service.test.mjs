import { describe, expect, it, vi } from 'vitest'
import executionModule from './action_worktree_execution_service.js'

const { ActionWorktreeExecutionService } = executionModule
const primaryProject = { branch: 'main', id: 'C:/repo', rootPath: 'C:/repo' }
const cardProject = { branch: 'card', error: null, path: 'C:/worktrees/card', valid: true }

function action(needsWorkTree = false) {
    return { name: 'implement', needsWorkTree }
}

function result() {
    return { command: 'test', exitCode: 0, stderr: '', stdout: '' }
}

function service() {
    return new ActionWorktreeExecutionService({
        worktreeService: { resolve: vi.fn(async () => cardProject) },
    })
}

describe('ActionWorktreeExecutionService', () => {
    it('runs actions in the opened project when no worktree is requested', async () => {
        const runner = vi.fn(async () => result())

        const execution = await service().execute(
            primaryProject,
            action(),
            { file: 'design/F-1.md', kind: 'card', worktree: '1' },
            runner,
        )

        expect(runner).toHaveBeenCalledWith(primaryProject)
        expect(execution).toMatchObject({ branch: 'main', executionWorktree: null, repositoryRoot: 'C:/repo' })
    })

    it('runs needsWorkTree actions in the assigned card worktree', async () => {
        const runner = vi.fn(async () => result())

        const execution = await service().execute(
            primaryProject,
            action(true),
            { file: 'design/F-1.md', kind: 'card', worktree: '1' },
            runner,
        )

        expect(runner).toHaveBeenCalledWith({ branch: 'card', id: 'C:/worktrees/card', rootPath: 'C:/worktrees/card' })
        expect(execution).toMatchObject({ branch: 'card', executionWorktree: 1, repositoryRoot: 'C:/worktrees/card' })
    })

    it('rejects needsWorkTree actions without an assigned card worktree', async () => {
        const runner = vi.fn(async () => result())

        await expect(service().execute(primaryProject, action(true), { kind: 'card' }, runner))
            .rejects.toThrow(/requires a card worktree assignment/u)
        await expect(service().execute(primaryProject, action(true), { kind: 'file', worktree: '1' }, runner))
            .rejects.toThrow(/requires card context/u)
        expect(runner).not.toHaveBeenCalled()
    })

    it('serializes executions for one repository', async () => {
        const executionService = service()
        const order = []
        const first = executionService.execute(primaryProject, action(), { kind: 'file' }, async () => {
            order.push('first-start')
            await new Promise((resolve) => setTimeout(resolve, 20))
            order.push('first-end')
            return result()
        })
        const second = executionService.execute(primaryProject, action(), { kind: 'file' }, async () => {
            order.push('second-start')
            order.push('second-end')
            return result()
        })

        await Promise.all([first, second])
        expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
    })
})
