const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MERGE_CONFLICT_SESSION_STORE_KEY = 'mergeConflictSession';

function requireSessionId(request) {
    if (!request || typeof request.sessionId !== 'string' || request.sessionId.length === 0) {
        throw new Error('Missing merge conflict session ID');
    }

    return request.sessionId;
}

function parseConflictedPaths(output) {
    if (typeof output !== 'string') throw new Error('Git conflict path output must be a string');

    return [...new Set(output.split('\0').filter((filePath) => filePath.length > 0))];
}

function validateStoredSession(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const requiredStrings = ['checkpointCommit', 'id', 'operation', 'phase', 'projectBranch', 'projectId', 'projectRoot', 'repositoryRoot', 'worktreeBranch', 'worktreeCheckpointCommit', 'worktreeRoot'];
    if (requiredStrings.some((fieldName) => typeof value[fieldName] !== 'string' || value[fieldName].length === 0)) return null;
    if (!Number.isInteger(value.worktree) || value.worktree <= 0) return null;
    if (!Array.isArray(value.conflictedPaths) || value.conflictedPaths.some((filePath) => typeof filePath !== 'string' || filePath.length === 0)) return null;
    if (!['integrate', 'rebase'].includes(value.operation)) return null;
    if (!['finalize', 'rebase', 'squash'].includes(value.phase)) return null;

    return { ...value, conflictedPaths: [...value.conflictedPaths] };
}

function publicSession(session, resolverCommand) {
    if (!session) return null;

    return {
        conflictedPaths: session.conflictedPaths,
        externalResolverConfigured: typeof resolverCommand === 'string' && resolverCommand.length > 0,
        id: session.id,
        operation: session.operation,
        phase: session.phase,
        repositoryRoot: session.repositoryRoot,
        worktree: session.worktree,
    };
}

function resolveResolverCommand(template, repositoryRoot, filePath) {
    if (typeof template !== 'string' || template.length === 0) throw new Error('External merge conflict resolver is not configured');
    if (!template.includes('{{file}}')) throw new Error('Merge conflict resolver command requires {{file}} placeholder');

    return template
        .replaceAll('{{file}}', path.resolve(repositoryRoot, filePath))
        .replaceAll('{{repository-folder}}', repositoryRoot);
}

function waitForProcess(child) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (handler, value) => {
            if (settled) return;

            settled = true;
            handler(value);
        };
        child.on('error', (error) => settle(reject, new Error(`Merge conflict resolver launch failed: ${error.message}`, { cause: error })));
        child.on('exit', (exitCode) => {
            if (exitCode === 0 || exitCode === null) settle(resolve);
            else settle(reject, new Error(`Merge conflict resolver exited with code ${exitCode}`));
        });
    });
}

/** Owns durable state and file-level operations for one paused Git conflict. */
class MergeConflictService extends EventTarget {
    constructor(dependencies) {
        super();
        this.configProvider = dependencies.configProvider;
        this.pathExists = dependencies.pathExists ?? fs.existsSync;
        this.runGit = dependencies.runGit;
        this.spawnProcess = dependencies.spawnProcess ?? spawn;
        this.store = dependencies.store;
        this.session = validateStoredSession(this.store.get(MERGE_CONFLICT_SESSION_STORE_KEY));
        if (!this.session) this.store.delete(MERGE_CONFLICT_SESSION_STORE_KEY);
        this.snapshot = publicSession(this.session, this.resolverCommand());
    }

    getSnapshot() {
        return this.snapshot;
    }

    getInternalSession() {
        return this.session;
    }

    async verify() {
        if (!this.session) return null;
        const session = this.session;
        await this.runGit(session.repositoryRoot, ['rev-parse', '--is-inside-work-tree']);
        if (session.phase === 'finalize') return this.snapshot;
        const conflictedPaths = await this.listConflictedPaths(session.repositoryRoot);
        if (session.phase === 'rebase') {
            const rebaseActive = await this.isRebaseActive(session);
            if (!rebaseActive && conflictedPaths.length === 0) {
                if (session.operation === 'integrate') {
                    this.publish({ ...session, conflictedPaths: [], phase: 'squash', repositoryRoot: session.projectRoot });

                    return this.snapshot;
                }
                this.publish(null);

                return null;
            }
        }
        if (session.phase === 'squash' && conflictedPaths.length === 0) {
            const stagedPaths = await this.runGit(session.repositoryRoot, ['diff', '--cached', '--name-only']);
            if (stagedPaths.length === 0) {
                this.publish(null);

                return null;
            }
        }
        if (conflictedPaths.join('\0') !== session.conflictedPaths.join('\0')) {
            this.publish({ ...session, conflictedPaths });
        }

        return this.snapshot;
    }

    requireSession(request) {
        const sessionId = requireSessionId(request);
        if (!this.session || this.session.id !== sessionId) throw new Error('Merge conflict session is no longer active');

        return this.session;
    }

    assertMutationAllowed(projectRoot) {
        if (!this.session) return;
        if (path.resolve(this.session.projectRoot).toLowerCase() !== path.resolve(projectRoot).toLowerCase()) return;

        throw new Error('Repository has an active merge conflict session');
    }

    async create(input) {
        if (this.session) throw new Error('A merge conflict session is already active');
        const conflictedPaths = await this.listConflictedPaths(input.repositoryRoot);
        if (conflictedPaths.length === 0) return null;

        const session = {
            ...input,
            conflictedPaths,
            id: crypto.randomUUID(),
        };
        this.publish(session);

        return this.snapshot;
    }

    async rescan(request) {
        const session = this.requireSession(request);
        const conflictedPaths = await this.listConflictedPaths(session.repositoryRoot);
        this.publish({ ...session, conflictedPaths });

        return this.snapshot;
    }

    async markResolved(request) {
        const session = this.requireSession(request);
        if (typeof request.path !== 'string' || !session.conflictedPaths.includes(request.path)) {
            throw new Error('Selected path is not an active merge conflict');
        }
        await this.runGit(session.repositoryRoot, ['--literal-pathspecs', 'add', '-A', '--', request.path]);

        return this.rescan(request);
    }

    async launchResolver(request) {
        const session = this.requireSession(request);
        if (typeof request.path !== 'string' || !session.conflictedPaths.includes(request.path)) {
            throw new Error('Selected path is not an active merge conflict');
        }
        const command = resolveResolverCommand(this.resolverCommand(), session.repositoryRoot, request.path);
        const child = this.spawnProcess(command, { cwd: session.repositoryRoot, shell: true });
        await waitForProcess(child);
    }

    update(session) {
        if (!this.session || this.session.id !== session.id) throw new Error('Merge conflict session is no longer active');
        this.publish(session);

        return this.snapshot;
    }

    updateMetadata(request, updates) {
        const session = this.requireSession(request);
        if (!session.metadata || typeof session.metadata !== 'object' || Array.isArray(session.metadata)) {
            throw new Error('Merge conflict session has no integration metadata');
        }
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            throw new Error('Missing merge conflict metadata updates');
        }
        const metadata = { ...session.metadata, ...updates };
        this.publish({ ...session, metadata });

        return metadata;
    }

    clear(request) {
        this.requireSession(request);
        this.publish(null);
    }

    resolverCommand() {
        return this.configProvider().mergeConflictResolverCommand;
    }

    async listConflictedPaths(repositoryRoot) {
        const output = await this.runGit(repositoryRoot, ['diff', '--name-only', '--diff-filter=U', '-z', '--']);

        return parseConflictedPaths(output);
    }

    async isRebaseActive(session) {
        const mergeStatePath = await this.runGit(session.repositoryRoot, ['rev-parse', '--git-path', 'rebase-merge']);
        const applyStatePath = await this.runGit(session.repositoryRoot, ['rev-parse', '--git-path', 'rebase-apply']);
        const statePaths = [mergeStatePath, applyStatePath].map((statePath) => (
            path.isAbsolute(statePath.trim()) ? statePath.trim() : path.resolve(session.repositoryRoot, statePath.trim())
        ));

        return statePaths.some((statePath) => this.pathExists(statePath));
    }

    publish(session) {
        this.session = session;
        if (session) this.store.set(MERGE_CONFLICT_SESSION_STORE_KEY, session);
        else this.store.delete(MERGE_CONFLICT_SESSION_STORE_KEY);
        this.snapshot = publicSession(session, this.resolverCommand());
        this.dispatchEvent(new CustomEvent('changed', { detail: this.snapshot }));
    }
}

module.exports = {
    MERGE_CONFLICT_SESSION_STORE_KEY,
    MergeConflictService,
    parseConflictedPaths,
    resolveResolverCommand,
};
