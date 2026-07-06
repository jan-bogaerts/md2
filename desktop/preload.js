const { ipcRenderer } = require('electron')
const Store = require('electron-store')
const { readDesktopConfig, writeDesktopConfig } = require('./config')
const { requestGithubAccessToken, requestGithubDeviceCode } = require('./github_oauth_proxy')
const { AgentRunnerService } = require('./agent_runner_service')
const { ActionSchedulerService } = require('./action_scheduler_service')
const localGitService = require('./local_git_service')
const diffService = require('./diff_service')
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch')
const { resolveAgentCommand } = require('./agent_profiles')

const DATA_OPEN_PROJECT_FOLDER_CHANNEL = 'md2-data:open-project-folder'
const REMOTE_CONTROL_STATUS_CHANNEL = 'md2-remote-control:status'
const REMOTE_CONTROL_START_CHANNEL = 'md2-remote-control:start'
const REMOTE_CONTROL_STOP_CHANNEL = 'md2-remote-control:stop'
const REMOTE_CONTROL_GET_STATUS_CHANNEL = 'md2-remote-control:get-status'
const THEME_SET_MODE_CHANNEL = 'md2-theme:set-mode'
const REMARKABLE_TEST_CONNECTION_CHANNEL = 'md2-remarkable:test-connection'
const REMARKABLE_LIST_IMAGE_FILES_CHANNEL = 'md2-remarkable:list-image-files'
const REMARKABLE_IMPORT_FILES_CHANNEL = 'md2-remarkable:import-files'

const agentRunnerService = new AgentRunnerService()
const desktopConfigStore = new Store()
const actionSchedulerService = new ActionSchedulerService({
    agentCommandProvider: () => resolveAgentCommand(readDesktopConfig(desktopConfigStore)).command,
    agentConfigProvider: () => readDesktopConfig(desktopConfigStore),
    agentRunnerService,
    localGitService,
})

const githubAuthBridge = {
    requestAccessToken: (request) => requestGithubAccessToken(request),
    requestDeviceCode: (request) => requestGithubDeviceCode(request),
}

window.md2GithubAuth = githubAuthBridge

const themeBridge = { setThemeMode: (mode) => ipcRenderer.send(THEME_SET_MODE_CHANNEL, mode) }

window.md2Theme = themeBridge

const configBridge = {
    getDesktopConfig: () => readDesktopConfig(desktopConfigStore),
    setDesktopConfig: (values) => writeDesktopConfig(desktopConfigStore, values),
}

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

const localBridgeDispatch = createLocalBridgeDispatch({
    actionSchedulerService,
    agentRunnerService,
    desktopConfigStore,
    diffService,
    localGitService,
    openProjectFolder: () => ipcRenderer.invoke(DATA_OPEN_PROJECT_FOLDER_CHANNEL),
    readDesktopConfig,
})

window.md2Data = localBridgeDispatch.dataBridge
window.md2Actions = localBridgeDispatch.actionBridge

window.addEventListener('beforeunload', () => {
    actionSchedulerService.stop()
    agentRunnerService.stopAll()
})
