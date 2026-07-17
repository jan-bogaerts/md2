const { resolveAgentCommand } = require('../actions/agent_profiles.mjs');
const { resolveActionDefinition } = require('../actions/action_definition_resolver');

const WORKTREE_AGENT_REFERENCE_PATTERN = /^worktree:([1-9]\d*):(.*)$/u;
const SEARCH_AGENT_CARD_PATH = '.md2-search-regexp';
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
        actionWorktreeExecutionService,
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

    async function loadRequestAction(request, actionsFolder) {
        if (!request || typeof request !== 'object') throw new Error('Missing action request');
        if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing actionId');
        const { agentProfiles } = readDesktopConfig(desktopConfigStore);

        return resolveActionDefinition(localGitService, currentLocalProject, actionsFolder, agentProfiles, request.actionId);
    }

    async function resolveActionProject(request, actionsFolder) {
        if (!actionWorktreeExecutionService) throw new Error('Action worktree execution service is not available');

        const action = await loadRequestAction(request, actionsFolder);
        const resolution = await actionWorktreeExecutionService.resolve(currentLocalProject, action, request.context);

        return resolution.executionProject;
    }

    async function resolveRepositoryProject(repositoryRoot) {
        if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0) throw new Error('Missing execution repository root');

        const record = await worktreeService.resolvePath(currentLocalProject, repositoryRoot);

        return { ...currentLocalProject, branch: record.branch, id: record.path, rootPath: record.path };
    }

    async function resolveAgentReference(reference) {
        const match = WORKTREE_AGENT_REFERENCE_PATTERN.exec(reference);
        if (!match) return { path: reference, project: currentLocalProject };

        const record = await worktreeService.resolve(currentLocalProject, Number.parseInt(match[1], 10));

        return {
            path: match[2],
            project: { ...currentLocalProject, branch: record.branch, id: record.path, rootPath: record.path },
        };
    }

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
        listRepositoryFiles: (project) => localGitService.listRepositoryFiles(project),
        listTopLevelFolders: (project) => localGitService.listTopLevelFolders(project),
        loadWorktrees: (project) => worktreeService.load(project),
        loadActionFiles: (project, actionsFolder) => localGitService.loadActionFiles(project, actionsFolder),
        loadActionSchedules: (project, actionsFolder) => localGitService.loadActionSchedules(project, actionsFolder),
        loadAgentConversation: async (reference) => {
            const resolved = await resolveAgentReference(reference);
            const conversation = await localGitService.loadAgentConversation(resolved.project, resolved.path);

            return { ...conversation, path: reference };
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
        selectWorktreeFolder: async (registeredFolders) => {
            if (!openWorktreeFolder) throw new Error('Worktree folder picker is not available');

            const folderPath = await openWorktreeFolder();
            if (!folderPath) return null;

            return worktreeService.validateForAdd(currentLocalProject, folderPath, registeredFolders);
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
        saveWorktrees: (project, folders) => worktreeService.save(project, folders),
        stopAgent: (runId) => agentRunnerService.stop(runId),
        watchProject: (project, callback) => localGitService.watchProject(project, (event) => {
            if (actionSchedulerService) void actionSchedulerService.handleProjectChange(event);
            callback(event);
        }),
    };

    const actionBridge = {
        generateDiff: async (request) => {
            const project = await resolveRepositoryProject(request.repositoryRoot);
            const result = await diffService.generateDiff(project, request);

            return { ...result, repositoryRoot: project.rootPath };
        },
        loadActionRunHistory: async (request) => {
            if (!actionRunnerService) throw new Error('Action runner is not available');

            const actionsFolder = actionRunnerService.requireActionsFolder();
            const projectFolder = actionRunnerService.requireProjectFolder();
            const project = await resolveActionProject(request, actionsFolder);
            const historyRequest = { ...request, projectFolder };

            return localGitService.loadActionRunHistory(project, historyRequest);
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
        openInEditor: async (request) => diffService.openInEditor(await resolveRepositoryProject(request.repositoryRoot), request),
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
                cardPath: SEARCH_AGENT_CARD_PATH,
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
