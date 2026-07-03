const { contextBridge, ipcRenderer } = require('electron')

const GITHUB_DEVICE_CODE_CHANNEL = 'md2-github-auth:request-device-code'
const GITHUB_ACCESS_TOKEN_CHANNEL = 'md2-github-auth:request-access-token'

const githubAuthBridge = {
    requestAccessToken: (request) => ipcRenderer.invoke(GITHUB_ACCESS_TOKEN_CHANNEL, request),
    requestDeviceCode: (request) => ipcRenderer.invoke(GITHUB_DEVICE_CODE_CHANNEL, request),
}

contextBridge.exposeInMainWorld('md2GithubAuth', githubAuthBridge)
