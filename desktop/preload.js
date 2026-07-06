const { ipcRenderer } = require('electron')
const { resolveDesktopConfig } = require('./config')
const { requestGithubAccessToken, requestGithubDeviceCode } = require('./github_oauth_proxy')
const { AgentRunnerService } = require('./agent_runner_service')
const localGitService = require('./local_git_service')
const diffService = require('./diff_service')

const DATA_OPEN_PROJECT_FOLDER_CHANNEL = 'md2-data:open-project-folder'
const DATA_MENU_PUSH_CHANNEL = 'md2-data:menu-push'
const REMOTE_CONTROL_STATUS_CHANNEL = 'md2-remote-control:status'
const REMOTE_CONTROL_START_CHANNEL = 'md2-remote-control:start'
const REMOTE_CONTROL_STOP_CHANNEL = 'md2-remote-control:stop'
const REMOTE_CONTROL_GET_STATUS_CHANNEL = 'md2-remote-control:get-status'
const THEME_SET_MODE_CHANNEL = 'md2-theme:set-mode'
const REMARKABLE_TEST_CONNECTION_CHANNEL = 'md2-remarkable:test-connection'
const REMARKABLE_LIST_IMAGE_FILES_CHANNEL = 'md2-remarkable:list-image-files'
const REMARKABLE_IMPORT_FILES_CHANNEL = 'md2-remarkable:import-files'

let currentLocalProject = null
const agentRunnerService = new AgentRunnerService()

function createLocalProject(rootPath) {
    return {
        branch: 'main',
        id: rootPath,
        rootPath,
    }
}

const githubAuthBridge = {
    requestAccessToken: (request) => requestGithubAccessToken(request),
    requestDeviceCode: (request) => requestGithubDeviceCode(request),
}

window.md2GithubAuth = githubAuthBridge

const themeBridge = { setThemeMode: (mode) => ipcRenderer.send(THEME_SET_MODE_CHANNEL, mode) }

window.md2Theme = themeBridge

const configBridge = { getDesktopConfig: () => resolveDesktopConfig() }

window.md2Config = configBridge

const remoteControlBridge = {
    getStatus: () => ipcRenderer.invoke(REMOTE_CONTROL_GET_STATUS_CHANNEL),
    onStatusChange: (callback) => {
        const listener = (_event, status) => callback(status)
        ipcRenderer.on(REMOTE_CONTROL_STATUS_CHANNEL, listener)

        return () => ipcRenderer.removeListener(REMOTE_CONTROL_STATUS_CHANNEL, listener)
    },
    start: () => ipcRenderer.invoke(REMOTE_CONTROL_START_CHANNEL),
    stop: () => ipcRenderer.invoke(REMOTE_CONTROL_STOP_CHANNEL),
}

window.md2RemoteControl = remoteControlBridge

const remarkableBridge = {
    importFiles: (request) => ipcRenderer.invoke(REMARKABLE_IMPORT_FILES_CHANNEL, request),
    listImageFiles: (settings) => ipcRenderer.invoke(REMARKABLE_LIST_IMAGE_FILES_CHANNEL, settings),
    testConnection: (settings) => ipcRenderer.invoke(REMARKABLE_TEST_CONNECTION_CHANNEL, settings),
}

window.md2Remarkable = remarkableBridge

const dataBridge = {
    checkoutBranch: async (project, branch) => {
        currentLocalProject = await localGitService.checkoutBranch(project, branch)

        return currentLocalProject
    },
    commit: (request) => localGitService.commit(request, currentLocalProject),
    continueAgentConversation: (request) => {
        const { agent } = resolveDesktopConfig()

        return localGitService.continueAgentConversation(currentLocalProject, { ...request, command: agent })
    },
    createProject: (project, workingFolder) => localGitService.createProject(project, workingFolder),
    listBranches: (project) => localGitService.listBranches(project),
    listRepositoryFiles: (project) => localGitService.listRepositoryFiles(project),
    loadActionFiles: (project, actionsFolder) => localGitService.loadActionFiles(project, actionsFolder),
    loadAgentConversation: (path) => localGitService.loadAgentConversation(currentLocalProject, path),
    loadProject: async (project, workingFolder) => {
        currentLocalProject = project

        return localGitService.loadProject(project, workingFolder)
    },
    loadProjectConfig: (project) => localGitService.loadProjectConfig(project),
    onMenuPush: (callback) => {
        const listener = () => callback()
        ipcRenderer.on(DATA_MENU_PUSH_CHANNEL, listener)

        return () => ipcRenderer.removeListener(DATA_MENU_PUSH_CHANNEL, listener)
    },
    openProjectFolder: async () => {
        const rootPath = await ipcRenderer.invoke(DATA_OPEN_PROJECT_FOLDER_CHANNEL)
        if (!rootPath) return null

        const project = createLocalProject(rootPath)
        await localGitService.assertGitRoot(project.rootPath)
        currentLocalProject = project

        return project
    },
    push: (project) => localGitService.push(project),
    saveProjectConfig: (project, config) => localGitService.saveProjectConfig(project, config),
    sendAgentInput: (runId, input) => agentRunnerService.sendInput(runId, input),
    startAgentConversation: (request, callback) => {
        const { agent } = resolveDesktopConfig()

        return agentRunnerService.start(currentLocalProject, { ...request, command: agent }, callback)
    },
    stopAgent: (runId) => agentRunnerService.stop(runId),
    watchProject: (project, callback) => localGitService.watchProject(project, callback),
}

window.md2Data = dataBridge

const actionBridge = {
    appendActionRunHistory: (request, entry) => localGitService.appendActionRunHistory(currentLocalProject, request, entry),
    generateDiff: (request) => diffService.generateDiff(currentLocalProject, request),
    loadActionRunHistory: (request) => localGitService.loadActionRunHistory(currentLocalProject, request),
    openInEditor: (request) => diffService.openInEditor(currentLocalProject, request),
    runAgent: (request, callback) => agentRunnerService.run(currentLocalProject, request, callback),
    runCommand: (command) => localGitService.runCommand(currentLocalProject, command),
}

window.md2Actions = actionBridge

window.addEventListener('beforeunload', () => {
    agentRunnerService.stopAll()
})
