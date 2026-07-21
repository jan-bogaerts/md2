const { resolveAgentCommand } = require('../actions/agent_profiles.mjs');

const SEARCH_AGENT_PROMPT_PREFIX = 'Return only a single JavaScript-compatible regular expression pattern (no explanation, no surrounding text or markdown) that matches the following search request:\n\n';

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
        agentExecutableAvailability,
        agentRunnerService,
        desktopConfigStore,
        diffService,
        localGitService,
        openProjectFolder,
        openWorktreeFolder,
        readDesktopConfig,
        worktreeService,
    } = dependencies;
    let currentLocalProject = null;

    const dataBridge = {
        checkoutBranch: async (project, branch) => {
            currentLocalProject = await localGitService.checkoutBranch(project, branch);
            if (actionSchedulerService) await actionSchedulerService.startProject(currentLocalProject);

            return currentLocalProject;
        },
        cancelActionSchedule: (project, actionsFolder, scheduleId) => {
            if (actionSchedulerService) return actionSchedulerService.cancelActionSchedule(scheduleId);

            return localGitService.cancelActionSchedule(project, actionsFolder, scheduleId);
        },
        commit: (request) => localGitService.commit(request, currentLocalProject),
        createProject: (project, workingFolder) => localGitService.createProject(project, workingFolder),
        createWorkingFolderFromTemplate: (project, workingFolder) => (
            localGitService.createWorkingFolderFromTemplate(project, workingFolder)
        ),
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
        loadWorktrees: (project) => worktreeService.load(project),
        loadActionFiles: (project, actionsFolder) => localGitService.loadActionFiles(project, actionsFolder),
        loadActionSchedules: (project, actionsFolder) => localGitService.loadActionSchedules(project, actionsFolder),
        loadAgentConversation: async (reference) => {
            return localGitService.loadAgentConversation(currentLocalProject, reference);
        },
        loadAgentAvailability: () => {
            const { agentProfiles } = readDesktopConfig(desktopConfigStore);

            return agentExecutableAvailability(agentProfiles);
        },
        loadFile: (project, path) => localGitService.loadFile(project, path),
        loadProjectAsset: (project, path) => localGitService.loadProjectAsset(project, path),
        loadProject: async (project, workingFolder) => {
            currentLocalProject = project;
            if (actionSchedulerService) await actionSchedulerService.startProject(project);

            return localGitService.loadProject(project, workingFolder);
        },
        loadProjectConfig: (project) => localGitService.loadProjectConfig(project),
        loadProjectRoot: async (project, workingFolder) => {
            currentLocalProject = project;
            if (actionSchedulerService) await actionSchedulerService.startProject(project);

            return localGitService.loadProjectRoot(project, workingFolder);
        },
        moveFiles: (request) => localGitService.moveFiles(request, currentLocalProject),
        openProjectFolder: async () => {
            if (!openProjectFolder) throw new Error('Project folder picker is not available');

            const rootPath = await openProjectFolder();
            if (!rootPath) return null;

            const project = await localGitService.resolveLocalProject(rootPath);
            currentLocalProject = project;
            if (actionSchedulerService) await actionSchedulerService.startProject(project);

            return project;
        },
        addWorktree: async (project) => {
            if (!openWorktreeFolder) throw new Error('Worktree folder picker is not available');

            const folderPath = await openWorktreeFolder();
            if (!folderPath) return null;

            return worktreeService.add(project, folderPath);
        },
        push: (project) => localGitService.push(project),
        resolveProject: async (project) => {
            const resolvedProject = await localGitService.resolveLocalProject(project.rootPath);
            currentLocalProject = resolvedProject;
            if (actionSchedulerService) await actionSchedulerService.startProject(resolvedProject);

            return resolvedProject;
        },
        saveActionSchedules: (project, actionsFolder, schedules) => localGitService.saveActionSchedules(project, actionsFolder, schedules),
        saveProjectConfig: (project, config) => localGitService.saveProjectConfig(project, config),
        removeWorktree: (project, folderPath) => worktreeService.remove(project, folderPath),
        stopAgent: (runId) => agentRunnerService.stop(runId),
        watchProject: (project, callback) => localGitService.watchProject(project, (event) => {
            if (actionSchedulerService) void actionSchedulerService.handleProjectChange(event);
            callback(event);
        }),
    };

    const actionBridge = {
        generateDiff: async (request) => {
            const result = await diffService.generateDiff(currentLocalProject, request);

            return { ...result, repositoryRoot: currentLocalProject.rootPath };
        },
        loadActionRunHistory: async (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            const projectFolder = actionRunnerService.requireProjectFolder();
            const historyRequest = { ...request, projectFolder };

            return localGitService.loadActionRunHistory(currentLocalProject, historyRequest);
        },
        loadCardActivity: async (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');
            if (!request || typeof request.cardInternalId !== 'string' || request.cardInternalId.length === 0) {
                throw new Error('Missing card activity cardInternalId');
            }
            const projectFolder = actionRunnerService.requireProjectFolder();
            const worktrees = await worktreeService.load(currentLocalProject);

            return localGitService.loadCardActivity(currentLocalProject, projectFolder, request.cardInternalId, worktrees);
        },
        loadAgentAvailability: () => {
            const { agentProfiles } = readDesktopConfig(desktopConfigStore);

            return agentExecutableAvailability(agentProfiles);
        },
        cancelActionExecution: (executionId) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.cancel(executionId);
        },
        onActionExecution: (callback) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.subscribe(callback);
        },
        openInEditor: async (request) => diffService.openInEditor(currentLocalProject, request),
        prepareActionPrompt: (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.prepareActionPrompt(request);
        },
        readFileAtCommit: (request) => localGitService.readFileAtCommit(currentLocalProject, request),
        registerActionSchedule: (request) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available');

            return actionSchedulerService.registerActionSchedule(request);
        },
        runSearchRegexpAgent: async (input, callback) => {
            if (typeof input !== 'string' || input.length === 0) throw new Error('Missing regular expression search input');

            const resolved = resolveSearchAgent(readDesktopConfig(desktopConfigStore));
            const projectConfig = await localGitService.loadProjectConfig(currentLocalProject);
            const projectFolder = typeof projectConfig?.projectFolder === 'string' ? projectConfig.projectFolder : '';
            const request = {
                agent: resolved.agent,
                activityOrigin: { kind: 'project' },
                activityProject: currentLocalProject,
                command: resolved.command,
                prompt: `${SEARCH_AGENT_PROMPT_PREFIX}${input}`,
                projectFolder,
                title: 'Search RegExp',
            };
            const result = await agentRunnerService.run(currentLocalProject, request, callback);

            return result.stdout;
        },
        startAction: (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            return actionRunnerService.start(request);
        },
    };

    const methods = { ...dataBridge, ...actionBridge };

    return {
        actionBridge,
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
