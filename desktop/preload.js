const { contextBridge, ipcRenderer } = require('electron')

const CONFIG_SET_DESKTOP_CHANNEL = 'md2-config:set-desktop'
const GITHUB_AUTH_REQUEST_ACCESS_TOKEN_CHANNEL = 'md2-github-auth:request-access-token'
const GITHUB_AUTH_REQUEST_DEVICE_CODE_CHANNEL = 'md2-github-auth:request-device-code'
const LIFECYCLE_FLUSH_DONE_CHANNEL = 'md2-lifecycle:flush-pending-commits-done'
const LIFECYCLE_FLUSH_REQUEST_CHANNEL = 'md2-lifecycle:flush-pending-commits'
const LOCAL_BRIDGE_EVENT_CHANNEL = 'md2-local-bridge:event'
const LOCAL_BRIDGE_INVOKE_CHANNEL = 'md2-local-bridge:invoke'
const LOCAL_BRIDGE_SUBSCRIBE_CHANNEL = 'md2-local-bridge:subscribe'
const LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL = 'md2-local-bridge:unsubscribe'
const REMARKABLE_IMPORT_FILES_CHANNEL = 'md2-remarkable:import-files'
const REMARKABLE_LIST_IMAGE_FILES_CHANNEL = 'md2-remarkable:list-image-files'
const REMARKABLE_TEST_CONNECTION_CHANNEL = 'md2-remarkable:test-connection'
const REMOTE_CONTROL_GET_STATUS_CHANNEL = 'md2-remote-control:get-status'
const REMOTE_CONTROL_START_CHANNEL = 'md2-remote-control:start'
const REMOTE_CONTROL_STATUS_CHANNEL = 'md2-remote-control:status'
const REMOTE_CONTROL_STOP_CHANNEL = 'md2-remote-control:stop'
const THEME_SET_MODE_CHANNEL = 'md2-theme:set-mode'

const DATA_METHODS = [
    'cancelActionSchedule',
    'checkoutBranch',
    'commit',
    'createProject',
    'createWorkingFolderFromTemplate',
    'deleteFile',
    'listBranches',
    'listRepositoryFiles',
    'listTopLevelFolders',
    'loadActionFiles',
    'loadActionSchedules',
    'loadAgentConversation',
    'loadFile',
    'loadProject',
    'loadProjectAsset',
    'loadProjectConfig',
    'loadProjectRoot',
    'moveFiles',
    'openProjectFolder',
    'push',
    'resolveProject',
    'saveActionSchedules',
    'saveProjectConfig',
    'sendAgentInput',
    'startAgentConversation',
    'stopAgent',
]
const ACTION_METHODS = [
    'appendActionRunHistory',
    'generateDiff',
    'loadActionRunHistory',
    'notifyActionCompleted',
    'openInEditor',
    'registerActionSchedule',
    'runAgent',
    'runCommand',
]
const EVENT_METHODS = new Set(['runAgent', 'startAgentConversation'])

let nextEventId = 1
let desktopConfig = readArgumentJson('md2-desktop-config', {})

function readArgumentValue(name) {
    const prefix = `--${name}=`
    const argument = process.argv.find((candidate) => candidate.startsWith(prefix))

    return argument ? argument.slice(prefix.length) : null
}

function readArgumentJson(name, fallback) {
    const value = readArgumentValue(name)
    if (!value) return fallback

    return JSON.parse(decodeURIComponent(value))
}

function createEventId(method) {
    const eventId = `${method}-${nextEventId}`
    nextEventId += 1

    return eventId
}

function invokeBridge(method, params, callback) {
    const eventId = EVENT_METHODS.has(method) && callback ? createEventId(method) : null
    let listener = null

    if (eventId) {
        listener = (_event, message) => {
            if (message.eventId === eventId) callback(message.payload)
        }
        ipcRenderer.on(LOCAL_BRIDGE_EVENT_CHANNEL, listener)
    }

    return ipcRenderer.invoke(LOCAL_BRIDGE_INVOKE_CHANNEL, { eventId, method, params }).finally(() => {
        if (listener) ipcRenderer.removeListener(LOCAL_BRIDGE_EVENT_CHANNEL, listener)
    })
}

function subscribeBridge(method, params, callback) {
    const subscriptionId = createEventId(method)
    const listener = (_event, message) => {
        if (message.eventId === subscriptionId) callback(message.payload)
    }

    ipcRenderer.on(LOCAL_BRIDGE_EVENT_CHANNEL, listener)
    ipcRenderer.send(LOCAL_BRIDGE_SUBSCRIBE_CHANNEL, { method, params, subscriptionId })

    return () => {
        ipcRenderer.removeListener(LOCAL_BRIDGE_EVENT_CHANNEL, listener)
        ipcRenderer.send(LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL, subscriptionId)
    }
}

function createBridge(methods) {
    return Object.fromEntries(methods.map((method) => [
        method,
        (...params) => {
            const callback = EVENT_METHODS.has(method) && typeof params[params.length - 1] === 'function'
                ? params.pop()
                : null

            return invokeBridge(method, params, callback)
        },
    ]))
}

function exposeWarning(message) {
    const render = () => {
        document.body.innerHTML = ''
        const warning = document.createElement('main')
        warning.setAttribute('role', 'alert')
        warning.style.cssText = 'font-family: system-ui, sans-serif; padding: 24px; color: #7f1d1d;'
        warning.textContent = message
        document.body.appendChild(warning)
    }

    if (document.body) {
        render()
        return
    }

    window.addEventListener('DOMContentLoaded', render)
}

function isAllowedOrigin() {
    const trustedLocation = readArgumentValue('md2-bridge-trusted-location')
    if (trustedLocation) {
        const currentUrl = new URL(window.location.href)
        const trustedUrl = new URL(decodeURIComponent(trustedLocation))
        currentUrl.hash = ''
        trustedUrl.hash = ''
        if (currentUrl.href === trustedUrl.href) return true
    }

    const allowedOrigins = readArgumentJson('md2-bridge-allowed-origins', [])

    return allowedOrigins.includes(window.location.origin)
}

if (!isAllowedOrigin()) {
    exposeWarning(`MD² desktop bridges blocked for origin: ${window.location.origin}`)
} else {
    const githubAuthBridge = {
        requestAccessToken: (request) => ipcRenderer.invoke(GITHUB_AUTH_REQUEST_ACCESS_TOKEN_CHANNEL, request),
        requestDeviceCode: (request) => ipcRenderer.invoke(GITHUB_AUTH_REQUEST_DEVICE_CODE_CHANNEL, request),
    }
    const themeBridge = { setThemeMode: (mode) => ipcRenderer.send(THEME_SET_MODE_CHANNEL, mode) }
    const lifecycleBridge = {
        confirmFlush: (requestId) => ipcRenderer.send(LIFECYCLE_FLUSH_DONE_CHANNEL, requestId),
        onFlushRequested: (callback) => {
            const listener = (_event, requestId) => callback(requestId)
            ipcRenderer.on(LIFECYCLE_FLUSH_REQUEST_CHANNEL, listener)

            return () => ipcRenderer.removeListener(LIFECYCLE_FLUSH_REQUEST_CHANNEL, listener)
        },
    }
    const configBridge = {
        getDesktopConfig: () => desktopConfig,
        setDesktopConfig: (values) => {
            desktopConfig = { ...desktopConfig, ...values }
            void ipcRenderer.invoke(CONFIG_SET_DESKTOP_CHANNEL, values)
        },
    }
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
    const remarkableBridge = {
        importFiles: (request) => ipcRenderer.invoke(REMARKABLE_IMPORT_FILES_CHANNEL, request),
        listImageFiles: (settings) => ipcRenderer.invoke(REMARKABLE_LIST_IMAGE_FILES_CHANNEL, settings),
        testConnection: (settings) => ipcRenderer.invoke(REMARKABLE_TEST_CONNECTION_CHANNEL, settings),
    }
    const dataBridge = {
        ...createBridge(DATA_METHODS),
        watchProject: (project, callback) => subscribeBridge('watchProject', [project], callback),
    }
    const actionBridge = {
        ...createBridge(ACTION_METHODS),
        onScheduledActionRun: (callback) => subscribeBridge('onScheduledActionRun', [], callback),
    }

    contextBridge.exposeInMainWorld('md2GithubAuth', githubAuthBridge)
    contextBridge.exposeInMainWorld('md2Theme', themeBridge)
    contextBridge.exposeInMainWorld('md2Lifecycle', lifecycleBridge)
    contextBridge.exposeInMainWorld('md2Config', configBridge)
    contextBridge.exposeInMainWorld('md2RemoteControl', remoteControlBridge)
    contextBridge.exposeInMainWorld('md2Remarkable', remarkableBridge)
    contextBridge.exposeInMainWorld('md2Data', dataBridge)
    contextBridge.exposeInMainWorld('md2Actions', actionBridge)
}
