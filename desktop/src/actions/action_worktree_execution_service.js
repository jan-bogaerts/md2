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
        this.worktreeService = dependencies.worktreeService
    }

    async execute(primaryProject, action, contextValue, runner) {
        const context = requireActionContext(contextValue)
        const resolution = await this.resolve(primaryProject, action, context)

        return this.withRepositoryLock(primaryProject.rootPath, async () => {
            const result = await runner(resolution.executionProject)

            return ActionWorktreeExecutionService.addExecutionMetadata(
                result,
                resolution.executionProject,
                resolution.executionWorktree,
            )
        })
    }

    async resolve(primaryProject, action, context) {
        if (context.worktreeError) throw new Error(context.worktreeError)

        const index = worktreeIndex(context)
        if (!action.needsWorkTree) return { executionProject: primaryProject, executionWorktree: null }
        if (context.kind !== 'card') throw new Error(`Action "${action.name}" requires card context when needsWorkTree is set`)
        if (index === null) throw new Error(`Action "${action.name}" requires a card worktree assignment`)

        const record = await this.worktreeService.resolve(primaryProject, index)

        return {
            executionProject: { ...primaryProject, branch: record.branch, id: record.path, rootPath: record.path },
            executionWorktree: index,
        }
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

    static addExecutionMetadata(result, project, executionWorktree) {
        return { ...result, branch: project.branch, executionWorktree, repositoryRoot: project.rootPath }
    }
}

module.exports = { ActionWorktreeExecutionService, worktreeIndex }
