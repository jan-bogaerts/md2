import { ACTION_SCHEDULES_FILE } from '../data/action_schedule_types'
import type { MarkdownFile, ProjectAsset, ProjectReference, ProjectWatchEvent } from '../data/data_types'
import { actionService } from './action_service'
import { configService } from './config_service'
import { planExternalCardImports } from './external_card_import_service'
import { telemetryService } from './telemetry_service'
import {
    type DataServiceContext,
    errorMessage,
    mergeFiles,
    removeFilesByPath,
    reportWorkspaceError,
    reportWorkspaceNotice,
} from './data_service_context'

const ACTION_RELOAD_DEBOUNCE_MS = 150
const JSON_EXTENSION = '.json'
const MARKDOWN_EXTENSION = '.md'
const MARKDOWN_RELOAD_DEBOUNCE_MS = 150

function importedNoticeMessage(count: number) {
    return `Imported ${count} external ${count === 1 ? 'file' : 'files'} as new cards.`
}

function isActionDefinitionPath(path: string, actionsFolder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedActionsFolder = actionsFolder.replace(/\\/gu, '/').replace(/\/$/u, '')
    const fileName = normalizedPath.split('/').pop()
    if (fileName === ACTION_SCHEDULES_FILE) return false

    return normalizedPath.startsWith(`${normalizedActionsFolder}/`) && normalizedPath.toLowerCase().endsWith(JSON_EXTENSION)
}

function isProjectMarkdownPath(path: string, workingFolder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedWorkingFolder = workingFolder.replace(/\\/gu, '/').replace(/\/$/u, '')

    return normalizedPath.startsWith(`${normalizedWorkingFolder}/`) && normalizedPath.toLowerCase().endsWith(MARKDOWN_EXTENSION)
}

function isSameProjectReference(left: ProjectReference | null, right: ProjectReference) {
    return left?.branch === right.branch
        && left.id === right.id
        && left.owner === right.owner
        && left.repository === right.repository
        && left.rootPath === right.rootPath
}

function reportMarkdownWatchConflict(path: string) {
    reportWorkspaceError(`External change ignored for ${path} because the file has unsaved local edits.`)
}

export class ProjectLoading {
    private readonly context: DataServiceContext
    private readonly loadAgentConversationsInBackground: (
        snapshot: NonNullable<ReturnType<DataServiceContext['getCurrentSnapshot']>>,
        project: ProjectReference,
        projectLoadToken: number,
    ) => void
    private actionReloadChangedPath: string | null = null
    private actionReloadTimeout: number | null = null
    private markdownReloadEventsByPath: Map<string, ProjectWatchEvent> = new Map()
    private markdownReloadTimeout: number | null = null
    private watchCleanup: (() => void) | null = null

    constructor(
        context: DataServiceContext,
        loadAgentConversationsInBackground: (
            snapshot: NonNullable<ReturnType<DataServiceContext['getCurrentSnapshot']>>,
            project: ProjectReference,
            projectLoadToken: number,
        ) => void,
    ) {
        this.context = context
        this.loadAgentConversationsInBackground = loadAgentConversationsInBackground
    }

    reset() {
        this.stopProjectWatch()
        this.clearActionReloadTimeout()
        this.clearMarkdownReloadTimeout()
        this.actionReloadChangedPath = null
        this.markdownReloadEventsByPath = new Map()
        this.context.increaseProjectLoadToken()
    }

    async createProject(project: ProjectReference) {
        const { config, storage } = this.context.requireDependencies()
        this.context.setCurrentProject(await storage.createProject(project, config.workingFolder))
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot create a project without a project reference')

        await storage.saveProjectConfig(currentProject, config)
        telemetryService.trackEvent('create_project')

        return this.openProject(currentProject)
    }

    async openProject(project: ProjectReference) {
        const { storage } = this.context.requireDependencies()
        this.clearMarkdownReloadTimeout()
        const projectLoadToken = this.context.increaseProjectLoadToken()
        this.context.increaseAgentConversationLoadToken()
        this.context.resetAgentConversations()
        this.markdownReloadEventsByPath = new Map()
        this.context.setCurrentProject(project)
        const projectConfig = await storage.loadProjectConfig(project)
        configService.loadProjectConfig(projectConfig)
        const config = configService.getProjectConfig()
        if (config.pushMode === 'manual') await storage.restorePendingCommits?.(project)
        const actionFiles = await storage.loadActionFiles(project, config.actionsFolder)
        actionService.loadFromFiles(actionFiles)
        const projectFiles = await storage.loadProjectRoot(project, config.workingFolder)
        const repositoryFiles: string[] = []
        this.context.setCurrentFiles(projectFiles.files)
        this.context.setCurrentSnapshot(this.context.createSnapshot(projectFiles.files, projectFiles.workingFolder, repositoryFiles))
        this.startProjectWatch()
        this.context.dispatchChanged()
        const currentSnapshot = this.context.getCurrentSnapshot()
        if (!currentSnapshot) throw new Error('Project snapshot was not created')

        this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)
        void this.loadFullProjectInBackground(project, config.workingFolder, projectLoadToken)
        telemetryService.trackEvent('open_project')

        return currentSnapshot
    }

    async saveProjectConfig() {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot save project config before a project is open')

        await storage.saveProjectConfig(currentProject, configService.getProjectConfig())
        this.context.dispatchChanged()
    }

    async loadProjectAsset(path: string): Promise<ProjectAsset> {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot load a project asset before a project is open')
        if (!storage.loadProjectAsset) throw new Error('Project asset loading is not available')

        return storage.loadProjectAsset(currentProject, path)
    }

    async switchBranch(branch: string) {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot switch branch before a project is open')

        const project = await storage.checkoutBranch(currentProject, branch)

        return this.openProject(project)
    }

    async push() {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot push before a project is open')

        await storage.push(currentProject)
        this.context.dispatchChanged()
    }

    async reloadCurrentProjectSnapshot() {
        const { config, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot reload project snapshot before a project is open')

        const project = currentProject
        const projectLoadToken = this.context.increaseProjectLoadToken()
        const projectFiles = await storage.loadProject(currentProject, config.workingFolder)
        const repositoryFiles = await storage.listRepositoryFiles(currentProject)
        this.context.setCurrentFiles(projectFiles.files)
        this.context.setCurrentSnapshot(this.context.createSnapshot(projectFiles.files, projectFiles.workingFolder, repositoryFiles))
        this.context.dispatchChanged()
        const currentSnapshot = this.context.getCurrentSnapshot()
        if (currentSnapshot) this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)

        return currentSnapshot
    }

    stopProjectWatch() {
        if (!this.watchCleanup) return

        this.watchCleanup()
        this.watchCleanup = null
    }

    private async importExternalCardFiles(files: MarkdownFile[], workingFolder: string) {
        const { config, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) return files

        const plan = planExternalCardImports(files, workingFolder, config.cardTypes)
        if (plan.moves.length === 0) return files

        const importPaths = plan.moves.flatMap((move) => [move.fromPath, move.toPath])
        const inFlightCommitPaths = this.context.getInFlightCommitPaths()
        importPaths.forEach((path) => inFlightCommitPaths.add(path))

        try {
            await storage.moveFiles({
                branch: currentProject.branch,
                message: `Import ${plan.moves.length} external ${plan.moves.length === 1 ? 'file' : 'files'}`,
                moves: plan.moves,
            })
        } catch (error) {
            reportWorkspaceError(errorMessage(error, 'External file import failed'))
            telemetryService.captureError(error)

            return files
        } finally {
            importPaths.forEach((path) => inFlightCommitPaths.delete(path))
        }

        if (config.pushMode === 'auto') await storage.push(currentProject)
        if (config.pushMode === 'manual') this.context.dispatchChanged()

        reportWorkspaceNotice(importedNoticeMessage(plan.moves.length))
        telemetryService.trackEvent('external_file_import')

        return mergeFiles(removeFilesByPath(files, plan.moves.map((move) => move.fromPath)), plan.importedFiles)
    }

    private async loadFullProjectInBackground(project: ProjectReference, workingFolder: string, projectLoadToken: number) {
        const { storage } = this.context.requireDependencies()

        try {
            const [projectFiles, repositoryFiles] = await Promise.all([
                storage.loadProject(project, workingFolder),
                storage.listRepositoryFiles(project),
            ])
            if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

            const importedFiles = await this.importExternalCardFiles(projectFiles.files, projectFiles.workingFolder)
            if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

            const importedPaths = new Set(importedFiles.map((file) => file.path))
            const removedImportedPaths = projectFiles.files
                .filter((file) => !importedPaths.has(file.path))
                .map((file) => file.path)
            const remainingFiles = removeFilesByPath(this.context.getCurrentFiles(), removedImportedPaths)
            this.context.setCurrentFiles(mergeFiles(importedFiles, remainingFiles))
            const snapshot = this.context.createSnapshot(this.context.getCurrentFiles(), projectFiles.workingFolder, repositoryFiles)
            this.context.setCurrentSnapshot(snapshot)
            this.context.dispatchChanged()
            const currentSnapshot = this.context.getCurrentSnapshot()
            if (currentSnapshot) this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)
        } catch (error) {
            console.error('Failed to load full project in background', error)
        }
    }

    private shouldApplyProjectLoad(project: ProjectReference, projectLoadToken: number) {
        return this.context.getProjectLoadToken() === projectLoadToken && isSameProjectReference(this.context.getCurrentProject(), project)
    }

    private startProjectWatch() {
        this.stopProjectWatch()
        const currentProject = this.context.getCurrentProject()
        const storage = this.context.getStorage()
        if (!currentProject || !storage?.watchProject) return

        this.watchCleanup = storage.watchProject(currentProject, (event) => this.handleProjectWatchEvent(event))
    }

    private handleProjectWatchEvent(event: ProjectWatchEvent) {
        const { config } = this.context.requireDependencies()
        if (isActionDefinitionPath(event.path, config.actionsFolder)) {
            this.scheduleActionReload(event.path)
            return
        }

        if (isProjectMarkdownPath(event.path, config.workingFolder)) this.scheduleMarkdownReload(event)
    }

    private scheduleActionReload(changedPath: string) {
        this.actionReloadChangedPath = changedPath
        this.clearActionReloadTimeout()
        this.actionReloadTimeout = window.setTimeout(() => {
            void this.reloadActionsFromCurrentProject()
        }, ACTION_RELOAD_DEBOUNCE_MS)
    }

    private clearActionReloadTimeout() {
        if (this.actionReloadTimeout === null) return

        window.clearTimeout(this.actionReloadTimeout)
        this.actionReloadTimeout = null
    }

    private scheduleMarkdownReload(event: ProjectWatchEvent) {
        this.markdownReloadEventsByPath.set(event.path, event)
        this.clearMarkdownReloadTimeout()
        this.markdownReloadTimeout = window.setTimeout(() => {
            void this.reloadMarkdownFilesFromWatchEvents()
        }, MARKDOWN_RELOAD_DEBOUNCE_MS)
    }

    private clearMarkdownReloadTimeout() {
        if (this.markdownReloadTimeout === null) return

        window.clearTimeout(this.markdownReloadTimeout)
        this.markdownReloadTimeout = null
    }

    private async reloadMarkdownFilesFromWatchEvents() {
        const { commitBatcher, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject || !storage.loadFile) return

        this.clearMarkdownReloadTimeout()
        const events = [...this.markdownReloadEventsByPath.values()]
        this.markdownReloadEventsByPath.clear()
        const updatedFiles: MarkdownFile[] = []
        const removedPaths: string[] = []

        for (const event of events) {
            if (this.context.getInFlightCommitPaths().has(event.path)) continue
            if (commitBatcher.hasPendingFile(event.path)) {
                reportMarkdownWatchConflict(event.path)
                continue
            }

            if (event.changeKind === 'removed') {
                removedPaths.push(event.path)
                continue
            }

            const loadedFile = await this.loadWatchedMarkdownFile(event)
            if (!loadedFile) {
                if (event.changeKind === 'unknown') removedPaths.push(event.path)
                continue
            }

            const currentFile = this.context.getCurrentFiles().find((file) => file.path === loadedFile.path)
            if (currentFile?.content === loadedFile.content) continue

            updatedFiles.push(loadedFile)
        }

        const removedPathSet = new Set(removedPaths)
        const watchedFiles = mergeFiles(
            this.context.getCurrentFiles().filter((file) => !removedPathSet.has(file.path)),
            updatedFiles,
        )
        const importedFiles = await this.importExternalCardFiles(watchedFiles, this.context.requireDependencies().config.workingFolder)
        if (updatedFiles.length === 0 && removedPaths.length === 0 && importedFiles === watchedFiles) return

        this.context.setCurrentFiles(importedFiles)
        const repositoryFiles = await storage.listRepositoryFiles(currentProject)
        const { config } = this.context.requireDependencies()
        this.context.setCurrentSnapshot(this.context.createSnapshot(this.context.getCurrentFiles(), config.workingFolder, repositoryFiles))
        this.context.dispatchChanged()
    }

    private async loadWatchedMarkdownFile(event: ProjectWatchEvent) {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject || !storage.loadFile) return null

        try {
            return await storage.loadFile(currentProject, event.path)
        } catch (error) {
            if (event.changeKind === 'unknown' || event.changeKind === 'removed') return null

            console.error('Failed to load watched markdown file', error)

            return null
        }
    }

    private async reloadActionsFromCurrentProject() {
        const { config, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) return

        const changedPath = this.actionReloadChangedPath
        if (!changedPath) return

        this.clearActionReloadTimeout()
        const actionFiles = await storage.loadActionFiles(currentProject, config.actionsFolder)
        actionService.reloadFromFiles(actionFiles, changedPath)
        this.actionReloadChangedPath = null
    }
}
