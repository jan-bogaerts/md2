const { buildResumeAgentCommand, resolveAgentCommand } = require('../actions/agent_profiles.mjs')
const { loadActionDefinitions } = require('../actions/action_scheduler_service')

const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|file|prompt)\s*\}\}/gu
const PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*prompt\s*\}\}/u
const WORKTREE_AGENT_REFERENCE_PATTERN = /^worktree:([1-9]\d*):(.*)$/u

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

function resolveRunAgentRequest(config, request, action = null) {
    if (!request || typeof request !== 'object') throw new Error('Missing agent request')

    const resolved = resolveAgentCommand(config, {
        ...(typeof request.agent === 'string' && request.agent.length > 0
            ? { agent: request.agent }
            : (typeof action?.agent === 'string' && action.agent.length > 0 ? { agent: action.agent } : {})),
        ...(typeof request.model === 'string'
            ? { model: request.model }
            : (typeof action?.model === 'string' ? { model: action.model } : {})),
        ...(request.thinkingLevel !== undefined
            ? { thinkingLevel: request.thinkingLevel }
            : (typeof action?.thinkingLevel === 'string' ? { thinkingLevel: action.thinkingLevel } : {})),
    })

    return {
        ...request,
        agent: resolved.agent,
        command: resolved.command,
        model: resolved.model,
        thinkingLevel: resolved.thinkingLevel,
        ...(resolved.profile.sessionIdPattern ? { sessionIdPattern: resolved.profile.sessionIdPattern } : {}),
    }
}

function withAgentMetadata(result, request) {
    return { ...result, agent: request.agent, model: request.model, thinkingLevel: request.thinkingLevel }
}

function resolvePlaceholders(text, context, project, extraInput) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'rootProjectFolder') {
            if (!project.rootPath) throw new Error('Cannot resolve rootProjectFolder without a local project rootPath')

            return project.rootPath
        }

        if (name === 'prompt') return extraInput
        if (!context.file) throw new Error('Cannot resolve file placeholder without a file context')

        return context.file
    })
}

function validateActionCommandRequest(request) {
    if (!request || typeof request !== 'object') throw new Error('Missing command action request')
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing command actionId')
    if (typeof request.actionsFolder !== 'string' || request.actionsFolder.length === 0) throw new Error('Missing command actionsFolder')
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing command context')
}

function resolveActionPrompt(action, context, project, extraInput) {
    const resolvedText = resolvePlaceholders(action.prompt, context, project, extraInput)
    if (PROMPT_PLACEHOLDER_PATTERN.test(action.prompt) || extraInput.trim().length === 0) return resolvedText

    return `${resolvedText}\n\n${extraInput}`
}

function createLocalBridgeDispatch(dependencies) {
    const {
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
    } = dependencies
    let currentLocalProject = null

    async function loadRequestAction(request) {
        if (!request || typeof request !== 'object') throw new Error('Missing action request')
        if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing actionId')
        if (typeof request.actionsFolder !== 'string' || request.actionsFolder.length === 0) throw new Error('Missing actionsFolder')

        const files = await localGitService.loadActionFiles(currentLocalProject, request.actionsFolder)
        const { agentProfiles } = readDesktopConfig(desktopConfigStore)
        const actions = loadActionDefinitions(files, { profiles: agentProfiles })
        const action = actions.find((candidate) => candidate.id === request.actionId)
        if (!action) throw new Error(`Unknown action: ${request.actionId}`)

        return action
    }

    async function resolveActionProject(request) {
        if (!actionWorktreeExecutionService) throw new Error('Action worktree execution service is not available')

        const action = await loadRequestAction(request)
        const resolution = await actionWorktreeExecutionService.resolve(currentLocalProject, action, request.context)

        return resolution.executionProject
    }

    async function resolveRepositoryProject(repositoryRoot) {
        if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0) throw new Error('Missing execution repository root')

        const record = await worktreeService.resolvePath(currentLocalProject, repositoryRoot)

        return { ...currentLocalProject, branch: record.branch, id: record.path, rootPath: record.path }
    }

    async function resolveAgentReference(reference) {
        const match = WORKTREE_AGENT_REFERENCE_PATTERN.exec(reference)
        if (!match) return { path: reference, project: currentLocalProject }

        const record = await worktreeService.resolve(currentLocalProject, Number.parseInt(match[1], 10))

        return {
            path: match[2],
            project: { ...currentLocalProject, branch: record.branch, id: record.path, rootPath: record.path },
        }
    }

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
        deleteFolder: (request) => localGitService.deleteFolder(request, currentLocalProject),
        hasPendingPush: (project) => localGitService.hasPendingPush(project),
        listBranches: (project) => localGitService.listBranches(project),
        listRepositoryFiles: (project) => localGitService.listRepositoryFiles(project),
        listTopLevelFolders: (project) => localGitService.listTopLevelFolders(project),
        loadWorktrees: (project) => worktreeService.load(project),
        loadActionFiles: (project, actionsFolder) => localGitService.loadActionFiles(project, actionsFolder),
        loadActionSchedules: (project, actionsFolder) => localGitService.loadActionSchedules(project, actionsFolder),
        loadAgentConversation: async (reference) => {
            const resolved = await resolveAgentReference(reference)
            const conversation = await localGitService.loadAgentConversation(resolved.project, resolved.path)

            return { ...conversation, path: reference }
        },
        loadAgentAvailability: () => {
            const { agentProfiles } = readDesktopConfig(desktopConfigStore)

            return agentExecutableAvailability(agentProfiles)
        },
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

            const project = await localGitService.resolveLocalProject(rootPath)
            currentLocalProject = project
            if (actionSchedulerService) await actionSchedulerService.startProject(project)

            return project
        },
        selectWorktreeFolder: async (registeredFolders) => {
            if (!openWorktreeFolder) throw new Error('Worktree folder picker is not available')

            const folderPath = await openWorktreeFolder()
            if (!folderPath) return null

            return worktreeService.validateForAdd(currentLocalProject, folderPath, registeredFolders)
        },
        push: (project) => localGitService.push(project),
        resolveProject: async (project) => {
            const resolvedProject = await localGitService.resolveLocalProject(project.rootPath)
            currentLocalProject = resolvedProject
            if (actionSchedulerService) await actionSchedulerService.startProject(resolvedProject)

            return resolvedProject
        },
        saveActionSchedules: (project, actionsFolder, schedules) => localGitService.saveActionSchedules(project, actionsFolder, schedules),
        saveProjectConfig: (project, config) => localGitService.saveProjectConfig(project, config),
        saveWorktrees: (project, folders) => worktreeService.save(project, folders),
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
        appendActionRunHistory: async (request, entry) => {
            const project = await resolveActionProject(request)

            return localGitService.appendActionRunHistory(project, request, entry)
        },
        generateDiff: async (request) => {
            const project = await resolveRepositoryProject(request.repositoryRoot)
            const result = await diffService.generateDiff(project, request)

            return { ...result, repositoryRoot: project.rootPath }
        },
        loadActionRunHistory: async (request) => {
            const project = await resolveActionProject(request)

            return localGitService.loadActionRunHistory(project, request)
        },
        notifyActionCompleted: (actionId) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available')

            return actionSchedulerService.handleActionCompleted(actionId)
        },
        onScheduledActionRun: (callback) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available')

            return actionSchedulerService.subscribeRunEvents(callback)
        },
        openInEditor: async (request) => diffService.openInEditor(await resolveRepositoryProject(request.repositoryRoot), request),
        registerActionSchedule: (request) => {
            if (!actionSchedulerService) throw new Error('Action scheduler is not available')

            return actionSchedulerService.registerActionSchedule(request)
        },
        runAgent: async (request, callback) => {
            if (!request?.actionId) {
                const agentRequest = resolveRunAgentRequest(readDesktopConfig(desktopConfigStore), request)
                const result = await agentRunnerService.run(currentLocalProject, agentRequest, callback)

                return withAgentMetadata(result, agentRequest)
            }
            if (!actionWorktreeExecutionService) throw new Error('Action worktree execution service is not available')

            const action = await loadRequestAction(request)
            if (action.type !== 'agent') throw new Error(`Action is not an agent: ${request.actionId}`)
            const agentRequest = resolveRunAgentRequest(readDesktopConfig(desktopConfigStore), request, action)

            return actionWorktreeExecutionService.execute(currentLocalProject, action, request.context, async (project) => {
                const prompt = resolveActionPrompt(action, request.context, project, request.extraInput ?? '')
                const executionRequest = { ...agentRequest, cardPath: request.context.file, prompt, title: action.label }
                const result = await agentRunnerService.run(project, executionRequest, callback)

                return withAgentMetadata(result, agentRequest)
            })
        },
        runCommand: async (request) => {
            validateActionCommandRequest(request)
            if (!actionWorktreeExecutionService) throw new Error('Action worktree execution service is not available')
            const action = await loadRequestAction(request)
            if (action.type !== 'command') throw new Error(`Action is not a command: ${request.actionId}`)

            return actionWorktreeExecutionService.execute(currentLocalProject, action, request.context, (project) => {
                const command = resolvePlaceholders(action.command, request.context, project, request.extraInput ?? '')

                return localGitService.runCommand(project, command)
            })
        },
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

module.exports = { createLocalBridgeDispatch }
