const path = require('node:path')

function requireActionContext(context) {
    if (!context || typeof context !== 'object') throw new Error('Missing action context')

    return context
}

function worktreeIndex(context) {
    if (context.worktree === undefined) return null
    if (typeof context.worktree !== 'string' || !/^[1-9]\d*$/u.test(context.worktree)) {
        throw new Error(`Invalid card worktree index: ${String(context.worktree)}`)
    }

    const index = Number.parseInt(context.worktree, 10)
    if (!Number.isSafeInteger(index)) throw new Error(`Invalid card worktree index: ${context.worktree}`)

    return index
}

class ActionWorktreeExecutionService {
    constructor(dependencies) {
        this.locks = new Map()
        this.runGit = dependencies.runGit
        this.worktreeService = dependencies.worktreeService
    }

    async execute(primaryProject, action, contextValue, runner) {
        const context = requireActionContext(contextValue)
        const resolution = await this.resolve(primaryProject, action, context)

        return this.withRepositoryLock(primaryProject.rootPath, async () => {
            if (!resolution.transferRecord) {
                const result = await runner(resolution.executionProject)

                return ActionWorktreeExecutionService.addExecutionMetadata(
                    result,
                    resolution.executionProject,
                    resolution.executionWorktree,
                )
            }

            return this.executeWithTransfer(primaryProject, resolution, action, runner)
        })
    }

    async resolve(primaryProject, action, context) {
        if (context.worktreeError) throw new Error(context.worktreeError)

        const index = worktreeIndex(context)
        if (action.runIn === 'card') {
            if (context.kind !== 'card') throw new Error(`Action "${action.name}" requires card context for runIn "card"`)
            if (index === null) throw new Error(`Action "${action.name}" requires a card worktree assignment`)

            const record = await this.worktreeService.resolve(primaryProject, index)

            return {
                executionProject: { ...primaryProject, branch: record.branch, id: record.path, rootPath: record.path },
                executionWorktree: index,
                transferRecord: null,
            }
        }
        if (action.runIn !== 'project') throw new Error(`Invalid action runIn: ${String(action.runIn)}`)
        if (context.kind !== 'card' || index === null) {
            return { executionProject: primaryProject, executionWorktree: null, transferRecord: null }
        }

        return {
            executionProject: primaryProject,
            executionWorktree: null,
            transferRecord: await this.worktreeService.resolve(primaryProject, index),
        }
    }

    async executeWithTransfer(primaryProject, resolution, action, runner) {
        const cardProject = {
            ...primaryProject,
            branch: resolution.transferRecord.branch,
            id: resolution.transferRecord.path,
            rootPath: resolution.transferRecord.path,
        }
        await this.requireClean(primaryProject.rootPath, 'Primary worktree')
        await this.requireClean(cardProject.rootPath, 'Card worktree')
        const primaryStart = await this.head(primaryProject.rootPath)
        const cardStart = await this.head(cardProject.rootPath)
        const result = await runner(primaryProject)
        if (result.exitCode !== 0) {
            const remaining = await this.status(primaryProject.rootPath)
            const detail = remaining.length > 0 ? `\nPrimary worktree has remaining action changes:\n${remaining}` : ''

            return ActionWorktreeExecutionService.addExecutionMetadata(
                { ...result, stderr: `${result.stderr}${detail}` }, primaryProject, null,
            )
        }

        const remaining = await this.status(primaryProject.rootPath)
        if (remaining.length > 0) {
            await this.runGit(primaryProject.rootPath, ['add', '-A', '--', '.', ':(exclude).md2-worktrees.json'])
            await this.runGit(primaryProject.rootPath, ['commit', '-m', `MD² action: ${action.name}`])
        }
        await this.runGit(primaryProject.rootPath, ['merge-base', '--is-ancestor', primaryStart, 'HEAD'])
        const primaryCommits = await this.commitsAfter(primaryProject.rootPath, primaryStart)
        if (await this.head(cardProject.rootPath) !== cardStart) {
            throw new Error('Card worktree HEAD changed during action execution')
        }
        await this.requireClean(cardProject.rootPath, 'Card worktree')

        try {
            for (const commit of primaryCommits) await this.runGit(cardProject.rootPath, ['cherry-pick', commit])
        } catch (error) {
            await this.abortCherryPick(cardProject.rootPath)
            await this.runGit(cardProject.rootPath, ['reset', '--hard', cardStart])
            const detail = ActionWorktreeExecutionService.errorMessage(error)
            throw new Error(`Action transfer failed; card worktree restored to ${cardStart}: ${detail}`, { cause: error })
        }

        return ActionWorktreeExecutionService.addExecutionMetadata(result, primaryProject, null)
    }

    async withRepositoryLock(rootPath, operation) {
        const key = path.resolve(rootPath).toLowerCase()
        const previous = this.locks.get(key) ?? Promise.resolve()
        let release
        const gate = new Promise((resolve) => {
            release = resolve
        })
        const tail = previous.then(() => gate)
        this.locks.set(key, tail)
        await previous

        try {
            return await operation()
        } finally {
            release()
            if (this.locks.get(key) === tail) this.locks.delete(key)
        }
    }

    async requireClean(rootPath, label) {
        const status = await this.status(rootPath)
        if (status.length > 0) throw new Error(`${label} must be clean before project-to-card action transfer:\n${status}`)
    }

    async status(rootPath) {
        return this.runGit(rootPath, ['status', '--porcelain', '--untracked-files=all'])
    }

    async head(rootPath) {
        return this.runGit(rootPath, ['rev-parse', 'HEAD'])
    }

    async commitsAfter(rootPath, startingHead) {
        const output = await this.runGit(rootPath, ['rev-list', '--reverse', `${startingHead}..HEAD`])

        return output.split(/\r?\n/u).filter((commit) => commit.length > 0)
    }

    async abortCherryPick(rootPath) {
        try {
            await this.runGit(rootPath, ['cherry-pick', '--abort'])
        } catch {
            // No cherry-pick may be active when an earlier pick already failed before Git wrote state.
        }
    }

    static addExecutionMetadata(result, project, executionWorktree) {
        return { ...result, branch: project.branch, executionWorktree, repositoryRoot: project.rootPath }
    }

    static errorMessage(error) {
        if (error && typeof error === 'object' && typeof error.stderr === 'string' && error.stderr.trim().length > 0) {
            return error.stderr.trim()
        }
        if (error instanceof Error) return error.message

        return 'Unknown Git error'
    }
}

module.exports = { ActionWorktreeExecutionService, worktreeIndex }
