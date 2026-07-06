const { app, BrowserWindow, dialog, ipcMain, nativeTheme } = require('electron')
const path = require('node:path')
const Store = require('electron-store')
const { readDesktopConfig, resolveAppUrl } = require('./config')
const { AgentRunnerService } = require('./agent_runner_service')
const diffService = require('./diff_service')
const { createLocalBridgeDispatch } = require('./local_bridge_dispatch')
const localGitService = require('./local_git_service')
const { RemoteControlService } = require('./remote_control_service')
const remarkableService = require('./remarkable_service')
const { flush, registerProcessErrorHandlers, startElectronTelemetry, trackEvent } = require('./telemetry')
const { THEME_MODE_STORE_KEY, resolveThemeMode, resolveTitleBarOverlay } = require('./theme')

const appUrl = resolveAppUrl()
const DATA_OPEN_PROJECT_FOLDER_CHANNEL = 'md2-data:open-project-folder'
const REMOTE_CONTROL_STATUS_CHANNEL = 'md2-remote-control:status'
const REMOTE_CONTROL_START_CHANNEL = 'md2-remote-control:start'
const REMOTE_CONTROL_STOP_CHANNEL = 'md2-remote-control:stop'
const REMOTE_CONTROL_GET_STATUS_CHANNEL = 'md2-remote-control:get-status'
const THEME_SET_MODE_CHANNEL = 'md2-theme:set-mode'
const REMARKABLE_TEST_CONNECTION_CHANNEL = 'md2-remarkable:test-connection'
const REMARKABLE_LIST_IMAGE_FILES_CHANNEL = 'md2-remarkable:list-image-files'
const REMARKABLE_IMPORT_FILES_CHANNEL = 'md2-remarkable:import-files'

const store = new Store()
Store.initRenderer()
const remoteAgentRunnerService = new AgentRunnerService()
const remoteBridgeDispatch = createLocalBridgeDispatch({
    agentRunnerService: remoteAgentRunnerService,
    desktopConfigStore: store,
    diffService,
    localGitService,
    readDesktopConfig,
})
const remoteControlService = new RemoteControlService(remoteBridgeDispatch)
const electronTelemetryStarted = startElectronTelemetry()
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

function registerDataBridge() {
    ipcMain.handle(DATA_OPEN_PROJECT_FOLDER_CHANNEL, async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender)

        return openProjectFolder(window)
    })
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
    nativeTheme.themeSource = mode

    const window = new BrowserWindow({
        width: 1280,
        height: 900,
        titleBarStyle: 'hidden',
        titleBarOverlay: resolveTitleBarOverlay(mode),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: false,
            sandbox: false,
        },
    })

    window.loadURL(appUrl)
}

async function stopAndQuit() {
    if (isQuittingAfterTelemetry) return

    isQuittingAfterTelemetry = true
    await remoteControlService.stop()
    remoteAgentRunnerService.stopAll()
    await trackEvent('electron_stop')
    await flush()
    app.quit()
}

app.whenReady().then(async () => {
    await electronTelemetryStarted
    registerDataBridge()
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
