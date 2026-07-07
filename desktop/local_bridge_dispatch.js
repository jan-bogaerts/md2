const { buildResumeAgentCommand, resolveAgentCommand } = require('./agent_profiles')

function resolveStartAgentRequest(config, request) {
    const resolved = resolveAgentCommand(config)
    const command = typeof request.nativeResumeSessionId === 'string' && request.nativeResumeSessionId.length > 0 && resolved.profile.resumeCommand
        ? buildResumeAgentCommand(resolved.profile, request.nativeResumeSessionId)
        : resolved.command

    return {
        ...request,
        command,
        ...(resolved.profile.sessionIdPattern ? { sessionIdPattern: resolved.profile.sessionIdPattern } : {}),
    }
}

function createLocalProject(rootPath) {
    return {
        branch: 'main',
        id: rootPath,
        rootPath,
    }
}

function createLocalBridgeDispatch(dependencies) {
    const {
        actionSchedulerService,
        agentRunnerService,
        desktopConfigStore,
        diffService,
        localGitService,
        openProjectFolder,
        readDesktopConfig,
    } = dependencies
    let currentLocalProject = null

    const dataBridge = {
        checkoutBranch: async (project, branch) => {
            currentLocalProject = await localGitService.checkoutBranch(project, branch)
            if (actionSchedulerService) await actionSchedulerService.startProject(currentLocalProject)

            return currentLocalProject
        },
        cancelActionSchedule: (project, actionsFolder, scheduleId) => {
            if (actionSchedulerService) return actionSchedulerService.cancelActionSchedule(scheduleId)

            return localGitService.cancelActionSchedule(project, actionsFolder, scheduleId)
        },
        commit: (request) => localGitService.commit(request, currentLocalProject),
        createProject: (project, workingFolder) => localGitService.createProject(project, workingFolder),
        createWorkingFolderFromTemplate: (project, workingFolder) => (
            localGitService.createWorkingFolderFromTemplate(project, workingFolder)
        ),
        deleteFile: (request) => localGitService.deleteFile(request, currentLocalProject),
        listBranches: (project) => localGitService.listBranches(project),
        listRepositoryFiles: (project) => localGitService.listRepositoryFiles(project),
        listTopLevelFolders: (project) => localGitService.listTopLevelFolders(project),
        loadActionFiles: (project, actionsFolder) => localGitService.loadActionFiles(project, actionsFolder),
        loadActionSchedules: (project, actionsFolder) => localGitService.loadActionSchedules(project, actionsFolder),
        loadAgentConversation: (path) => localGitService.loadAgentConversation(currentLocalProject, path),
        loadFile: (project, path) => localGitService.loadFile(project, path),
        loadProjectAsset: (project, path) => localGitService.loadProjectAsset(project, path),
        loadProject: async (project, workingFolder) => {
            currentLocalProject = project
            if (actionSchedulerService) await actionSchedulerService.startProject(project)

            return localGitService.loadProject(project, workingFolder)
        },
        loadProjectConfig: (project) => localGitService.loadProjectConfig(project),
        loadProjectRoot: async (project, workingFolder) => {
            currentLocalProject = project
            if (actionSchedulerService) await actionSchedulerService.startProject(project)

            return localGitService.loadProjectRoot(project, workingFolder)
        },
        moveFiles: (request) => localGitService.moveFiles(request, currentLocalProject),
        openProjectFolder: async () => {
            if (!openProjectFolder) throw new Error('Project folder picker is not available')

            const rootPath = await openProjectFolder()
            if (!rootPath) return null

            const project = createLocalProject(rootPath)
            await localGitService.assertGitRoot(project.rootPath)
            currentLocalProject = project
            if (actionSchedulerService) await actionSchedulerService.startProject(project)

            return project
        },
        push: (project) => localGitService.push(project),
        saveActionSchedules: (project, actionsFolder, schedules) => localGitService.saveActionSchedules(project, actionsFolder, schedules),
        saveProjectConfig: (project, config) => localGitService.saveProjectConfig(project, config),
        sendAgentInput: (runId, input) => agentRunnerService.sendInput(runId, input),
        startAgentConversation: (request, callback) => {
            const agentRequest = resolveStartAgentRequest(readDesktopConfig(desktopConfigStore), request)

            return agentRunnerService.start(currentLocalProject, agentRequest, callback)
        },
        stopAgent: (runId) => agentRunnerService.stop(runId),
        watchProject: (project, callback) => localGitService.watchProject(project, (event) => {
            if (actionSchedulerService) void actionSchedulerService.handleProjectChange(event)
            callback(event)
        }),
    }

    const actionBridge = {
        appendActionRunHistory: (request, entry) => localGitService.appendActionRunHistory(currentLocalProject, request, entry),
        generateDiff: (request) => diffService.generateDiff(currentLocalProject, request),
        loadActionRunHistory: (request) => localGitService.loadActionRunHistory(currentLocalProject, request),
        notifyActionCompleted: (actionName) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available')

            return actionSchedulerService.handleActionCompleted(actionName)
        },
        onScheduledActionRun: (callback) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available')

            return actionSchedulerService.subscribeRunEvents(callback)
        },
        openInEditor: (request) => diffService.openInEditor(currentLocalProject, request),
        registerActionSchedule: (request) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available')

            return actionSchedulerService.registerActionSchedule(request)
        },
        runAgent: (request, callback) => agentRunnerService.run(currentLocalProject, request, callback),
        runCommand: (command) => localGitService.runCommand(currentLocalProject, command),
    }

    const methods = { ...dataBridge, ...actionBridge }

    return {
        actionBridge,
        dataBridge,
        invoke: (method, params = []) => {
            const handler = methods[method]
            if (!handler) throw new Error(`Unknown remote-control method: ${method}`)
            if (!Array.isArray(params)) throw new Error('Remote-control params must be an array')

            return handler(...params)
        },
    }
}

module.exports = { createLocalBridgeDispatch, createLocalProject }
