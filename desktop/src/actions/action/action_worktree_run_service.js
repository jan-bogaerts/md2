const path = require('node:path');
const { ActionCancellationError } = require('./action_cancellation_error');

function requireActionContext(context) {
    if (!context || typeof context !== 'object') throw new Error('Missing action context');

    return context;
}

function worktreeIndex(context) {
    if (context.worktree === undefined) return null;
    if (typeof context.worktree !== 'string' || !/^[1-9]\d*$/u.test(context.worktree)) {
        throw new Error(`Invalid worktree index: ${String(context.worktree)}`);
    }

    const index = Number.parseInt(context.worktree, 10);
    if (!Number.isSafeInteger(index)) throw new Error(`Invalid worktree index: ${context.worktree}`);

    return index;
}

class ActionWorktreeRunService {
    constructor(dependencies) {
        this.runLockStates = new Map();
        this.worktreeService = dependencies.worktreeService;
    }

    async execute(primaryProject, action, contextValue, runner) {
        const context = requireActionContext(contextValue);
        const resolution = await this.resolve(primaryProject, action, context);
        const result = await runner(resolution.runProject);

        return ActionWorktreeRunService.addRunMetadata(
            result,
            resolution.runProject,
            resolution.runWorktree,
        );
    }

    /** Run one complete action run while holding its card-scoped lock. */
    async runWithCardLock(primaryProject, contextValue, operation, options = {}) {
        const context = requireActionContext(contextValue);
        const cardKey = ActionWorktreeRunService.cardKey(primaryProject, context);
        if (cardKey === null) return operation();

        return this.withRunLock(cardKey, options, operation);
    }

    async resolve(primaryProject, action, context) {
        const hasWorktreeAssignment = context.worktree !== undefined || !!context.worktreeError;
        if (!hasWorktreeAssignment && !action.needsWorkTree) {
            return { runProject: primaryProject, runWorktree: null };
        }
        if (context.worktreeError) throw new Error(context.worktreeError);
        if (context.kind !== 'card' && context.kind !== 'project') {
            const reason = action.needsWorkTree
                ? 'when needsWorkTree is set'
                : 'for worktree run';
            throw new Error(`Action "${action.label}" requires card or project context ${reason}`);
        }

        const index = worktreeIndex(context);
        if (index === null) throw new Error(`Action "${action.label}" requires a worktree assignment`);

        const record = await this.worktreeService.resolve(primaryProject, index);

        return {
            runProject: { ...primaryProject, branch: record.branch, id: record.path, rootPath: record.path },
            runWorktree: index,
        };
    }

    async withRunLock(cardKey, options, operation) {
        const request = await this.acquireRunLock(cardKey, options);

        try {
            return await operation();
        } finally {
            this.releaseRunLock(cardKey, request);
        }
    }

    async acquireRunLock(cardKey, options) {
        const signal = options.signal;
        if (signal?.aborted) throw new ActionCancellationError('Action cancelled');

        const { promise, reject, resolve } = Promise.withResolvers();
        const state = this.runLockStates.get(cardKey) ?? { activeRequest: null, pending: [] };
        const request = { acquired: false, abortHandler: null, reject, resolve, signal };
        request.abortHandler = this.cancelLockRequest.bind(this, cardKey, request);
        signal?.addEventListener('abort', request.abortHandler, { once: true });
        state.pending.push(request);
        this.runLockStates.set(cardKey, state);
        ActionWorktreeRunService.drainRunLocks(state);
        if (!request.acquired) options.onQueued?.();
        await promise;

        return request;
    }

    cancelLockRequest(cardKey, request) {
        const state = this.runLockStates.get(cardKey);
        if (!state || request.acquired) return;

        const requestIndex = state.pending.indexOf(request);
        if (requestIndex < 0) return;

        state.pending.splice(requestIndex, 1);
        request.signal?.removeEventListener('abort', request.abortHandler);
        request.reject(new ActionCancellationError('Action cancelled'));
        ActionWorktreeRunService.drainRunLocks(state);
        this.deleteEmptyLockState(cardKey, state);
    }

    releaseRunLock(cardKey, request) {
        const state = this.runLockStates.get(cardKey);
        if (!state) throw new Error('Missing action run lock state');
        if (state.activeRequest !== request) throw new Error('Invalid active action run lock');

        state.activeRequest = null;
        ActionWorktreeRunService.drainRunLocks(state);
        this.deleteEmptyLockState(cardKey, state);
    }

    deleteEmptyLockState(cardKey, state) {
        if (!state.activeRequest && state.pending.length === 0) this.runLockStates.delete(cardKey);
    }

    static drainRunLocks(state) {
        if (state.activeRequest || state.pending.length === 0) return;

        const request = state.pending.shift();
        request.acquired = true;
        state.activeRequest = request;
        request.signal?.removeEventListener('abort', request.abortHandler);
        request.resolve();
    }

    static cardKey(primaryProject, context) {
        if (typeof context.cardInternalId !== 'string' || context.cardInternalId.length === 0) return null;

        const repositoryKey = path.resolve(primaryProject.rootPath).toLowerCase();

        return `${repositoryKey}\0${context.cardInternalId}`;
    }

    static addRunMetadata(result, project, runWorktree) {
        return { ...result, branch: project.branch, runWorktree, repositoryRoot: project.rootPath };
    }
}

module.exports = { ActionWorktreeRunService, worktreeIndex };
