const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { resolveAppUrl } = require('./config')
const { requestGithubAccessToken, requestGithubDeviceCode } = require('./github-oauth-proxy')

const appUrl = resolveAppUrl()
const GITHUB_DEVICE_CODE_CHANNEL = 'md2-github-auth:request-device-code'
const GITHUB_ACCESS_TOKEN_CHANNEL = 'md2-github-auth:request-access-token'

function registerGithubAuthBridge() {
    ipcMain.handle(GITHUB_DEVICE_CODE_CHANNEL, async (_event, request) => requestGithubDeviceCode(request))
    ipcMain.handle(GITHUB_ACCESS_TOKEN_CHANNEL, async (_event, request) => requestGithubAccessToken(request))
}

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
    registerGithubAuthBridge()
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
