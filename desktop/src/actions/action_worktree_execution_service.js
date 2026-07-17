const path = require('node:path');

function requireActionContext(context) {
    if (!context || typeof context !== 'object') throw new Error('Missing action context');

    return context;
}

function worktreeIndex(context) {
    if (context.worktree === undefined) return null;
    if (typeof context.worktree !== 'string' || !/^[1-9]\d*$/u.test(context.worktree)) {
        throw new Error(`Invalid card worktree index: ${String(context.worktree)}`);
    }

    const index = Number.parseInt(context.worktree, 10);
    if (!Number.isSafeInteger(index)) throw new Error(`Invalid card worktree index: ${context.worktree}`);

    return index;
}

class ActionWorktreeExecutionService {
    constructor(dependencies) {
        this.executionLockStates = new Map();
        this.worktreeService = dependencies.worktreeService;
    }

    async execute(primaryProject, action, contextValue, runner) {
        const context = requireActionContext(contextValue);
        const resolution = await this.resolve(primaryProject, action, context);
        const lockScope = ActionWorktreeExecutionService.lockScope(primaryProject, action, context);

        return this.withExecutionLock(lockScope, async () => {
            const result = await runner(resolution.executionProject);

            return ActionWorktreeExecutionService.addExecutionMetadata(
                result,
                resolution.executionProject,
                resolution.executionWorktree,
            );
        });
    }

    async resolve(primaryProject, action, context) {
        if (!action.needsWorkTree) return { executionProject: primaryProject, executionWorktree: null };
        if (context.worktreeError) throw new Error(context.worktreeError);
        if (context.kind !== 'card') throw new Error(`Action "${action.label}" requires card context when needsWorkTree is set`);

        const index = worktreeIndex(context);
        if (index === null) throw new Error(`Action "${action.label}" requires a card worktree assignment`);

        const record = await this.worktreeService.resolve(primaryProject, index);

        return {
            executionProject: { ...primaryProject, branch: record.branch, id: record.path, rootPath: record.path },
            executionWorktree: index,
        };
    }

    async withExecutionLock(lockScope, operation) {
        const request = await this.acquireExecutionLock(lockScope);

        try {
            return await operation();
        } finally {
            this.releaseExecutionLock(lockScope.repositoryKey, request);
        }
    }

    async acquireExecutionLock(lockScope) {
        const { promise, resolve } = Promise.withResolvers();
        const state = this.executionLockStates.get(lockScope.repositoryKey) ?? {
            activeCardKeys: new Set(),
            exclusiveActive: false,
            pending: [],
        };
        const request = { cardKey: lockScope.cardKey, resolve };
        state.pending.push(request);
        this.executionLockStates.set(lockScope.repositoryKey, state);
        ActionWorktreeExecutionService.drainExecutionLocks(state);
        await promise;

        return request;
    }

    releaseExecutionLock(repositoryKey, request) {
        const state = this.executionLockStates.get(repositoryKey);
        if (!state) throw new Error('Missing action execution lock state');
        if (request.cardKey === null) state.exclusiveActive = false;
        else state.activeCardKeys.delete(request.cardKey);
        ActionWorktreeExecutionService.drainExecutionLocks(state);
        if (!state.exclusiveActive && state.activeCardKeys.size === 0 && state.pending.length === 0) {
            this.executionLockStates.delete(repositoryKey);
        }
    }

    static drainExecutionLocks(state) {
        if (state.exclusiveActive) return;
        const exclusiveIndex = state.pending.findIndex(({ cardKey }) => cardKey === null);
        if (exclusiveIndex === 0) {
            if (state.activeCardKeys.size > 0) return;
            const [request] = state.pending.splice(0, 1);
            state.exclusiveActive = true;
            request.resolve();
            return;
        }

        let index = 0;
        let limit = exclusiveIndex < 0 ? state.pending.length : exclusiveIndex;
        while (index < limit) {
            const request = state.pending[index];
            if (state.activeCardKeys.has(request.cardKey)) {
                index += 1;
                continue;
            }
            state.pending.splice(index, 1);
            limit -= 1;
            state.activeCardKeys.add(request.cardKey);
            request.resolve();
        }
    }

    static lockScope(primaryProject, action, context) {
        const repositoryKey = path.resolve(primaryProject.rootPath).toLowerCase();
        if (action.type !== 'agent' || !action.trackFileChanges || context.kind !== 'card') {
            return { cardKey: null, repositoryKey };
        }
        if (typeof context.file !== 'string' || context.file.length === 0) {
            throw new Error('Tracked card action requires a context file');
        }

        return { cardKey: path.resolve(primaryProject.rootPath, context.file).toLowerCase(), repositoryKey };
    }

    static addExecutionMetadata(result, project, executionWorktree) {
        return { ...result, branch: project.branch, executionWorktree, repositoryRoot: project.rootPath };
    }
}

module.exports = { ActionWorktreeExecutionService, worktreeIndex };
