const { resolveAgentCommand } = require('../actions/agent/agent_profiles.mjs');
const { resolveProjectPaths } = require('../project/project_paths');

const INTEGRATION_ACTIVITY_LABEL = 'Integrate into project';
const WORKTREE_REMOVAL_MODES = new Set(['files', 'folder', 'unregister']);
const SEARCH_AGENT_PROMPT_PREFIX = 'Return only a single JavaScript-compatible regular expression pattern (no explanation, no surrounding text or markdown) that matches the following search request:\n\n';

function watchErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function cardIntegrationTracking(request) {
    const hasCardInternalId = Object.hasOwn(request, 'cardInternalId');
    const hasProjectFolder = Object.hasOwn(request, 'projectFolder');
    if (!hasCardInternalId && !hasProjectFolder) return null;
    if (typeof request.cardInternalId !== 'string' || request.cardInternalId.length === 0) {
        throw new Error('Missing worktree integration cardInternalId');
    }
    if (typeof request.projectFolder !== 'string') throw new Error('Missing worktree integration projectFolder');

    return { cardInternalId: request.cardInternalId, projectFolder: request.projectFolder };
}

function worktreeIntegrationMetadata(request) {
    const tracking = cardIntegrationTracking(request);
    const deleteBranch = request.deleteBranch === true;
    if (request.deleteBranch !== undefined && typeof request.deleteBranch !== 'boolean') {
        throw new Error('Invalid worktree integration deleteBranch value');
    }
    if (deleteBranch && (typeof request.branchName !== 'string' || request.branchName.length === 0)) {
        throw new Error('Missing worktree integration branchName');
    }

    return { ...(tracking ?? {}), branchName: request.branchName ?? null, deleteBranch };
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function resolveSearchAgent(config) {
    const resolved = resolveAgentCommand(config);

    return {
        agent: resolved.agent,
        command: resolved.command,
    };
}

function createLocalBridgeDispatch(dependencies) {
    const {
        actionRunnerService,
        actionSchedulerService,
        actionWorktreeRunService,
        agentExecutableAvailability,
        agentRunnerService,
        claudeRuntimeService,
        codexRuntimeService,
        desktopConfigStore,
        diffService,
        localGitService,
        mergeConflictService,
        openProjectFolder,
        openProjectSubFolder,
        openWorktreeFolder,
        projectStatsWorkerService,
        readDesktopConfig,
        saveDesktopConfig,
        updateCodexCli,
        worktreeService,
    } = dependencies;
    let currentLocalProject = null;

    function isCurrentProject(project) {
        return !!currentLocalProject
            && currentLocalProject.branch === project.branch
            && currentLocalProject.id === project.id
            && currentLocalProject.rootPath === project.rootPath;
    }

    async function activateProject(project) {
        if (isCurrentProject(project)) return;

        const conflictSession = mergeConflictService?.getInternalSession();
        const sameConflictProject = conflictSession
            && conflictSession.projectBranch === project.branch
            && conflictSession.projectRoot === project.rootPath;
        if (conflictSession && !sameConflictProject) {
            if (!currentLocalProject || currentLocalProject.rootPath !== conflictSession.projectRoot) {
                const conflictProject = {
                    branch: conflictSession.projectBranch,
                    id: conflictSession.projectId,
                    rootPath: conflictSession.projectRoot,
                };
                await worktreeService.startProject(conflictProject);
            }
            await worktreeService.abortConflict({ sessionId: conflictSession.id });
        }

        currentLocalProject = project;
        // The project config is read here, once, and the resolved paths are handed to each service.
        // The runner starts before the scheduler: a schedule reconciled by the scheduler can fire a
        // timer immediately, and firing calls into the runner.
        const projectConfig = await localGitService.loadProjectConfig(project);
        const projectPaths = resolveProjectPaths(projectConfig);
        if (actionRunnerService) await actionRunnerService.startProject(project, projectPaths, projectConfig?.states);
        if (actionSchedulerService) await actionSchedulerService.startProject(project, projectPaths.actionsFolder);
        await worktreeService.startProject(project);
        // Account usage polls run in this folder: Claude's per-folder trust question blocks a poll
        // started anywhere it has never run, which is why the poll waits for a project at all.
        if (agentRunnerService) {
            const { agentProfiles } = readDesktopConfig(desktopConfigStore);
            agentRunnerService.requestProjectUsageRefresh(project, agentProfiles);
        }
    }

    const dataBridge = {
        calculateActivityStats: (project, paths, calculationId) => {
            if (!isCurrentProject(project)) throw new Error('Stats calculation project is not active');
            if (!projectStatsWorkerService) throw new Error('Stats worker is not available');

            return projectStatsWorkerService.calculate(project.rootPath, paths, calculationId);
        },
        cancelActivityStatsCalculation: (calculationId) => {
            if (!projectStatsWorkerService) return undefined;

            return projectStatsWorkerService.cancel(calculationId);
        },
        checkoutBranch: async (project, branch) => {
            const checkedOutProject = await localGitService.checkoutBranch(project, branch);
            await activateProject(checkedOutProject);

            return currentLocalProject;
        },
        cancelActionSchedule: (project, actionsFolder, scheduleId) => {
            if (actionSchedulerService) return actionSchedulerService.cancelActionSchedule(scheduleId);

            return localGitService.cancelActionSchedule(project, actionsFolder, scheduleId);
        },
        commit: async (request) => {
            await localGitService.commit(request, currentLocalProject);

            return [];
        },
        createProject: async (project, folders) => {
            const createdProject = await localGitService.createProject(project, folders);
            await activateProject(createdProject);

            return currentLocalProject;
        },
        deleteFile: (request) => localGitService.deleteFile(request, currentLocalProject),
        deleteFolder: (request) => localGitService.deleteFolder(request, currentLocalProject),
        getActiveProject: () => currentLocalProject,
        hasPendingPush: (project) => localGitService.hasPendingPush(project),
        listBranches: (project) => localGitService.listBranches(project),
        listAgentConversationReferences: (project, projectFolder) => (
            localGitService.listAgentConversationReferences(project, projectFolder)
        ),
        listRepositoryFiles: (project) => localGitService.listRepositoryFiles(project),
        listTopLevelFolders: (project) => localGitService.listTopLevelFolders(project),
        loadActionFiles: (project, actionsFolder) => localGitService.loadActionFiles(project, actionsFolder),
        loadActionSchedules: (project, actionsFolder) => localGitService.loadActionSchedules(project, actionsFolder),
        loadAgentConversation: async (reference) => {
            return localGitService.loadAgentConversation(currentLocalProject, reference);
        },
        loadActivityConversations: async (activityPath) => {
            return localGitService.loadActivityConversations(currentLocalProject, activityPath);
        },
        loadAgentAvailability: () => {
            const { agentProfiles } = readDesktopConfig(desktopConfigStore);

            return agentExecutableAvailability(agentProfiles);
        },
        loadDesktopConfig: () => readDesktopConfig(desktopConfigStore),
        loadFile: (project, path) => localGitService.loadFile(project, path),
        loadTextFile: (project, path) => localGitService.loadTextFile(project, path),
        loadProjectAsset: (project, path) => localGitService.loadProjectAsset(project, path),
        loadProject: async (project, workingFolder, excludedRootFolder) => {
            await activateProject(project);
            if (excludedRootFolder === undefined) return localGitService.loadProject(project, workingFolder);

            return localGitService.loadProject(project, workingFolder, excludedRootFolder);
        },
        loadProjectConfig: (project) => localGitService.loadProjectConfig(project),
        loadProjectRoot: async (project, workingFolder) => {
            await activateProject(project);

            return localGitService.loadProjectRoot(project, workingFolder);
        },
        moveFiles: (request) => localGitService.moveFiles(request, currentLocalProject),
        openProjectFolder: async () => {
            if (!openProjectFolder) throw new Error('Project folder picker is not available');

            const rootPath = await openProjectFolder();
            if (!rootPath) return null;

            const project = await localGitService.resolveLocalProject(rootPath);
            await activateProject(project);

            return project;
        },
        addWorktree: (project, folderPath) => worktreeService.add(project, folderPath),
        prepareWorktree: (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree preparation request');

            return worktreeService.prepare(request.project, request.worktree, request.branchName);
        },
        commitWorktree: (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree commit request');

            return worktreeService.commit(request.project, request.worktree, request.message);
        },
        discardWorktreeChanges: (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree discard request');

            return worktreeService.discard(request.project, request.worktree);
        },
        deleteLocalBranch: (project, branchName) => worktreeService.deleteBranch(project, branchName),
        integrateWorktree: async (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree integration request');
            const metadata = worktreeIntegrationMetadata(request);
            const integration = await worktreeService.integrate(request.project, request.worktree, metadata);
            if (integration.status === 'conflict') return integration;

            await finalizeIntegration(request.project, request.worktree, integration, metadata, false);

            return { status: 'completed' };
        },
        abortMergeConflict: (request) => worktreeService.abortConflict(request),
        continueMergeConflict: async (request) => {
            const outcome = await worktreeService.continueConflict(request);
            if (outcome.status === 'conflict') return outcome;
            const session = outcome.session;
            await finalizeIntegration(
                { branch: session.projectBranch, id: session.projectId, rootPath: session.projectRoot },
                session.worktree,
                outcome,
                session.metadata,
                true,
                request,
            );
            worktreeService.completeConflict(request);

            return {
                ...(session.metadata.cardInternalId ? { cardInternalId: session.metadata.cardInternalId } : {}),
                ...(session.metadata.deleteBranch ? { branchDeleted: true } : {}),
                status: 'completed',
            };
        },
        getMergeConflictSession: () => mergeConflictService.verify(),
        launchMergeConflictResolver: (request) => mergeConflictService.launchResolver(request),
        markMergeConflictResolved: (request) => mergeConflictService.markResolved(request),
        onMergeConflictSessionChanged: (callback) => {
            const handleChanged = (event) => callback(event.detail);
            mergeConflictService.addEventListener('changed', handleChanged);
            callback(mergeConflictService.getSnapshot());

            return () => mergeConflictService.removeEventListener('changed', handleChanged);
        },
        rescanMergeConflict: (request) => mergeConflictService.rescan(request),
        parkWorktree: (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree parking request');

            return worktreeService.park(request.project, request.worktree);
        },
        pullWorktree: (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree pull request');

            return worktreeService.pull(request.project, request.worktree);
        },
        pull: (project) => worktreeService.pullPrimary(project),
        push: async (project) => {
            await localGitService.push(project);
            await worktreeService.refreshLocal();
        },
        pushWorktree: (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree push request');

            return worktreeService.push(request.project, request.worktree);
        },
        rebaseWorktree: (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree rebase request');

            return worktreeService.rebase(request.project, request.worktree);
        },
        onWorktreesChanged: (callback) => worktreeService.subscribe(callback),
        refreshWorktrees: (project) => worktreeService.refreshRemote(project),
        resolveProject: async (project) => {
            const resolvedProject = await localGitService.resolveLocalProject(project.rootPath);
            await activateProject(resolvedProject);

            return resolvedProject;
        },
        saveActionSchedules: (project, actionsFolder, schedules) => localGitService.saveActionSchedules(project, actionsFolder, schedules),
        saveProjectConfig: (project, config) => localGitService.saveProjectConfig(project, config),
        saveDesktopConfig: (values) => saveDesktopConfig(desktopConfigStore, values),
        selectProjectSubFolder: (rootPath) => {
            if (!openProjectSubFolder) throw new Error('Project folder picker is not available');
            if (typeof rootPath !== 'string' || rootPath.length === 0) throw new Error('Missing repository root path');

            return openProjectSubFolder(rootPath);
        },
        selectWorktreeFolder: () => {
            if (!openWorktreeFolder) throw new Error('Worktree folder picker is not available');

            return openWorktreeFolder();
        },
        removeWorktree: (project, folderPath, mode) => {
            if (!WORKTREE_REMOVAL_MODES.has(mode)) throw new Error(`Unknown worktree removal mode: ${String(mode)}`);

            return worktreeService.remove(project, folderPath, mode);
        },
        stopAgent: (runId) => agentRunnerService.stop(runId),
        watchProject: (project, callback) => localGitService.watchProject(
            project,
            (event) => {
                if (actionSchedulerService) void actionSchedulerService.handleProjectChange(event);
                callback(event);
            },
            (error) => callback({ error: watchErrorMessage(error) }),
        ),
    };

    async function finalizeIntegration(project, worktree, integration, metadata, activeConflict, conflictRequest = null) {
        if (!integration || typeof integration.commit !== 'string' || typeof integration.branch !== 'string') {
            throw new Error('Worktree integration returned no commit metadata');
        }
        let progress = metadata;
        const tracking = progress.cardInternalId && typeof progress.projectFolder === 'string'
            ? { cardInternalId: progress.cardInternalId, projectFolder: progress.projectFolder }
            : null;
        if (tracking && !progress.activityTracked) {
            try {
                const commitMetadata = await localGitService.resolveCommitMetadata(project.rootPath, integration.commit);
                const origin = { cardInternalId: tracking.cardInternalId, kind: 'card' };
                const commit = { ...commitMetadata, branch: integration.branch };
                const record = {
                    commits: [commit],
                    completedAt: commitMetadata.committedAt,
                    label: INTEGRATION_ACTIVITY_LABEL,
                    origin,
                    type: 'system',
                };
                await localGitService.appendAndCommitSystemActivity(
                    project,
                    tracking.projectFolder,
                    origin,
                    record,
                    `Record ${INTEGRATION_ACTIVITY_LABEL} activity`,
                );
                if (activeConflict) progress = mergeConflictService.updateMetadata(conflictRequest, { activityTracked: true });
            } catch (error) {
                throw new Error(`Worktree integrated, but card history tracking failed: ${errorMessage(error)}`, { cause: error });
            }
        }
        if (tracking && !progress.worktreeSynchronized) {
            try {
                if (activeConflict) await worktreeService.synchronizeConflict(project, worktree);
                else await worktreeService.synchronize(project, worktree);
                if (activeConflict) progress = mergeConflictService.updateMetadata(conflictRequest, { worktreeSynchronized: true });
            } catch (error) {
                throw new Error(`Worktree integrated and card history tracked, but linked worktree synchronization failed: ${errorMessage(error)}`, { cause: error });
            }
        }
        if (!progress.deleteBranch) return;
        try {
            if (activeConflict) {
                if (!progress.worktreeParked) {
                    await worktreeService.parkConflict(project, worktree);
                    progress = mergeConflictService.updateMetadata(conflictRequest, { worktreeParked: true });
                }
                await worktreeService.deleteBranchConflict(project, progress.branchName);
            } else {
                await worktreeService.park(project, worktree);
                await worktreeService.deleteBranch(project, progress.branchName);
            }
        } catch (error) {
            throw new Error(`Worktree integrated, but branch cleanup failed: ${errorMessage(error)}`, { cause: error });
        }
    }

    const actionBridge = {
        acquireReleaseCardLocks: (cardInternalIds) => (
            actionWorktreeRunService.acquireReleaseCardLocks(currentLocalProject, cardInternalIds)
        ),
        answerActionApproval: (runId, requestId, decision) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.answerAgentApproval(runId, requestId, decision);
        },
        answerActionQuestion: (runId, requestId, answers) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.answerAgentQuestion(runId, requestId, answers);
        },
        dismissActionQuestions: (runId, requestId) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.dismissAgentQuestions(runId, requestId);
        },
        deleteActionQueuedPrompt: (runId, promptId, revision) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.deleteQueuedAgentPrompt(runId, promptId, revision);
        },
        editActionQueuedPrompt: (runId, promptId, revision, content) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.editQueuedAgentPrompt(runId, promptId, revision, content);
        },
        enqueueActionPrompt: (runId, content) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.enqueueAgentPrompt(runId, content);
        },
        generateDiff: async (request) => {
            const result = await diffService.generateDiff(currentLocalProject, request);

            return { ...result, repositoryRoot: currentLocalProject.rootPath };
        },
        generateWorktreeDiff: async (request) => {
            if (!request || typeof request !== 'object') throw new Error('Missing worktree diff request');

            return diffService.generateWorktreeDiff(currentLocalProject, request, worktreeService);
        },
        loadActionRunHistory: async (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            const projectFolder = actionRunnerService.requireProjectFolder();
            const historyRequest = { ...request, projectFolder };

            return localGitService.loadActionRunHistory(currentLocalProject, historyRequest);
        },
        listActiveActionRuns: () => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.listActiveRuns();
        },
        loadActionRunRecoverySnapshot: (rendererRunIds) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.loadRunRecoverySnapshot(rendererRunIds);
        },
        notifyActionCardStateChange: (cardInternalId, state) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.handleCardStateChange(cardInternalId, state);
        },
        loadCardActivity: async (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');
            if (!request || typeof request.cardInternalId !== 'string' || request.cardInternalId.length === 0) {
                throw new Error('Missing card activity cardInternalId');
            }
            const projectFolder = actionRunnerService.requireProjectFolder();
            const worktrees = worktreeService.getRecords(currentLocalProject);

            return localGitService.loadCardActivity(currentLocalProject, projectFolder, request.cardInternalId, worktrees);
        },
        loadAgentAvailability: () => {
            const { agentProfiles } = readDesktopConfig(desktopConfigStore);

            return agentExecutableAvailability(agentProfiles);
        },
        cancelActionRun: (runId) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.cancel(runId);
        },
        closeWaitingActionConversation: (reference, status) => (
            localGitService.closeWaitingActivityConversation(currentLocalProject, reference, status)
        ),
        updateActionConversationViewed: (reference, viewed) => (
            localGitService.updateActivityConversationViewed(currentLocalProject, reference, viewed)
        ),
        updateCardActionSettings: async (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            const projectFolder = actionRunnerService.requireProjectFolder();
            await localGitService.updateCardActionSettings(
                currentLocalProject,
                projectFolder,
                request?.cardInternalId,
                request?.actionId,
                request?.settings,
            );
        },
        finishActionRun: (runId) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.finishAgentRun(runId);
        },
        onActionRun: (callback) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.subscribe(callback);
        },
        openInEditor: async (request) => {
            const { editorCommand } = readDesktopConfig(desktopConfigStore);
            const worktreeRoots = worktreeService.getRecords(currentLocalProject)
                .filter(({ valid }) => valid)
                .map(({ path: worktreePath }) => worktreePath);

            return diffService.openInEditor(currentLocalProject, request, { editorCommand, worktreeRoots });
        },
        prepareActionPrompt: (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.prepareActionPrompt(request);
        },
        readFileAtCommit: (request) => localGitService.readFileAtCommit(currentLocalProject, request),
        releaseReleaseCardLocks: (leaseId) => actionWorktreeRunService.releaseReleaseCardLocks(leaseId),
        registerActionSchedule: (request) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available');

            return actionSchedulerService.registerActionSchedule(request);
        },
        reserveActionConversation: (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.reserveConversation(request);
        },
        restartActionRun: (runId, request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.restart(runId, request);
        },
        runSearchRegexpAgent: async (input, callback) => {
            if (typeof input !== 'string' || input.length === 0) throw new Error('Missing regular expression search input');

            const resolved = resolveSearchAgent(readDesktopConfig(desktopConfigStore));
            const projectConfig = await localGitService.loadProjectConfig(currentLocalProject);
            const projectFolder = typeof projectConfig?.projectFolder === 'string' ? projectConfig.projectFolder : '';
            const configuredReleasesFolder = typeof projectConfig?.releasesFolder === 'string' ? projectConfig.releasesFolder : 'history';
            const releasesFolder = projectFolder.length > 0
                ? `${projectFolder.replace(/[\\/]$/u, '')}/${configuredReleasesFolder.replace(/^[\\/]/u, '')}`
                : configuredReleasesFolder;
            const request = {
                agent: resolved.agent,
                activityOrigin: { kind: 'project' },
                activityProject: currentLocalProject,
                command: resolved.command,
                prompt: `${SEARCH_AGENT_PROMPT_PREFIX}${input}`,
                projectFolder,
                releasesFolder,
                title: 'Search RegExp',
            };
            const result = await agentRunnerService.run(currentLocalProject, request, callback);

            return result.stdout;
        },
        sendActionMessage: (runId, content) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.sendAgentMessage(runId, content);
        },
        startAction: (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.start(request);
        },
        startUnattendedAction: (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.start(request, { interactive: false });
        },
    };

    const codexRuntimeBridge = {
        getCodexRateLimits: () => codexRuntimeService?.getSnapshot() ?? null,
        onCodexRateLimits: (callback) => {
            if (!codexRuntimeService) throw new Error('Codex runtime service is not available');

            return codexRuntimeService.subscribe(callback);
        },
        onCodexUpdateRequired: (callback) => {
            if (!codexRuntimeService) throw new Error('Codex runtime service is not available');

            return codexRuntimeService.subscribeUpdateRequired(callback);
        },
        updateCodexCli: async () => {
            if (!updateCodexCli) throw new Error('Codex CLI update is not available');

            await updateCodexCli();
        },
    };

    const claudeRuntimeBridge = {
        getClaudeRateLimits: () => claudeRuntimeService?.getSnapshot() ?? null,
        onClaudeRateLimits: (callback) => {
            if (!claudeRuntimeService) throw new Error('Claude runtime service is not available');

            return claudeRuntimeService.subscribe(callback);
        },
    };

    const methods = { ...dataBridge, ...actionBridge, ...claudeRuntimeBridge, ...codexRuntimeBridge };

    return {
        actionBridge,
        claudeRuntimeBridge,
        codexRuntimeBridge,
        dataBridge,
        invoke: (method, params = []) => {
            const handler = methods[method];
            if (!handler) throw new Error(`Unknown remote-control method: ${method}`);
            if (!Array.isArray(params)) throw new Error('Remote-control params must be an array');

            return handler(...params);
        },
    };
}

module.exports = { createLocalBridgeDispatch };
