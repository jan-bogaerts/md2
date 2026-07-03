const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const DEFAULT_APP_URL = 'http://localhost:5173'
const appUrl = process.env.MD2_APP_URL || DEFAULT_APP_URL

function createWindow() {
    const window = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    window.loadURL(appUrl)
}

app.whenReady().then(() => {
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
