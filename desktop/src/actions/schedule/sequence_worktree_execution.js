const crypto = require('node:crypto');
const { CheckoutOwnershipService, checkoutOwnershipService } = require('../../git/checkout_ownership_service');
const { currentGitOperationContext, runWithGitOperationContext } = require('../../git/git_operation_context');
const { CardStateTracker } = require('../card/card_state_tracker');

const INTEGRATION_LABEL = 'Integrate into project';

/** Owns one sequence's checkout, branch transitions, and recovery evidence. */
class SequenceWorktreeExecution {
    constructor(dependencies) {
        const {
            project, projectFolder, activeCardsFolder, worktreeService, localGitService,
            saveSequence, onStateChange, onError, isCancelled,
        } = dependencies;
        this.checkoutOwnershipService = checkoutOwnershipService;
        this.project = project;
        this.projectFolder = projectFolder;
        this.activeCardsFolder = activeCardsFolder;
        this.worktreeService = worktreeService;
        this.localGitService = localGitService;
        this.saveSequence = saveSequence;
        this.onStateChange = onStateChange;
        this.onError = onError;
        this.isCancelled = isCancelled;
        this.leases = new Map();
        this.watchers = new Map();
    }

    prepare(schedule) {
        return runWithGitOperationContext({ checkoutOwnerId: schedule.id }, () => this.prepareNow(schedule));
    }

    async prepareNow(schedule) {
        let current = schedule;
        if (typeof this.projectFolder !== 'string') throw new Error('Missing sequence project folder');
        if (!current.branchProgress) {
            await this.requireBranch(this.project.rootPath, this.project.branch);
            const { record } = await this.worktreeService.resolveBranch(this.project, current.worktreeBranch);
            this.acquire(current.id, record.path);
            await this.requireClean(record.path);
            const baseCommit = await this.git(this.project.rootPath, ['rev-parse', this.project.branch]);
            const sequenceBranch = `md2/sequence/${crypto.randomUUID()}`;
            current = await this.saveSequence({
                ...current, branchProgress: {
                    baseCommit, checkoutPath: record.path, childBranch: null, childBranches: [], childCommits: {},
                    expectedBranch: record.branch,
                    integrationCommit: null, runId: null,
                    phase: 'preparing-sequence', sequenceBranch, sourceCommit: null, sourceTree: null, targetCommit: null,
                },
            });
        }
        this.acquire(current.id, current.branchProgress.checkoutPath);
        this.reserveBranches(current);
        await this.requireLinkedCheckout(current.branchProgress);
        if (current.branchProgress.phase === 'preparing-sequence') {
            current = await this.createBranch(current, current.branchProgress.sequenceBranch, current.branchProgress.baseCommit, 'sequence-ready');
        }
        if (current.branchProgress.phase === 'sequence-ready') {
            const { checkoutPath, sequenceBranch } = current.branchProgress;
            await this.requireBranch(checkoutPath, sequenceBranch);
            await this.requireClean(checkoutPath);
            const targetCommit = await this.git(checkoutPath, ['rev-parse', 'HEAD']);
            const expectedCommit = current.branchProgress.integrationCommit
                ?? current.branchProgress.targetCommit ?? current.branchProgress.baseCommit;
            if (targetCommit !== expectedCommit) throw new Error('Sequence branch changed externally before child preparation');
            const childBranch = `${sequenceBranch}-card-${current.currentIndex + 1}-${crypto.randomUUID()}`;
            current = await this.persist(current, 'preparing-child', {childBranch, targetCommit, sourceCommit: null, sourceTree: null, integrationCommit: null, runId: null});
        }
        if (current.branchProgress.phase === 'preparing-child') {
            const { childBranch, targetCommit, childBranches } = current.branchProgress;
            current = await this.createBranch(current, childBranch, targetCommit, 'child-ready', { childBranches: [...childBranches, childBranch] });
        }
        if (['child-ready', 'running'].includes(current.branchProgress.phase)) {
            await this.requireBranch(current.branchProgress.checkoutPath, current.branchProgress.expectedBranch);
            if (current.branchProgress.phase === 'child-ready') await this.requireClean(current.branchProgress.checkoutPath);
            await this.watch(current);
        }

        return current;
    }

    reserveBranches(schedule) {
        const { checkoutPath, sequenceBranch, childBranch, childBranches } = schedule.branchProgress;
        const branches = [sequenceBranch, ...childBranches, ...(childBranch ? [childBranch] : [])];
        this.checkoutOwnershipService.reserveBranches(checkoutPath, schedule.id, branches);
    }

    acquire(scheduleId, checkoutPath) {
        if (this.leases.has(scheduleId)) return;
        this.leases.set(scheduleId, checkoutOwnershipService.acquire(checkoutPath, scheduleId, true));
    }

    release(scheduleId) {
        this.watchers.get(scheduleId)?.();
        this.watchers.delete(scheduleId);
        this.leases.get(scheduleId)?.();
        this.leases.delete(scheduleId);
    }

    stop() {
        for (const scheduleId of this.leases.keys()) this.release(scheduleId);
    }

    async requireLinkedCheckout(progress) {
        await this.worktreeService.refreshLocal();
        const records = this.worktreeService.getRecords(this.project);
        const expectedCheckoutKey = CheckoutOwnershipService.key(progress.checkoutPath);
        const record = records.find(({ path: checkoutPath }) => CheckoutOwnershipService.key(checkoutPath) === expectedCheckoutKey);
        if (!record?.valid) throw new Error(`Sequence worktree is missing or invalid: ${progress.checkoutPath}`);
        await this.worktreeService.requireRepositoryMatch(this.project, record);
    }

    async createBranch(schedule, branch, baseCommit, nextPhase, fields = {}) {
        const { checkoutPath, expectedBranch } = schedule.branchProgress;
        const actualBranch = await this.git(checkoutPath, ['branch', '--show-current']);
        await this.requireClean(checkoutPath);
        if (actualBranch === branch) {
            if (await this.git(checkoutPath, ['rev-parse', 'HEAD']) !== baseCommit) throw new Error('Cannot recover sequence branch creation: unexpected commit');
        } else {
            await this.requireBranch(checkoutPath, expectedBranch);
            await this.git(checkoutPath, ['check-ref-format', '--branch', branch]);
            if (await this.worktreeService.branchExists(checkoutPath, branch)) throw new Error(`Sequence branch already exists: ${branch}`);
            await this.git(checkoutPath, ['switch', '-c', branch, baseCommit]);
        }

        return this.persist(schedule, nextPhase, { ...fields, expectedBranch: branch });
    }

    async context(schedule, context) {
        const { checkoutPath, expectedBranch } = schedule.branchProgress;
        await this.requireLinkedCheckout(schedule.branchProgress);
        await this.requireBranch(checkoutPath, expectedBranch);
        const records = this.worktreeService.getRecords(this.project);
        const expectedCheckoutKey = CheckoutOwnershipService.key(checkoutPath);
        const index = records.findIndex(({ path: checkout }) => CheckoutOwnershipService.key(checkout) === expectedCheckoutKey);

        return {
            ...context,
            sequenceCheckoutPath: checkoutPath,
            sequenceId: schedule.id,
            worktree: String(index + 1),
            worktreeBranch: expectedBranch,
        };
    }

    integrate(schedule) {
        return runWithGitOperationContext({ checkoutOwnerId: schedule.id }, () => this.integrateNow(schedule));
    }

    async integrateNow(schedule) {
        let current = schedule;
        const { checkoutPath, sequenceBranch, childBranch } = current.branchProgress;
        await this.requireLinkedCheckout(current.branchProgress);
        if (['child-ready', 'running'].includes(current.branchProgress.phase)) {
            await this.requireBranch(checkoutPath, childBranch);
            await this.requireClean(checkoutPath);
            const sourceCommit = await this.git(checkoutPath, ['rev-parse', 'HEAD']);
            const sourceTree = await this.git(checkoutPath, ['rev-parse', 'HEAD^{tree}']);
            const targetCommit = await this.git(checkoutPath, ['rev-parse', sequenceBranch]);
            if (targetCommit !== current.branchProgress.targetCommit) throw new Error('Sequence target branch changed externally');
            await this.git(checkoutPath, ['merge-base', '--is-ancestor', targetCommit, sourceCommit]);
            current = await this.persist(current, 'switching-target', { sourceCommit, sourceTree });
        }
        if (current.branchProgress.phase === 'switching-target') {
            if (await this.git(checkoutPath, ['rev-parse', childBranch]) !== current.branchProgress.sourceCommit) {
                throw new Error('Sequence child branch changed externally');
            }
            if (await this.git(checkoutPath, ['rev-parse', sequenceBranch]) !== current.branchProgress.targetCommit) {
                throw new Error('Sequence target branch changed externally');
            }
            const branch = await this.git(checkoutPath, ['branch', '--show-current']);
            await this.requireClean(checkoutPath);
            if (branch === childBranch) await this.git(checkoutPath, ['switch', sequenceBranch]);
            else await this.requireBranch(checkoutPath, sequenceBranch);
            current = await this.persist(current, 'squashing', { expectedBranch: sequenceBranch });
        }
        if (current.branchProgress.phase === 'squashing') {
            await this.requireBranch(checkoutPath, sequenceBranch);
            if (await this.git(checkoutPath, ['rev-parse', 'HEAD']) !== current.branchProgress.targetCommit) throw new Error('Sequence target commit changed externally');
            const targetTree = await this.git(checkoutPath, ['rev-parse', 'HEAD^{tree}']);
            if (targetTree === current.branchProgress.sourceTree) {
                await this.requireClean(checkoutPath);
                current = await this.persist(current, 'integrated');
            } else {
                const dirty = await this.git(checkoutPath, ['status', '--porcelain']);
                if (!dirty) await this.git(checkoutPath, ['merge', '--squash', current.branchProgress.sourceCommit]);
                await this.requireSquashIndex(current.branchProgress);
                current = await this.persist(current, 'committing');
            }
        }
        if (current.branchProgress.phase === 'committing') {
            await this.requireBranch(checkoutPath, sequenceBranch);
            let integrationCommit = await this.git(checkoutPath, ['rev-parse', 'HEAD']);
            if (integrationCommit === current.branchProgress.targetCommit) {
                await this.requireSquashIndex(current.branchProgress);
                await this.git(checkoutPath, ['commit', '-m', INTEGRATION_LABEL]);
                integrationCommit = await this.git(checkoutPath, ['rev-parse', 'HEAD']);
            } else {
                const parent = await this.git(checkoutPath, ['rev-parse', 'HEAD^']);
                const tree = await this.git(checkoutPath, ['rev-parse', 'HEAD^{tree}']);
                const message = await this.git(checkoutPath, ['log', '-1', '--format=%s']);
                if (parent !== current.branchProgress.targetCommit || tree !== current.branchProgress.sourceTree || message !== INTEGRATION_LABEL) throw new Error('Cannot prove completed sequence integration');
            }
            await this.requireClean(checkoutPath);
            current = await this.persist(current, 'integrated', { integrationCommit });
        }
        if (['integrated', 'recording', 'recorded'].includes(current.branchProgress.phase)) {
            await this.requireBranch(checkoutPath, sequenceBranch);
            await this.requireClean(checkoutPath);
            const expectedCommit = current.branchProgress.integrationCommit ?? current.branchProgress.targetCommit;
            if (await this.git(checkoutPath, ['rev-parse', 'HEAD']) !== expectedCommit) throw new Error('Integrated sequence branch changed externally');
        }
        if (current.branchProgress.phase === 'integrated') current = await this.persist(current, 'recording');
        if (current.branchProgress.phase === 'recording') {
            if (current.branchProgress.integrationCommit) await this.recordIntegration(current);
            const childCommits = { ...current.branchProgress.childCommits, [childBranch]: current.branchProgress.sourceCommit };
            current = await this.persist(current, 'recorded', { childCommits });
        }
        if (current.branchProgress.phase !== 'recorded') throw new Error(`Unexpected sequence integration phase: ${current.branchProgress.phase}`);

        return current;
    }

    async requireSquashIndex(progress) {
        const { checkoutPath, sourceTree } = progress;
        if (await this.git(checkoutPath, ['diff', '--name-only'])) throw new Error('Sequence integration has unstaged changes');
        if (await this.git(checkoutPath, ['ls-files', '--others', '--exclude-standard'])) throw new Error('Sequence integration has untracked changes');
        if (await this.git(checkoutPath, ['write-tree']) !== sourceTree) throw new Error('Cannot prove sequence squash index; preserve checkout and resolve manually');
    }

    async recordIntegration(schedule) {
        const metadata = await this.localGitService.resolveCommitMetadata(this.project.rootPath, schedule.branchProgress.integrationCommit);
        const origin = { cardInternalId: schedule.cardInternalIds[schedule.currentIndex], kind: 'card' };
        const commit = { ...metadata, branch: schedule.branchProgress.sequenceBranch };
        const record = { commits: [commit], completedAt: metadata.committedAt, label: INTEGRATION_LABEL, origin, type: 'system' };
        await this.localGitService.appendAndCommitSystemActivity(this.project, this.projectFolder, origin, record, `Record ${INTEGRATION_LABEL} activity`);
    }

    finish(schedule) {
        return runWithGitOperationContext({ checkoutOwnerId: schedule.id }, () => this.finishNow(schedule));
    }

    async finishNow(schedule) {
        let current = schedule;
        const { checkoutPath, sequenceBranch, childBranches, childCommits, integrationCommit, targetCommit } = current.branchProgress;
        await this.requireBranch(checkoutPath, sequenceBranch);
        await this.requireClean(checkoutPath);
        if (await this.git(checkoutPath, ['rev-parse', 'HEAD']) !== (integrationCommit ?? targetCommit)) {
            throw new Error('Sequence result changed externally before cleanup');
        }
        if (current.branchProgress.phase === 'completed') return current;
        if (current.branchProgress.phase !== 'finishing') current = await this.persist(current, 'finishing');
        for (const childBranch of childBranches) {
            if (!await this.worktreeService.branchExists(checkoutPath, childBranch)) continue;
            if (!childBranch.startsWith(`${sequenceBranch}-card-`)) throw new Error(`Unowned sequence child branch: ${childBranch}`);
            if (!childCommits[childBranch]) throw new Error(`Missing completed child commit: ${childBranch}`);
            if (await this.git(checkoutPath, ['rev-parse', childBranch]) !== childCommits[childBranch]) {
                throw new Error(`Sequence child branch changed externally before cleanup: ${childBranch}`);
            }
        }
        for (const childBranch of childBranches) {
            if (await this.worktreeService.branchExists(checkoutPath, childBranch)) await this.git(checkoutPath, ['branch', '-D', childBranch]);
        }

        return this.persist(current, 'completed');
    }

    async persist(schedule, phase, fields = {}) {
        const next = await this.saveSequence({ ...schedule, branchProgress: { ...schedule.branchProgress, ...fields, phase } });
        if (this.leases.has(schedule.id)) this.reserveBranches(next);

        return next;
    }

    async requireClean(checkoutPath) {
        if (await this.git(checkoutPath, ['status', '--porcelain'])) throw new Error(`Sequence checkout has uncommitted changes: ${checkoutPath}`);
    }

    async requireBranch(checkoutPath, expectedBranch) {
        const branch = await this.git(checkoutPath, ['branch', '--show-current']);
        if (branch !== expectedBranch) throw new Error(`Sequence checkout is on ${branch || 'detached HEAD'}, expected ${expectedBranch}: ${checkoutPath}`);
    }

    async git(checkoutPath, argumentsValue) {
        const ownerId = currentGitOperationContext().checkoutOwnerId;
        if (ownerId && this.isCancelled(ownerId)) throw new Error('Sequence cancelled');
        return (await this.worktreeService.runGit(checkoutPath, argumentsValue)).trim();
    }

    async watch(schedule) {
        if (this.watchers.has(schedule.id)) return;
        const checkoutPath = schedule.branchProgress.checkoutPath;
        const project = { ...this.project, rootPath: checkoutPath, id: checkoutPath, branch: schedule.branchProgress.expectedBranch };
        const tracker = new CardStateTracker({
            readCardFile: async (cardPath) => {
                const file = await this.localGitService.loadFile(project, cardPath);

                return file.content;
            },
        });
        const { files } = await this.localGitService.loadProject(project, this.activeCardsFolder);
        tracker.seed(files);
        const close = this.localGitService.watchProject(
            project,
            (event) => this.observe(schedule.id, checkoutPath, tracker, event),
            (error) => this.onError(schedule.id, error),
        );
        this.watchers.set(schedule.id, close);
    }

    async observe(scheduleId, checkoutPath, tracker, event) {
        try {
            const transition = await tracker.observeChange(event);
            if (transition) await this.onStateChange(transition.cardInternalId, transition.state, checkoutPath);
        } catch (error) {
            await this.onError(scheduleId, error);
        }
    }
}

module.exports = { SequenceWorktreeExecution };
