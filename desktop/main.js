const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron')
const path = require('node:path')
const { resolveAppUrl } = require('./config')

const appUrl = resolveAppUrl()
const DATA_OPEN_PROJECT_FOLDER_CHANNEL = 'md2-data:open-project-folder'
const DATA_MENU_PUSH_CHANNEL = 'md2-data:menu-push'

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
    const window = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: false,
            sandbox: false,
        },
    })

    window.loadURL(appUrl)
}

app.whenReady().then(() => {
    registerDataBridge()
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
