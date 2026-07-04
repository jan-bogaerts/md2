const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron')
const path = require('node:path')
const { resolveAppUrl } = require('./config')
const localGitService = require('./local_git_service')

const appUrl = resolveAppUrl()
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

let currentLocalProject = null
const projectWatchers = new Map()

function createLocalProject(rootPath) {
    return {
        branch: 'main',
        id: rootPath,
        rootPath,
    }
}

async function openProjectFolder(window) {
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Open local Git project',
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const project = createLocalProject(result.filePaths[0])
    await localGitService.assertGitRoot(project.rootPath)
    currentLocalProject = project

    return project
}

function registerDataBridge() {
    ipcMain.handle(DATA_OPEN_PROJECT_FOLDER_CHANNEL, async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender)

        return openProjectFolder(window)
    })
    ipcMain.handle(DATA_CREATE_PROJECT_CHANNEL, async (_event, project, workingFolder) => (
        localGitService.createProject(project, workingFolder)
    ))
    ipcMain.handle(DATA_LOAD_PROJECT_CHANNEL, async (_event, project, workingFolder) => {
        currentLocalProject = project

        return localGitService.loadProject(project, workingFolder)
    })
    ipcMain.handle(DATA_LIST_BRANCHES_CHANNEL, async (_event, project) => localGitService.listBranches(project))
    ipcMain.handle(DATA_CHECKOUT_BRANCH_CHANNEL, async (_event, project, branch) => {
        currentLocalProject = await localGitService.checkoutBranch(project, branch)

        return currentLocalProject
    })
    ipcMain.handle(DATA_COMMIT_CHANNEL, async (_event, request) => localGitService.commit(request, currentLocalProject))
    ipcMain.handle(DATA_PUSH_CHANNEL, async (_event, project) => localGitService.push(project))
    ipcMain.handle(DATA_WATCH_PROJECT_CHANNEL, async (event, project) => {
        const watcherId = `${project.id}:${Date.now()}`
        const dispose = localGitService.watchProject(project, () => event.sender.send(DATA_PROJECT_CHANGED_CHANNEL))
        projectWatchers.set(watcherId, dispose)

        return watcherId
    })
    ipcMain.handle(DATA_UNWATCH_PROJECT_CHANNEL, async (_event, watcherId) => {
        const dispose = projectWatchers.get(watcherId)

        if (!dispose) return

        dispose()
        projectWatchers.delete(watcherId)
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
            contextIsolation: true,
            nodeIntegration: false,
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
