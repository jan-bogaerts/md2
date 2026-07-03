const { contextBridge, ipcRenderer } = require('electron')

const GITHUB_DEVICE_CODE_CHANNEL = 'md2-github-auth:request-device-code'
const GITHUB_ACCESS_TOKEN_CHANNEL = 'md2-github-auth:request-access-token'
const DATA_OPEN_PROJECT_FOLDER_CHANNEL = 'md2-data:open-project-folder'
const DATA_CREATE_PROJECT_CHANNEL = 'md2-data:create-project'
const DATA_LOAD_PROJECT_CHANNEL = 'md2-data:load-project'
const DATA_LIST_BRANCHES_CHANNEL = 'md2-data:list-branches'
const DATA_CHECKOUT_BRANCH_CHANNEL = 'md2-data:checkout-branch'
const DATA_COMMIT_CHANNEL = 'md2-data:commit'
const DATA_PUSH_CHANNEL = 'md2-data:push'
const DATA_WATCH_PROJECT_CHANNEL = 'md2-data:watch-project'
const DATA_UNWATCH_PROJECT_CHANNEL = 'md2-data:unwatch-project'
const DATA_PROJECT_CHANGED_CHANNEL = 'md2-data:project-changed'
const DATA_MENU_PUSH_CHANNEL = 'md2-data:menu-push'

const githubAuthBridge = {
    requestAccessToken: (request) => ipcRenderer.invoke(GITHUB_ACCESS_TOKEN_CHANNEL, request),
    requestDeviceCode: (request) => ipcRenderer.invoke(GITHUB_DEVICE_CODE_CHANNEL, request),
}

contextBridge.exposeInMainWorld('md2GithubAuth', githubAuthBridge)

const dataBridge = {
    checkoutBranch: (project, branch) => ipcRenderer.invoke(DATA_CHECKOUT_BRANCH_CHANNEL, project, branch),
    commit: (request) => ipcRenderer.invoke(DATA_COMMIT_CHANNEL, request),
    createProject: (project, workingFolder) => ipcRenderer.invoke(DATA_CREATE_PROJECT_CHANNEL, project, workingFolder),
    listBranches: (project) => ipcRenderer.invoke(DATA_LIST_BRANCHES_CHANNEL, project),
    loadProject: (project, workingFolder) => ipcRenderer.invoke(DATA_LOAD_PROJECT_CHANNEL, project, workingFolder),
    onMenuPush: (callback) => {
        const listener = () => callback()
        ipcRenderer.on(DATA_MENU_PUSH_CHANNEL, listener)

        return () => ipcRenderer.removeListener(DATA_MENU_PUSH_CHANNEL, listener)
    },
    openProjectFolder: () => ipcRenderer.invoke(DATA_OPEN_PROJECT_FOLDER_CHANNEL),
    push: (project) => ipcRenderer.invoke(DATA_PUSH_CHANNEL, project),
    watchProject: (project, callback) => {
        let watcherId = null
        const listener = () => callback()
        ipcRenderer.on(DATA_PROJECT_CHANGED_CHANNEL, listener)
        void ipcRenderer.invoke(DATA_WATCH_PROJECT_CHANNEL, project).then((id) => {
            watcherId = id
        })

        return () => {
            ipcRenderer.removeListener(DATA_PROJECT_CHANGED_CHANNEL, listener)
            if (watcherId) void ipcRenderer.invoke(DATA_UNWATCH_PROJECT_CHANNEL, watcherId)
        }
    },
}

contextBridge.exposeInMainWorld('md2Data', dataBridge)
