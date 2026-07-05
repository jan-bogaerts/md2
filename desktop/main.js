const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } = require('electron')
const path = require('node:path')
const Store = require('electron-store')
const { resolveAppUrl } = require('./config')
const { flush, registerProcessErrorHandlers, startElectronTelemetry, trackEvent } = require('./telemetry')
const { THEME_MODE_STORE_KEY, resolveThemeMode, resolveTitleBarOverlay } = require('./theme')

const appUrl = resolveAppUrl()
const DATA_OPEN_PROJECT_FOLDER_CHANNEL = 'md2-data:open-project-folder'
const DATA_MENU_PUSH_CHANNEL = 'md2-data:menu-push'
const THEME_SET_MODE_CHANNEL = 'md2-theme:set-mode'

const store = new Store()
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

function createAppMenu() {
    const template = [
        {
            label: 'Project',
            submenu: [
                {
                    click: (_menuItem, window) => window?.webContents.send(DATA_MENU_PUSH_CHANNEL),
                    label: 'Push',
                },
            ],
        },
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
    await trackEvent('electron_stop')
    await flush()
    app.quit()
}

app.whenReady().then(async () => {
    await electronTelemetryStarted
    registerDataBridge()
    registerThemeBridge()
    createAppMenu()
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
