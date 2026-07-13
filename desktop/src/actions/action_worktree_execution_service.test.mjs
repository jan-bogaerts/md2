import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import executionModule from './action_worktree_execution_service.js'
import gitCommands from '../git/git_commands.js'

const execFileAsync = promisify(execFile)
const { ActionWorktreeExecutionService } = executionModule
const temporaryFolders = []

async function git(rootPath, ...args) {
    const { stdout } = await execFileAsync('git', args, { cwd: rootPath })

    return stdout.trim()
}

async function createRepository() {
    const parentPath = await mkdtemp(join(tmpdir(), 'md2-action-transfer-'))
    temporaryFolders.push(parentPath)
    const primaryPath = join(parentPath, 'primary')
    const cardPath = join(parentPath, 'card')
    await mkdir(primaryPath)
    await git(primaryPath, 'init', '-b', 'main')
    await git(primaryPath, 'config', 'user.email', 'md2@example.test')
    await git(primaryPath, 'config', 'user.name', 'MD2 Test')
    await writeFile(join(primaryPath, 'shared.txt'), 'initial\n')
    await git(primaryPath, 'add', 'shared.txt')
    await git(primaryPath, 'commit', '-m', 'Initial')
    await git(primaryPath, 'branch', 'card')
    await git(primaryPath, 'worktree', 'add', cardPath, 'card')
    await git(cardPath, 'config', 'user.email', 'md2@example.test')
    await git(cardPath, 'config', 'user.name', 'MD2 Test')

    const project = { branch: 'main', id: primaryPath, rootPath: primaryPath }
    const worktreeService = { resolve: async () => ({ branch: 'card', error: null, path: cardPath, valid: true }) }
    const service = new ActionWorktreeExecutionService({ runGit: gitCommands.runGit, worktreeService })

    return { cardPath, primaryPath, project, service }
}

function action(runIn = 'project') {
    return { name: 'implement', runIn }
}

function context() {
    return { file: 'design/F-1.md', kind: 'card', worktree: '1' }
}

function result() {
    return { command: 'test', exitCode: 0, stderr: '', stdout: '' }
}

afterEach(async () => {
    for (const folderPath of temporaryFolders.splice(0)) await rm(folderPath, { force: true, recursive: true })
})

describe('ActionWorktreeExecutionService', () => {
    it('runs card-targeted actions in the assigned linked worktree and rejects missing assignments', async () => {
        const { cardPath, project, service } = await createRepository()
        let executionRoot = null

        const execution = await service.execute(project, action('card'), context(), async (executionProject) => {
            executionRoot = executionProject.rootPath
            return result()
        })

        expect(executionRoot).toBe(cardPath)
        expect(execution).toMatchObject({ branch: 'card', executionWorktree: 1, repositoryRoot: cardPath })
        await expect(service.execute(project, action('card'), { file: 'design/F-1.md', kind: 'card' }, async () => result()))
            .rejects.toThrow(/requires a card worktree assignment/u)
        await expect(service.execute(project, action('card'), { kind: 'file', worktree: '1' }, async () => result()))
            .rejects.toThrow(/requires card context/u)
    })

    it('commits remaining files and transfers only ordered action commits', async () => {
        const { cardPath, primaryPath, project, service } = await createRepository()

        const execution = await service.execute(project, action(), context(), async (executionProject) => {
            await writeFile(join(executionProject.rootPath, 'first.txt'), 'first\n')
            await git(executionProject.rootPath, 'add', 'first.txt')
            await git(executionProject.rootPath, 'commit', '-m', 'Action own commit')
            await writeFile(join(executionProject.rootPath, 'second.txt'), 'second\n')

            return result()
        })

        expect(execution.repositoryRoot).toBe(primaryPath)
        expect(await readFile(join(cardPath, 'first.txt'), 'utf8')).toBe('first\n')
        expect(await readFile(join(cardPath, 'second.txt'), 'utf8')).toBe('second\n')
        expect((await git(cardPath, 'log', '-2', '--format=%s')).split(/\r?\n/u)).toEqual(['MD² action: implement', 'Action own commit'])
    })

    it('blocks dirty transfer worktrees before running the action', async () => {
        const { cardPath, project, service } = await createRepository()
        await writeFile(join(cardPath, 'dirty.txt'), 'dirty\n')
        let ran = false

        await expect(service.execute(project, action(), context(), async () => {
            ran = true
            return result()
        })).rejects.toThrow(/Card worktree must be clean/u)
        expect(ran).toBe(false)
    })

    it('aborts conflicts, restores the card HEAD and preserves primary commits', async () => {
        const { cardPath, primaryPath, project, service } = await createRepository()
        await writeFile(join(cardPath, 'shared.txt'), 'card\n')
        await git(cardPath, 'add', 'shared.txt')
        await git(cardPath, 'commit', '-m', 'Card change')
        const cardStart = await git(cardPath, 'rev-parse', 'HEAD')

        await expect(service.execute(project, action(), context(), async () => {
            await writeFile(join(primaryPath, 'shared.txt'), 'primary\n')
            await git(primaryPath, 'add', 'shared.txt')
            await git(primaryPath, 'commit', '-m', 'Primary action change')
            return result()
        })).rejects.toThrow(/Action transfer failed/u)

        expect(await git(cardPath, 'rev-parse', 'HEAD')).toBe(cardStart)
        expect(await readFile(join(cardPath, 'shared.txt'), 'utf8')).toBe('card\n')
        expect(await git(primaryPath, 'log', '-1', '--format=%s')).toBe('Primary action change')
        expect(await git(cardPath, 'status', '--porcelain')).toBe('')
    })

    it('serializes executions for one repository', async () => {
        const { project, service } = await createRepository()
        const order = []
        const unassignedContext = { kind: 'file' }
        const first = service.execute(project, action('project'), unassignedContext, async () => {
            order.push('first-start')
            await new Promise((resolve) => setTimeout(resolve, 20))
            order.push('first-end')
            return result()
        })
        const second = service.execute(project, action('project'), unassignedContext, async () => {
            order.push('second-start')
            order.push('second-end')
            return result()
        })

        await Promise.all([first, second])
        expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
    })
})
