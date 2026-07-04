const { ipcRenderer } = require('electron')
const { requestGithubAccessToken, requestGithubDeviceCode } = require('./github_oauth_proxy')
const localGitService = require('./local_git_service')

const DATA_OPEN_PROJECT_FOLDER_CHANNEL = 'md2-data:open-project-folder'
const DATA_MENU_PUSH_CHANNEL = 'md2-data:menu-push'
const THEME_SET_MODE_CHANNEL = 'md2-theme:set-mode'

let currentLocalProject = null

function createLocalProject(rootPath) {
    return {
        branch: 'main',
        id: rootPath,
        rootPath,
    }
}

const githubAuthBridge = {
    requestAccessToken: (request) => requestGithubAccessToken(request),
    requestDeviceCode: (request) => requestGithubDeviceCode(request),
}

window.md2GithubAuth = githubAuthBridge

const themeBridge = { setThemeMode: (mode) => ipcRenderer.send(THEME_SET_MODE_CHANNEL, mode) }

window.md2Theme = themeBridge

const dataBridge = {
    checkoutBranch: async (project, branch) => {
        currentLocalProject = await localGitService.checkoutBranch(project, branch)

        return currentLocalProject
    },
    commit: (request) => localGitService.commit(request, currentLocalProject),
    createProject: (project, workingFolder) => localGitService.createProject(project, workingFolder),
    listBranches: (project) => localGitService.listBranches(project),
    loadProject: async (project, workingFolder) => {
        currentLocalProject = project

        return localGitService.loadProject(project, workingFolder)
    },
    onMenuPush: (callback) => {
        const listener = () => callback()
        ipcRenderer.on(DATA_MENU_PUSH_CHANNEL, listener)

        return () => ipcRenderer.removeListener(DATA_MENU_PUSH_CHANNEL, listener)
    },
    openProjectFolder: async () => {
        const rootPath = await ipcRenderer.invoke(DATA_OPEN_PROJECT_FOLDER_CHANNEL)
        if (!rootPath) return null

        const project = createLocalProject(rootPath)
        await localGitService.assertGitRoot(project.rootPath)
        currentLocalProject = project

        return project
    },
    push: (project) => localGitService.push(project),
    watchProject: (project, callback) => localGitService.watchProject(project, callback),
}

window.md2Data = dataBridge
