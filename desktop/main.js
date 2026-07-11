const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require('electron')
const { existsSync } = require('node:fs')
const path = require('node:path')

const desktopEnvironmentPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '.env')
if (existsSync(desktopEnvironmentPath)) process.loadEnvFile(desktopEnvironmentPath)

const Store = require('electron-store')
const { readDesktopConfig, resolveBridgeAllowedOrigins, writeDesktopConfig } = require('./config')
const { AgentRunnerService } = require('./agent_runner_service')
const { ActionSchedulerService } = require('./action_scheduler_service')
const diffService = require('./diff_service')
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch')
const localGitService = require('./local_git_service')
const { requestGithubAccessToken, requestGithubDeviceCode } = require('./github_oauth_proxy')
const { RemoteControlService } = require('./remote_control_service')
const remarkableService = require('./remarkable_service')
const { flush, registerProcessErrorHandlers, startElectronTelemetry, trackEvent } = require('./telemetry')
const { THEME_MODE_STORE_KEY, resolveThemeMode, resolveTitleBarOverlay } = require('./theme')
const { registerNavigationGuards, resolveRendererTarget } = require('./renderer_security')
const {
    CONFIG_GET_DESKTOP_CHANNEL,
    CONFIG_SET_DESKTOP_CHANNEL,
    GITHUB_AUTH_REQUEST_ACCESS_TOKEN_CHANNEL,
    GITHUB_AUTH_REQUEST_DEVICE_CODE_CHANNEL,
    LIFECYCLE_FLUSH_DONE_CHANNEL,
    LIFECYCLE_FLUSH_REQUEST_CHANNEL,
    LOCAL_BRIDGE_EVENT_CHANNEL,
    LOCAL_BRIDGE_INVOKE_CHANNEL,
    LOCAL_BRIDGE_SUBSCRIBE_CHANNEL,
    LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL,
    REMARKABLE_IMPORT_FILES_CHANNEL,
    REMARKABLE_LIST_IMAGE_FILES_CHANNEL,
    REMARKABLE_TEST_CONNECTION_CHANNEL,
    REMOTE_CONTROL_GET_STATUS_CHANNEL,
    REMOTE_CONTROL_START_CHANNEL,
    REMOTE_CONTROL_STATUS_CHANNEL,
    REMOTE_CONTROL_STOP_CHANNEL,
    THEME_SET_MODE_CHANNEL,
} = require('./ipc_channels')

const QUIT_FLUSH_TIMEOUT_MS = 5000
const EVENT_METHODS = new Set(['runAgent', 'startAgentConversation'])
const SUBSCRIPTION_METHODS = new Set(['onScheduledActionRun', 'watchProject'])

const store = new Store()
Store.initRenderer()
const agentRunnerService = new AgentRunnerService()
const actionSchedulerService = new ActionSchedulerService({
    agentConfigProvider: () => readDesktopConfig(store),
    agentRunnerService,
    localGitService,
})
const localBridgeDispatch = createLocalBridgeDispatch({
    actionSchedulerService,
    agentRunnerService,
    desktopConfigStore: store,
    diffService,
    localGitService,
    openProjectFolder: () => openProjectFolder(BrowserWindow.getFocusedWindow()),
    readDesktopConfig,
})
const remoteControlService = new RemoteControlService(localBridgeDispatch)
const electronTelemetryStarted = startElectronTelemetry()
const subscriptionCleanups = new Map()
let isQuittingAfterTelemetry = false

registerProcessErrorHandlers()

async function openProjectFolder(window) {
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Open local Git project',
    })

    if (result.canceled || result.filePaths.length === 0) return null

    return result.filePaths[0]
}

function subscriptionKey(webContents, subscriptionId) {
    return `${webContents.id}:${subscriptionId}`
}

function removeSubscription(webContents, subscriptionId) {
    const key = subscriptionKey(webContents, subscriptionId)
    const cleanup = subscriptionCleanups.get(key)
    if (!cleanup) return

    cleanup()
    subscriptionCleanups.delete(key)
}

function registerLocalBridge() {
    ipcMain.handle(LOCAL_BRIDGE_INVOKE_CHANNEL, (event, request) => {
        const { eventId, method, params } = request
        if (!EVENT_METHODS.has(method)) return localBridgeDispatch.invoke(method, params)

        return localBridgeDispatch.invoke(method, [
            ...params,
            (payload) => event.sender.send(LOCAL_BRIDGE_EVENT_CHANNEL, { eventId, payload }),
        ])
    })

    ipcMain.on(LOCAL_BRIDGE_SUBSCRIBE_CHANNEL, (event, request) => {
        const { method, params, subscriptionId } = request
        if (!SUBSCRIPTION_METHODS.has(method)) throw new Error(`Unsupported bridge subscription: ${method}`)

        removeSubscription(event.sender, subscriptionId)
        const cleanup = localBridgeDispatch.invoke(method, [
            ...params,
            (payload) => event.sender.send(LOCAL_BRIDGE_EVENT_CHANNEL, { eventId: subscriptionId, payload }),
        ])
        subscriptionCleanups.set(subscriptionKey(event.sender, subscriptionId), cleanup)
        event.sender.once('destroyed', () => removeSubscription(event.sender, subscriptionId))
    })

    ipcMain.on(LOCAL_BRIDGE_UNSUBSCRIBE_CHANNEL, (event, subscriptionId) => {
        removeSubscription(event.sender, subscriptionId)
    })
}

function registerConfigBridge() {
    ipcMain.handle(CONFIG_GET_DESKTOP_CHANNEL, () => readDesktopConfig(store))
    ipcMain.handle(CONFIG_SET_DESKTOP_CHANNEL, (_event, values) => writeDesktopConfig(store, values))
}

function registerGithubAuthBridge() {
    ipcMain.handle(GITHUB_AUTH_REQUEST_ACCESS_TOKEN_CHANNEL, (_event, request) => requestGithubAccessToken(request))
    ipcMain.handle(GITHUB_AUTH_REQUEST_DEVICE_CODE_CHANNEL, (_event, request) => requestGithubDeviceCode(request))
}

function broadcastRemoteControlStatus(status) {
    for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(REMOTE_CONTROL_STATUS_CHANNEL, status)
    }
}

function registerRemarkableBridge() {
    ipcMain.handle(REMARKABLE_TEST_CONNECTION_CHANNEL, (_event, settings) => remarkableService.testConnection(settings))
    ipcMain.handle(REMARKABLE_LIST_IMAGE_FILES_CHANNEL, (_event, settings) => remarkableService.listImageFiles(settings))
    ipcMain.handle(REMARKABLE_IMPORT_FILES_CHANNEL, (_event, request) => remarkableService.importFiles(request))
}

function registerRemoteControlBridge() {
    remoteControlService.setStatusListener(broadcastRemoteControlStatus)

    ipcMain.handle(REMOTE_CONTROL_START_CHANNEL, async () => remoteControlService.start())
    ipcMain.handle(REMOTE_CONTROL_STOP_CHANNEL, async () => remoteControlService.stop())
    ipcMain.handle(REMOTE_CONTROL_GET_STATUS_CHANNEL, () => remoteControlService.getStatus())
}

/** Keep the persisted mode, native theme source and window controls in sync with the renderer. */
function registerThemeBridge() {
    ipcMain.on(THEME_SET_MODE_CHANNEL, (event, incomingMode) => {
        const mode = resolveThemeMode(incomingMode)
        store.set(THEME_MODE_STORE_KEY, mode)
        nativeTheme.themeSource = mode

        const window = BrowserWindow.fromWebContents(event.sender)
        window?.setTitleBarOverlay?.(resolveTitleBarOverlay(mode))
    })
}

function createWindow() {
    const mode = resolveThemeMode(store.get(THEME_MODE_STORE_KEY))
    const desktopConfig = readDesktopConfig(store)
    const rendererTarget = resolveRendererTarget(app.isPackaged)
    const bridgeAllowedOrigins = rendererTarget.type === 'url'
        ? resolveBridgeAllowedOrigins(desktopConfig, rendererTarget.url)
        : []
    nativeTheme.themeSource = mode

    const window = new BrowserWindow({
        width: 1280,
        height: 900,
        icon: path.join(__dirname, 'build', 'md2.ico'),
        titleBarStyle: 'hidden',
        titleBarOverlay: resolveTitleBarOverlay(mode),
        webPreferences: {
            additionalArguments: [
                `--md2-bridge-allowed-origins=${encodeURIComponent(JSON.stringify(bridgeAllowedOrigins))}`,
                `--md2-bridge-trusted-location=${encodeURIComponent(rendererTarget.trustedLocation)}`,
                `--md2-desktop-config=${encodeURIComponent(JSON.stringify(desktopConfig))}`,
            ],
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    })

    registerNavigationGuards(window.webContents, rendererTarget.trustedLocation, (url) => shell.openExternal(url))
    if (rendererTarget.type === 'file') {
        void window.loadFile(rendererTarget.filePath)
    } else {
        void window.loadURL(rendererTarget.url)
    }

    if (!app.isPackaged) {
        window.webContents.openDevTools()
    }
}

async function stopAndQuit() {
    if (isQuittingAfterTelemetry) return

    isQuittingAfterTelemetry = true
    await flushRendererPendingCommits()
    await remoteControlService.stop()
    actionSchedulerService.stop()
    agentRunnerService.stopAll()
    await trackEvent('electron_stop')
    await flush()
    app.quit()
}

function waitForRendererFlush(browserWindow, requestId) {
    if (browserWindow.webContents.isDestroyed()) return Promise.resolve()

    return new Promise((resolve) => {
        let isSettled = false
        let timeoutId = null

        function settle() {
            if (isSettled) return

            isSettled = true
            if (timeoutId !== null) clearTimeout(timeoutId)
            ipcMain.removeListener(LIFECYCLE_FLUSH_DONE_CHANNEL, handleFlushDone)
            resolve()
        }

        function handleFlushDone(event, completedRequestId) {
            if (event.sender !== browserWindow.webContents) return
            if (completedRequestId !== requestId) return

            settle()
        }

        timeoutId = setTimeout(settle, QUIT_FLUSH_TIMEOUT_MS)
        ipcMain.on(LIFECYCLE_FLUSH_DONE_CHANNEL, handleFlushDone)

        try {
            browserWindow.webContents.send(LIFECYCLE_FLUSH_REQUEST_CHANNEL, requestId)
        } catch {
            settle()
        }
    })
}

async function flushRendererPendingCommits() {
    const windows = BrowserWindow.getAllWindows()
    const flushes = windows.map((browserWindow, index) => waitForRendererFlush(browserWindow, `quit-${Date.now()}-${index}`))

    await Promise.all(flushes)
}

app.whenReady().then(async () => {
    await electronTelemetryStarted
    registerConfigBridge()
    registerGithubAuthBridge()
    registerLocalBridge()
    registerRemarkableBridge()
    registerRemoteControlBridge()
    registerThemeBridge()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', (event) => {
    if (isQuittingAfterTelemetry) return

    event.preventDefault()
    void stopAndQuit()
})
