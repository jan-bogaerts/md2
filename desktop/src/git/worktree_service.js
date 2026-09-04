const fs = require('node:fs');
const path = require('node:path');

const { withGitIndexMutations } = require('./git_index_coordinator');

const PARKING_BRANCH_PREFIX = 'md2/parking/';
const REMOVAL_MODES = new Set(['files', 'folder', 'unregister']);
const REFRESH_INTERVAL_MS = 5000;
const INTEGRATION_COMMIT_MESSAGE = 'Integrate into project';
const PRIMARY_CHECKPOINT_MESSAGE = 'Save project changes before worktree synchronization';

function pathKey(folderPath) {
    const normalized = path.normalize(folderPath);

    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function worktreeError(worktree) {
    if (worktree.locked) return `Worktree is locked: ${worktree.locked}`;
    if (worktree.prunable) return `Worktree is prunable: ${worktree.prunable}`;
    if (worktree.detached || !worktree.branch) return 'Worktree has detached HEAD; a named branch is required';

    return null;
}

async function folderExists(folderPath) {
    try {
        return (await fs.promises.stat(folderPath)).isDirectory();
    } catch {
        return false;
    }
}

/** A folder that already holds files, another repository worktree included, cannot become a linked worktree. */
async function requireEmptyWorktreeFolder(resolvedFolder) {
    let entries;
    try {
        entries = await fs.promises.readdir(resolvedFolder);
    } catch (error) {
        if (error && typeof error === 'object' && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return;
        throw error;
    }
    if (entries.length === 0) return;

    throw new Error(`Linked worktree folder is not empty: ${resolvedFolder}. Choose an empty or new folder.`);
}

function invalidRecord(branch, error, resolvedPath) {
    return {
        branch,
        error,
        parkingBranch: null,
        path: resolvedPath,
        status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false },
        valid: false,
    };
}

async function canonicalPath(folderPath) {
    return path.resolve(await fs.promises.realpath(folderPath));
}

function parseWorktreeList(output) {
    return output.split(/\r?\n\r?\n/u).filter((block) => block.trim().length > 0).map((block) => {
        const lines = block.split(/\r?\n/u);
        const values = Object.fromEntries(lines.map((line) => {
            const separatorIndex = line.indexOf(' ');

            return separatorIndex === -1 ? [line, ''] : [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
        }));

        return {
            branch: values.branch?.replace(/^refs\/heads\//u, '') ?? null,
            detached: Object.hasOwn(values, 'detached'),
            locked: Object.hasOwn(values, 'locked') ? values.locked || 'locked' : null,
            path: values.worktree,
            prunable: Object.hasOwn(values, 'prunable') ? values.prunable || 'prunable' : null,
        };
    });
}

function requireProjectBranch(project) {
    if (!project || typeof project.branch !== 'string' || project.branch.length === 0) throw new Error('Missing project branch');

    return project.branch;
}

function parseRevisionCounts(output) {
    const values = output.trim().split(/\s+/u).map((value) => Number.parseInt(value, 10));
    if (values.length !== 2 || values.some((value) => !Number.isInteger(value))) throw new Error(`Invalid Git revision counts: ${output}`);

    return { ahead: values[0], behind: values[1] };
}

function statesEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
}

class WorktreeService {
    constructor(dependencies) {
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.mergeConflictService = dependencies.mergeConflictService ?? null;
        this.errorReporter = dependencies.errorReporter ?? (() => {});
        this.listeners = new Set();
        this.mutationQueue = Promise.resolve();
        this.project = null;
        this.projectGeneration = 0;
        this.primaryStatus = null;
        this.records = [];
        this.refreshIntervalMs = dependencies.refreshIntervalMs ?? REFRESH_INTERVAL_MS;
        this.refreshPromise = null;
        this.refreshTimer = null;
        this.runGit = dependencies.runGit;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.state = { error: null, primaryStatus: null, project: null, records: [] };
    }

    async startProject(project) {
        const primaryRoot = await WorktreeService.requirePrimaryRoot(project);
        const nextProject = { ...project, rootPath: primaryRoot };
        if (this.project && pathKey(this.project.rootPath) === pathKey(primaryRoot) && this.project.branch === project.branch) return;

        this.stopTimer();
        this.projectGeneration += 1;
        this.refreshPromise = null;
        this.project = nextProject;
        this.primaryStatus = null;
        this.records = [];
        this.publish(null);
        await this.refreshLocal();
    }

    stopProject() {
        this.stopTimer();
        this.projectGeneration += 1;
        this.project = null;
        this.primaryStatus = null;
        this.records = [];
        this.refreshPromise = null;
        this.publish(null);
    }

    subscribe(listener) {
        if (typeof listener !== 'function') throw new Error('Worktree listener must be a function');
        this.listeners.add(listener);
        this.notifyListener(listener, this.state);

        return () => this.listeners.delete(listener);
    }

    getRecords(project) {
        this.requireActiveProject(project);

        return this.records;
    }

    /** Read Git metadata needed to compare one linked worktree with its project-branch merge base. */
    async readDiffContext(project, index) {
        const activeProject = this.requireActiveProject(project);
        const record = this.resolve(activeProject, index);
        const baseCommit = await this.runGit(record.path, ['merge-base', activeProject.branch, 'HEAD']);
        if (baseCommit.length === 0) throw new Error(`Cannot find merge base for linked worktree: ${record.path}`);

        const changes = await this.runGit(record.path, ['diff', '--name-status', '-z', '--find-renames', baseCommit, '--']);
        const untracked = await this.runGit(record.path, ['ls-files', '--others', '--exclude-standard', '-z']);

        return { baseCommit, changes, path: record.path, untracked };
    }

    resolve(project, index) {
        if (!Number.isInteger(index) || index <= 0) throw new Error(`Invalid card worktree index: ${String(index)}`);
        const record = this.getRecords(project)[index - 1];
        if (!record) throw new Error(`Configured worktree ${index} does not exist`);
        if (!record.valid) throw new Error(`Configured worktree ${index} is invalid: ${record.error}`);

        return record;
    }

    async resolvePath(project, folderPath) {
        const activeProject = this.requireActiveProject(project);
        const canonicalFolder = await canonicalPath(folderPath);
        if (pathKey(activeProject.rootPath) === pathKey(canonicalFolder)) {
            return { branch: project.branch, error: null, path: activeProject.rootPath, valid: true };
        }

        const record = this.records.find((candidate) => pathKey(candidate.path) === pathKey(canonicalFolder));
        if (!record) throw new Error('Run repository root is not a linked worktree');
        if (!record.valid) throw new Error(`Run repository root is invalid: ${record.error}`);

        return record;
    }

    add(project, folderPath) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            if (typeof folderPath !== 'string' || folderPath.length === 0) throw new Error('Missing linked worktree folder');
            if (pathKey(path.resolve(folderPath)) === pathKey(activeProject.rootPath)) throw new Error('Primary worktree cannot be added as a linked worktree');

            const resolvedFolder = path.resolve(folderPath);
            await requireEmptyWorktreeFolder(resolvedFolder);
            await this.runGit(activeProject.rootPath, ['worktree', 'add', resolvedFolder]);
            await this.parkPath(activeProject, resolvedFolder);
            await this.refreshAfterMutation();
        });
    }

    /**
     * Removal mode is the disposition of the checkout folder: `folder` deletes it, `files` empties it but keeps it,
     * `unregister` leaves folder and files untouched. All three unregister the worktree from Git and keep the branch.
     */
    remove(project, folderPath, mode = 'folder') {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            if (typeof folderPath !== 'string' || folderPath.length === 0) throw new Error('Missing linked worktree folder');
            if (!REMOVAL_MODES.has(mode)) throw new Error(`Unknown worktree removal mode: ${String(mode)}`);
            const resolvedFolder = path.resolve(folderPath);
            if (pathKey(resolvedFolder) === pathKey(activeProject.rootPath)) throw new Error('Primary worktree cannot be removed');
            if (!this.records.some((worktree) => pathKey(worktree.path) === pathKey(resolvedFolder))) throw new Error('Folder is not a linked worktree');

            await this.removeWorktreeCheckout(activeProject, resolvedFolder, mode);
            await this.refreshAfterMutation();
        });
    }

    /** A registration whose folder is gone has nothing left to preserve, so every mode collapses to a prune. */
    async removeWorktreeCheckout(project, resolvedFolder, mode) {
        const worktrees = parseWorktreeList(await this.runGit(project.rootPath, ['worktree', 'list', '--porcelain']));
        const entry = worktrees.find((worktree) => pathKey(path.resolve(worktree.path)) === pathKey(resolvedFolder));
        if (entry?.prunable || !await folderExists(resolvedFolder)) {
            await this.runGit(project.rootPath, ['worktree', 'prune']);

            return;
        }
        if (mode === 'unregister') {
            await this.unregisterWorktree(project, resolvedFolder);

            return;
        }
        // The doubled --force is what Git needs for a locked worktree; a single one only covers modified and untracked files.
        await this.runGit(project.rootPath, ['worktree', 'remove', '--force', '--force', resolvedFolder]);
        if (mode === 'files') await fs.promises.mkdir(resolvedFolder, { recursive: true });
    }

    /**
     * Delete the administrative directory of the worktree and the `.git` link file pointing at it, then prune the
     * primary repository. The link file has to go: left behind it names a registration that no longer exists, which
     * both Git and md2 reject. Nothing else inside the folder is touched.
     */
    async unregisterWorktree(project, resolvedFolder) {
        const gitDirectory = path.resolve(resolvedFolder, await this.runGit(resolvedFolder, ['rev-parse', '--git-dir']));
        await fs.promises.rm(gitDirectory, { force: true, recursive: true });
        await fs.promises.rm(path.join(resolvedFolder, '.git'), { force: true, recursive: true });
        await this.runGit(project.rootPath, ['worktree', 'prune']);
    }

    deleteBranch(project, branchName) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            await this.deleteBranchNow(activeProject, branchName);
            await this.refreshAfterMutation();
        });
    }

    refreshRemote(project) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            await this.refreshAfterMutation();
            this.stopTimer();
            if (this.primaryStatus?.hasUpstream) await this.runGit(activeProject.rootPath, ['fetch']);
            for (const { path: folderPath, status } of this.records) {
                if (status.hasUpstream) await this.runGit(folderPath, ['fetch']);
            }
            await this.refreshAfterMutation();
        });
    }

    pullPrimary(project) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            const status = await this.primaryRepositoryStatus(activeProject);
            if (status.dirty) throw new Error(`Primary worktree has uncommitted changes: ${activeProject.rootPath}`);
            if (!status.hasUpstream) throw new Error(`Primary branch has no upstream: ${activeProject.branch}`);
            if (status.ahead > 0) throw new Error(`Primary branch has outgoing commits: ${activeProject.branch}`);
            if (status.behind <= 0) throw new Error(`Primary branch has no incoming commits: ${activeProject.branch}`);

            await this.runGit(activeProject.rootPath, ['pull', '--ff-only']);
            await this.refreshAfterMutation();
        });
    }

    prepare(project, index, branchName) {
        return this.enqueueMutation(async () => {
            if (typeof branchName !== 'string' || branchName.length === 0) throw new Error('Missing worktree branch name');
            const activeProject = this.requireActiveProject(project);
            const cachedRecord = this.resolve(activeProject, index);
            const record = await this.requireClean(cachedRecord, activeProject.branch);
            await this.runGit(activeProject.rootPath, ['check-ref-format', '--branch', branchName]);
            if (record.branch !== branchName) {
                const branchExists = await this.branchExists(activeProject.rootPath, branchName);
                const switchArguments = branchExists ? ['switch', branchName] : ['switch', '-c', branchName, activeProject.branch];
                await this.runGit(record.path, switchArguments);
            }
            await this.refreshAfterMutation();
        });
    }

    commit(project, index, message) {
        return this.enqueueMutation(async () => {
            if (typeof message !== 'string' || message.trim().length === 0) throw new Error('Missing worktree commit message');
            const activeProject = this.requireActiveProject(project);
            const cachedRecord = this.resolve(activeProject, index);
            const record = await this.revalidateRecord(cachedRecord, activeProject.branch);
            if (!record.status.dirty) throw new Error('Linked worktree has no changes to commit');
            await this.runGit(record.path, ['add', '-A']);
            await this.runGit(record.path, ['commit', '-m', message.trim()]);
            await this.refreshAfterMutation();
        });
    }

    push(project, index) {
        return this.enqueueMutation(async () => {
            const record = this.resolve(project, index);
            const upstream = await this.upstream(record.path, record.branch);
            if (upstream.length > 0) await this.runGit(record.path, ['push']);
            else {
                await this.runGit(record.path, ['remote', 'get-url', 'origin']);
                await this.runGit(record.path, ['push', '--set-upstream', 'origin', record.branch]);
            }
            await this.refreshAfterMutation();
        });
    }

    pull(project, index) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            const cachedRecord = this.resolve(activeProject, index);
            const record = await this.requireClean(cachedRecord, activeProject.branch);
            const upstream = await this.upstream(record.path, record.branch);
            if (upstream.length === 0) throw new Error(`Worktree branch has no configured upstream: ${record.branch}`);
            await this.runGit(record.path, ['pull', '--ff-only']);
            await this.refreshAfterMutation();
        });
    }

    rebase(project, index) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            await this.commitPrimaryChanges(activeProject);
            const cachedRecord = this.resolve(activeProject, index);
            const record = await this.requireClean(cachedRecord, activeProject.branch);
            if (record.branch === activeProject.branch) throw new Error(`Linked worktree is already on the project branch: ${activeProject.branch}`);
            const worktreeCheckpointCommit = await this.runGit(record.path, ['rev-parse', 'HEAD']);
            try {
                await this.runGit(record.path, ['rebase', activeProject.branch]);
            } catch (error) {
                const session = await this.createConflictSession({
                    checkpointCommit: worktreeCheckpointCommit,
                    operation: 'rebase',
                    phase: 'rebase',
                    project: activeProject,
                    record,
                    repositoryRoot: record.path,
                    worktree: index,
                    worktreeCheckpointCommit,
                });
                if (session) {
                    await this.refreshAfterMutation();

                    return { session, status: 'conflict' };
                }
                try {
                    await this.runGit(record.path, ['rebase', '--abort']);
                } catch {
                    // The rebase never started; the original failure is the one worth reporting.
                }
                await this.refreshAfterMutation();
                throw error;
            }
            await this.refreshAfterMutation();

            return { status: 'completed' };
        });
    }

    integrate(project, index, metadata = {}) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            await this.commitPrimaryChanges(activeProject);
            const checkpointCommit = await this.runGit(activeProject.rootPath, ['rev-parse', 'HEAD']);
            const cachedRecord = this.resolve(activeProject, index);
            let record = await this.requireClean(cachedRecord, activeProject.branch);
            if (record.branch === activeProject.branch) throw new Error(`Linked worktree is already on the project branch: ${activeProject.branch}`);
            const worktreeCheckpointCommit = await this.runGit(record.path, ['rev-parse', 'HEAD']);
            if (record.status.baseBehind > 0) {
                try {
                    await this.runGit(record.path, ['rebase', activeProject.branch]);
                } catch (error) {
                    const session = await this.createConflictSession({
                        checkpointCommit,
                        metadata,
                        operation: 'integrate',
                        phase: 'rebase',
                        project: activeProject,
                        record,
                        repositoryRoot: record.path,
                        worktree: index,
                        worktreeCheckpointCommit,
                    });
                    if (session) {
                        await this.refreshAfterMutation();

                        return { session, status: 'conflict' };
                    }
                    try {
                        await this.runGit(record.path, ['rebase', '--abort']);
                    } catch {
                        // The rebase never started; preserve the original failure.
                    }
                    await this.refreshAfterMutation();
                    throw error;
                }
                record = await this.revalidateRecord(record, activeProject.branch);
            }
            if (record.status.baseAhead <= 0) throw new Error('Linked worktree has no changes to integrate');

            try {
                const integration = await this.performSquashIntegration(activeProject, record);
                await this.synchronizeRecord(activeProject, record);
                await this.refreshAfterMutation();

                return { ...integration, status: 'completed' };
            } catch (error) {
                const session = await this.createConflictSession({
                    checkpointCommit,
                    metadata,
                    operation: 'integrate',
                    phase: 'squash',
                    project: activeProject,
                    record,
                    repositoryRoot: activeProject.rootPath,
                    worktree: index,
                    worktreeCheckpointCommit,
                });
                if (session) {
                    await this.refreshAfterMutation();

                    return { session, status: 'conflict' };
                }
                await this.runGit(activeProject.rootPath, ['reset', '--hard', checkpointCommit]);
                await this.refreshAfterMutation();
                throw error;
            }
        });
    }

    continueConflict(request) {
        return this.enqueueMutation(async () => {
            const conflictService = this.requireMergeConflictService();
            let session = conflictService.requireSession(request);
            const continuesSquashConflict = session.phase === 'squash';
            const conflictedPaths = await conflictService.listConflictedPaths(session.repositoryRoot);
            if (conflictedPaths.length > 0) {
                session = { ...session, conflictedPaths };
                const publicSession = conflictService.update(session);

                return { session: publicSession, status: 'conflict' };
            }
            if (session.phase === 'finalize') return WorktreeService.completedConflictIntegration(session);

            if (session.phase === 'rebase') {
                const rebaseOutcome = await this.continueConflictRebase(session);
                if (rebaseOutcome) return rebaseOutcome;
                session = conflictService.getInternalSession();
                if (session.operation === 'rebase') {
                    conflictService.clear(request);
                    await this.refreshAfterMutation();

                    return { status: 'completed' };
                }
            }

            const activeProject = this.requireActiveProject({ branch: session.projectBranch, rootPath: session.projectRoot });
            const record = this.resolve(activeProject, session.worktree);
            try {
                const externalIntegration = continuesSquashConflict
                    ? null
                    : await this.completedExternalIntegration(session, activeProject, record);
                const integration = externalIntegration ?? (continuesSquashConflict
                    ? await this.completeSquashIntegration(activeProject)
                    : await this.performSquashIntegration(activeProject, record));
                await this.synchronizeRecord(activeProject, record);
                await this.refreshAfterMutation();
                const finalSession = {
                    ...session,
                    completion: integration,
                    conflictedPaths: [],
                    phase: 'finalize',
                    repositoryRoot: activeProject.rootPath,
                };
                conflictService.update(finalSession);

                return WorktreeService.completedConflictIntegration(finalSession);
            } catch (error) {
                const conflicted = await conflictService.listConflictedPaths(activeProject.rootPath);
                if (conflicted.length === 0) throw error;
                const conflictSession = conflictService.update({
                    ...session,
                    conflictedPaths: conflicted,
                    phase: 'squash',
                    repositoryRoot: activeProject.rootPath,
                });
                await this.refreshAfterMutation();

                return { session: conflictSession, status: 'conflict' };
            }
        }, true);
    }

    abortConflict(request) {
        return this.enqueueMutation(async () => {
            const conflictService = this.requireMergeConflictService();
            const session = conflictService.requireSession(request);
            const rebaseActive = session.phase === 'rebase' && await conflictService.isRebaseActive(session);
            if (rebaseActive) await this.runGit(session.repositoryRoot, ['rebase', '--abort']);
            else {
                await this.runGit(session.projectRoot, ['reset', '--hard', session.checkpointCommit]);
                if (session.worktreeCheckpointCommit !== session.checkpointCommit || session.worktreeRoot !== session.projectRoot) {
                    await this.runGit(session.worktreeRoot, ['reset', '--hard', session.worktreeCheckpointCommit]);
                }
            }
            conflictService.clear(request);
            await this.refreshAfterMutation();
        }, true);
    }

    completeConflict(request) {
        const conflictService = this.requireMergeConflictService();
        conflictService.clear(request);
    }

    synchronizeConflict(project, index) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            const record = this.resolve(activeProject, index);
            await this.synchronizeRecord(activeProject, record);
            await this.refreshAfterMutation();
        }, true);
    }

    parkConflict(project, index) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            const record = this.resolve(activeProject, index);
            await this.parkPath(activeProject, record.path);
            await this.refreshAfterMutation();
        }, true);
    }

    deleteBranchConflict(project, branchName) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            await this.deleteBranchNow(activeProject, branchName);
            await this.refreshAfterMutation();
        }, true);
    }

    async continueConflictRebase(session) {
        const conflictService = this.requireMergeConflictService();
        const rebaseActive = await conflictService.isRebaseActive(session);
        if (rebaseActive) {
            try {
                await this.runGit(session.repositoryRoot, ['-c', 'core.editor=true', 'rebase', '--continue']);
            } catch (error) {
                const conflictedPaths = await conflictService.listConflictedPaths(session.repositoryRoot);
                if (conflictedPaths.length === 0) throw error;
                const publicSession = conflictService.update({ ...session, conflictedPaths });
                await this.refreshAfterMutation();

                return { session: publicSession, status: 'conflict' };
            }
        }
        await this.refreshAfterMutation();
        if (session.operation === 'integrate') {
            conflictService.update({ ...session, conflictedPaths: [], phase: 'squash', repositoryRoot: session.projectRoot });
        }

        return null;
    }

    static completedConflictIntegration(session) {
        if (!session.completion) throw new Error('Merge conflict integration has no completion metadata');

        return { ...session.completion, session, status: 'completed' };
    }

    async performSquashIntegration(project, record) {
        await this.runGit(project.rootPath, ['merge', '--squash', record.branch]);
        return this.completeSquashIntegration(project);
    }

    async completeSquashIntegration(project) {
        const stagedPaths = await this.runGit(project.rootPath, ['diff', '--cached', '--name-only']);
        if (stagedPaths.length === 0) throw new Error('Linked worktree has no changes to integrate');
        await this.runGit(project.rootPath, ['commit', '-m', INTEGRATION_COMMIT_MESSAGE]);
        const commit = await this.runGit(project.rootPath, ['rev-parse', 'HEAD']);

        return { branch: project.branch, commit };
    }

    async completedExternalIntegration(session, project, record) {
        if (record.status.baseAhead > 0) return null;
        const commit = await this.runGit(project.rootPath, ['rev-parse', 'HEAD']);
        if (commit === session.checkpointCommit) return null;

        return { branch: project.branch, commit };
    }

    async createConflictSession(input) {
        const conflictService = this.mergeConflictService;
        if (!conflictService) return null;

        return conflictService.create({
            checkpointCommit: input.checkpointCommit,
            metadata: input.metadata ?? {},
            operation: input.operation,
            phase: input.phase,
            projectBranch: input.project.branch,
            projectId: input.project.id,
            projectRoot: input.project.rootPath,
            repositoryRoot: input.repositoryRoot,
            worktree: input.worktree,
            worktreeBranch: input.record.branch,
            worktreeCheckpointCommit: input.worktreeCheckpointCommit,
            worktreeRoot: input.record.path,
        });
    }

    requireMergeConflictService() {
        if (!this.mergeConflictService) throw new Error('Merge conflict service is not available');

        return this.mergeConflictService;
    }

    synchronize(project, index) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            const cachedRecord = this.resolve(activeProject, index);
            const record = await this.requireClean(cachedRecord, activeProject.branch);
            if (record.branch === activeProject.branch) throw new Error(`Linked worktree is already on the project branch: ${activeProject.branch}`);
            await this.synchronizeRecord(activeProject, record);
            await this.refreshAfterMutation();
        });
    }

    discard(project, index) {
        return this.enqueueMutation(async () => {
            const record = this.resolve(project, index);
            await this.runGit(record.path, ['reset', '--hard', 'HEAD']);
            await this.runGit(record.path, ['clean', '-fd']);
            await this.refreshAfterMutation();
        });
    }

    park(project, index) {
        return this.enqueueMutation(async () => {
            const activeProject = this.requireActiveProject(project);
            const cachedRecord = this.resolve(activeProject, index);
            const record = await this.requireClean(cachedRecord, activeProject.branch);
            await this.parkPath(activeProject, record.path);
            await this.refreshAfterMutation();
        });
    }

    enqueueMutation(operation, allowConflict = false) {
        const execute = async () => {
            if (this.refreshPromise) await this.refreshPromise;
            this.stopTimer();
            if (!this.project) throw new Error('Worktree service has no active project');
            if (!allowConflict) this.mergeConflictService?.assertMutationAllowed(this.project.rootPath);
            const mutationRoots = [
                this.project.rootPath,
                ...this.records.filter(({ valid }) => valid).map(({ path: recordPath }) => recordPath),
            ];

            return withGitIndexMutations(mutationRoots, operation);
        };
        const result = this.mutationQueue.then(execute, execute);
        this.mutationQueue = result.catch(() => {});

        return result;
    }

    async requireClean(record, projectBranch) {
        const refreshedRecord = await this.revalidateRecord(record, projectBranch);
        if (!refreshedRecord.status.dirty) return refreshedRecord;

        throw new Error(`Linked worktree has uncommitted changes: ${record.path}`);
    }

    async deleteBranchNow(project, branchName) {
        if (typeof branchName !== 'string' || branchName.length === 0) throw new Error('Missing local branch name');
        await this.runGit(project.rootPath, ['check-ref-format', '--branch', branchName]);
        if (branchName === project.branch) throw new Error(`Project branch cannot be deleted: ${branchName}`);
        if (branchName.startsWith(PARKING_BRANCH_PREFIX)) throw new Error(`Parking branch cannot be deleted: ${branchName}`);

        const worktrees = parseWorktreeList(await this.runGit(project.rootPath, ['worktree', 'list', '--porcelain']));
        const checkedOut = worktrees.find((worktree) => worktree.branch === branchName);
        if (checkedOut) throw new Error(`Branch is checked out by a worktree: ${branchName} (${checkedOut.path})`);

        await this.runGit(project.rootPath, ['branch', '-D', branchName]);
    }

    async commitPrimaryChanges(project) {
        const branch = (await this.runGit(project.rootPath, ['branch', '--show-current'])).trim();
        if (branch !== project.branch) throw new Error(`Primary worktree is on ${branch || 'a detached HEAD'}, expected ${project.branch}`);
        const status = await this.primaryRepositoryStatus(project);
        if (!status.dirty) return;

        await this.runGit(project.rootPath, ['add', '-A']);
        await this.runGit(project.rootPath, ['commit', '-m', PRIMARY_CHECKPOINT_MESSAGE]);
    }

    async revalidateRecord(record, projectBranch) {
        const branch = (await this.runGit(record.path, ['branch', '--show-current'])).trim();
        if (branch.length === 0) throw new Error(`Linked worktree has detached HEAD: ${record.path}`);
        const status = await this.status(record.path, branch, projectBranch);
        const refreshedRecord = { ...record, branch, status };
        this.records = this.records.map((candidate) => pathKey(candidate.path) === pathKey(record.path) ? refreshedRecord : candidate);
        this.publish(null);

        return refreshedRecord;
    }

    async synchronizeRecord(project, record) {
        await this.runGit(record.path, ['reset', '--hard', project.branch]);
    }

    async refreshLocal() {
        if (this.refreshPromise) return this.refreshPromise;
        if (!this.project) return;

        const generation = this.projectGeneration;
        const project = this.project;
        this.stopTimer();
        const refreshPromise = this.performRefresh(project, generation);
        this.refreshPromise = refreshPromise;
        try {
            await refreshPromise;
        } finally {
            if (this.refreshPromise === refreshPromise) this.refreshPromise = null;
            const shouldSchedule = this.project && this.projectGeneration === generation;
            if (shouldSchedule) this.scheduleRefresh();
        }
    }

    async performRefresh(project, generation) {
        try {
            const primaryStatus = await this.primaryRepositoryStatus(project);
            const records = await this.readWorktreeRecords(project);
            if (!this.project || this.projectGeneration !== generation) return;
            this.primaryStatus = primaryStatus;
            this.records = records;
            this.publish(null);
        } catch (error) {
            if (!this.project || this.projectGeneration !== generation) return;
            const message = error instanceof Error ? error.message : String(error);
            if (this.state.error !== message) this.errorReporter(error);
            this.publish(message);
        }
    }

    async refreshAfterMutation() {
        const project = this.project;
        if (!project) throw new Error('No active worktree project');
        const generation = this.projectGeneration;
        this.stopTimer();
        let primaryStatus;
        let records;
        try {
            primaryStatus = await this.primaryRepositoryStatus(project);
            records = await this.readWorktreeRecords(project);
        } catch (error) {
            if (!this.project || this.projectGeneration !== generation) return;
            const message = error instanceof Error ? error.message : String(error);
            if (this.state.error !== message) this.errorReporter(error);
            this.publish(message);
            this.scheduleRefresh();
            throw error;
        }
        if (!this.project || this.projectGeneration !== generation) return;
        this.primaryStatus = primaryStatus;
        this.records = records;
        this.publish(null);
        this.scheduleRefresh();
    }

    scheduleRefresh() {
        if (this.refreshTimer || !this.project) return;
        this.refreshTimer = this.setTimeout(() => {
            this.refreshTimer = null;
            void this.refreshLocal();
        }, this.refreshIntervalMs);
    }

    stopTimer() {
        if (!this.refreshTimer) return;
        this.clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
    }

    publish(error) {
        const state = { error, primaryStatus: this.primaryStatus, project: this.project, records: this.records };
        if (statesEqual(this.state, state)) return;
        this.state = state;
        for (const listener of this.listeners) this.notifyListener(listener, state);
    }

    notifyListener(listener, state) {
        try {
            listener(state);
        } catch (error) {
            this.errorReporter(error);
        }
    }

    requireActiveProject(project) {
        if (!this.project) throw new Error('No active worktree project');
        requireProjectBranch(project);
        if (!project || typeof project.rootPath !== 'string' || pathKey(path.resolve(project.rootPath)) !== pathKey(this.project.rootPath)
            || project.branch !== this.project.branch) throw new Error('Requested project is not the active worktree project');

        return this.project;
    }

    async readWorktreeRecords(project) {
        const primaryRoot = project.rootPath;
        const worktrees = parseWorktreeList(await this.runGit(primaryRoot, ['worktree', 'list', '--porcelain']));
        const linkedWorktrees = worktrees.filter((worktree) => pathKey(path.resolve(worktree.path)) !== pathKey(primaryRoot));

        return Promise.all(linkedWorktrees.map((worktree) => this.readWorktreeRecord(project, worktree)));
    }

    /**
     * A worktree Git already reports as locked, prunable or detached gets no Git command run inside it, and any
     * per-record failure becomes an invalid record, so one broken worktree cannot discard the records of the others.
     */
    async readWorktreeRecord(project, worktree) {
        const resolvedPath = path.resolve(worktree.path);
        const error = worktreeError(worktree);
        if (error !== null) return invalidRecord(worktree.branch, error, resolvedPath);

        try {
            const parkingBranch = await this.parkingBranch(resolvedPath);
            const status = await this.status(resolvedPath, worktree.branch, requireProjectBranch(project));

            return { branch: worktree.branch, error: null, parkingBranch, path: resolvedPath, status, valid: true };
        } catch (failure) {
            return invalidRecord(worktree.branch, failure instanceof Error ? failure.message : String(failure), resolvedPath);
        }
    }

    primaryRepositoryStatus(project) {
        const projectBranch = requireProjectBranch(project);

        return this.status(project.rootPath, projectBranch, projectBranch);
    }

    async branchExists(rootPath, branchName) {
        try {
            await this.runGit(rootPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);

            return true;
        } catch (error) {
            if (error && typeof error === 'object' && error.code === 1) return false;
            throw error;
        }
    }

    async parkingBranch(folderPath) {
        const gitDirectory = await this.runGit(folderPath, ['rev-parse', '--git-dir']);
        const worktreeId = path.basename(path.normalize(gitDirectory)).toLowerCase().replace(/[^a-z0-9._-]+/gu, '-');
        if (worktreeId.length === 0) throw new Error(`Cannot determine parking branch for worktree: ${folderPath}`);

        return `${PARKING_BRANCH_PREFIX}${worktreeId}`;
    }

    async parkPath(project, folderPath) {
        const projectBranch = requireProjectBranch(project);
        const parkingBranch = await this.parkingBranch(folderPath);
        await this.runGit(project.rootPath, ['check-ref-format', '--branch', parkingBranch]);
        await this.runGit(folderPath, ['switch', '-C', parkingBranch, projectBranch]);
    }

    /**
     * Distances are tracked twice: `baseAhead`/`baseBehind` against the project branch (fixed by rebasing) and
     * `ahead`/`behind` against the configured upstream (fixed by pushing or pulling). A worktree branch that was
     * never pushed still has to report how far it trails the project branch.
     */
    async status(folderPath, branch, projectBranch) {
        const dirty = (await this.runGit(folderPath, ['status', '--porcelain'])).length > 0;
        const base = parseRevisionCounts(await this.runGit(folderPath, ['rev-list', '--left-right', '--count', `HEAD...${projectBranch}`]));
        const upstream = await this.upstream(folderPath, branch);
        if (upstream.length === 0) {
            return { ahead: 0, baseAhead: base.ahead, baseBehind: base.behind, behind: 0, dirty, hasUpstream: false };
        }
        const counts = parseRevisionCounts(await this.runGit(folderPath, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]));

        return { ...counts, baseAhead: base.ahead, baseBehind: base.behind, dirty, hasUpstream: true };
    }

    upstream(folderPath, branch) {
        return this.runGit(folderPath, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`]);
    }

    static async requirePrimaryRoot(project) {
        if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) throw new Error('Missing primary project rootPath');

        return canonicalPath(project.rootPath);
    }
}

module.exports = { WorktreeService, parseWorktreeList };
