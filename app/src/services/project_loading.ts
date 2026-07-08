import { ACTION_SCHEDULES_FILE } from '../data/action_schedule_types'
import type { MarkdownFile, ProjectAsset, ProjectReference, ProjectSnapshot, ProjectWatchEvent, StorageService } from '../data/data_types'
import { actionService } from './action_service'
import { configService } from './config_service'
import {
    type RequiredDataServiceDependencies,
    errorMessage,
    mergeFiles,
    removeFilesByPath,
    reportWorkspaceError,
    reportWorkspaceNotice,
} from './data_service_context'
import { planExternalCardImports } from './external_card_import_service'
import { telemetryService } from './telemetry_service'

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

function reportMarkdownWatchConflict(path: string) {
    reportWorkspaceError(`External change ignored for ${path} because the file has unsaved local edits.`)
}

function backgroundProjectLoadFailureMessage(error: unknown) {
    const detail = errorMessage(error, 'Unknown error')

    return `Background project data failed to load - search and history may be incomplete. ${detail}`
}

export interface ProjectLoadingDeps {
    beginProjectLoad(): number
    commitPathsInFlight(): Set<string>
    dispatchChanged(): void
    files(): MarkdownFile[]
    isCurrentLoad(project: ProjectReference, projectLoadToken: number): boolean
    project(): ProjectReference | null
    replaceFiles(files: MarkdownFile[], workingFolder: string): void
    replaceProject(project: ProjectReference | null): void
    replaceProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]): void
    requireDependencies(): RequiredDataServiceDependencies
    resetAgentConversations(): void
    snapshot(): ProjectSnapshot | null
    storage(): StorageService | null
}

export class ProjectLoading {
    private readonly dependencies: ProjectLoadingDeps
    private readonly loadAgentConversationsInBackground: (
        snapshot: ProjectSnapshot,
        project: ProjectReference,
        projectLoadToken: number,
    ) => void
    private actionReloadChangedPaths: Set<string> = new Set()
    private actionReloadTimeout: number | null = null
    private markdownReloadEventsByPath: Map<string, ProjectWatchEvent> = new Map()
    private markdownReloadTimeout: number | null = null
    private watchCleanup: (() => void) | null = null

    constructor(
        dependencies: ProjectLoadingDeps,
        loadAgentConversationsInBackground: (
            snapshot: ProjectSnapshot,
            project: ProjectReference,
            projectLoadToken: number,
        ) => void,
    ) {
        this.dependencies = dependencies
        this.loadAgentConversationsInBackground = loadAgentConversationsInBackground
    }

    reset() {
        this.stopProjectWatch()
        this.clearActionReloadTimeout()
        this.clearMarkdownReloadTimeout()
        this.actionReloadChangedPaths.clear()
        this.markdownReloadEventsByPath = new Map()
        this.dependencies.beginProjectLoad()
    }

    async createProject(project: ProjectReference) {
        const { config, storage } = this.dependencies.requireDependencies()
        this.dependencies.replaceProject(await storage.createProject(project, config.workingFolder))
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot create a project without a project reference')

        await storage.saveProjectConfig(currentProject, config)
        telemetryService.trackEvent('create_project')

        return this.openProject(currentProject)
    }

    async openProject(project: ProjectReference) {
        const { storage } = this.dependencies.requireDependencies()
        this.clearMarkdownReloadTimeout()
        const projectLoadToken = this.dependencies.beginProjectLoad()
        this.dependencies.resetAgentConversations()
        this.actionReloadChangedPaths.clear()
        this.markdownReloadEventsByPath = new Map()
        this.dependencies.replaceProject(project)
        const projectConfig = await storage.loadProjectConfig(project)
        configService.loadProjectConfig(projectConfig)
        const config = configService.getProjectConfig()
        if (config.pushMode === 'manual') await storage.restorePendingCommits?.(project)
        const actionFiles = await storage.loadActionFiles(project, config.actionsFolder)
        actionService.loadFromFiles(actionFiles)
        const projectFiles = await storage.loadProjectRoot(project, config.workingFolder)
        const repositoryFiles: string[] = []
        this.dependencies.replaceProjectFiles(projectFiles.files, projectFiles.workingFolder, repositoryFiles)
        this.startProjectWatch()
        this.dependencies.dispatchChanged()
        const currentSnapshot = this.dependencies.snapshot()
        if (!currentSnapshot) throw new Error('Project snapshot was not created')

        this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)
        void this.loadFullProjectInBackground(project, config.workingFolder, projectLoadToken)
        telemetryService.trackEvent('open_project')

        return currentSnapshot
    }

    async saveProjectConfig() {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot save project config before a project is open')

        await storage.saveProjectConfig(currentProject, configService.getProjectConfig())
        this.dependencies.dispatchChanged()
    }

    async loadProjectAsset(path: string): Promise<ProjectAsset> {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot load a project asset before a project is open')
        if (!storage.loadProjectAsset) throw new Error('Project asset loading is not available')

        return storage.loadProjectAsset(currentProject, path)
    }

    async switchBranch(branch: string) {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot switch branch before a project is open')

        const project = await storage.checkoutBranch(currentProject, branch)

        return this.openProject(project)
    }

    async push() {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot push before a project is open')

        await storage.push(currentProject)
        this.dependencies.dispatchChanged()
    }

    async reloadCurrentProjectSnapshot() {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot reload project snapshot before a project is open')

        const project = currentProject
        const projectLoadToken = this.dependencies.beginProjectLoad()
        const projectFiles = await storage.loadProject(currentProject, config.workingFolder)
        const repositoryFiles = await storage.listRepositoryFiles(currentProject)
        this.dependencies.replaceProjectFiles(projectFiles.files, projectFiles.workingFolder, repositoryFiles)
        this.dependencies.dispatchChanged()
        const currentSnapshot = this.dependencies.snapshot()
        if (currentSnapshot) this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)

        return currentSnapshot
    }

    stopProjectWatch() {
        if (!this.watchCleanup) return

        this.watchCleanup()
        this.watchCleanup = null
    }

    private async importExternalCardFiles(files: MarkdownFile[], workingFolder: string) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) return files

        const plan = planExternalCardImports(files, workingFolder, config.cardTypes)
        if (plan.moves.length === 0) return files

        const importPaths = plan.moves.flatMap((move) => [move.fromPath, move.toPath])
        const inFlightCommitPaths = this.dependencies.commitPathsInFlight()
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
        if (config.pushMode === 'manual') this.dependencies.dispatchChanged()

        reportWorkspaceNotice(importedNoticeMessage(plan.moves.length))
        telemetryService.trackEvent('external_file_import')

        return mergeFiles(removeFilesByPath(files, plan.moves.map((move) => move.fromPath)), plan.importedFiles)
    }

    private async loadFullProjectInBackground(project: ProjectReference, workingFolder: string, projectLoadToken: number) {
        const { storage } = this.dependencies.requireDependencies()

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
            const remainingFiles = removeFilesByPath(this.dependencies.files(), removedImportedPaths)
            this.dependencies.replaceProjectFiles(mergeFiles(importedFiles, remainingFiles), projectFiles.workingFolder, repositoryFiles)
            this.dependencies.dispatchChanged()
            const currentSnapshot = this.dependencies.snapshot()
            if (currentSnapshot) this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)
        } catch (error) {
            if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

            reportWorkspaceError(backgroundProjectLoadFailureMessage(error))
            telemetryService.captureError(error)
        }
    }

    private shouldApplyProjectLoad(project: ProjectReference, projectLoadToken: number) {
        return this.dependencies.isCurrentLoad(project, projectLoadToken)
    }

    private startProjectWatch() {
        this.stopProjectWatch()
        const currentProject = this.dependencies.project()
        const storage = this.dependencies.storage()
        if (!currentProject || !storage?.watchProject) return

        this.watchCleanup = storage.watchProject(currentProject, (event) => this.handleProjectWatchEvent(event))
    }

    private handleProjectWatchEvent(event: ProjectWatchEvent) {
        const { config } = this.dependencies.requireDependencies()
        if (isActionDefinitionPath(event.path, config.actionsFolder)) {
            this.scheduleActionReload(event.path)
            return
        }

        if (isProjectMarkdownPath(event.path, config.workingFolder)) this.scheduleMarkdownReload(event)
    }

    private scheduleActionReload(changedPath: string) {
        this.actionReloadChangedPaths.add(changedPath)
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
        const { commitBatcher, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject || !storage.loadFile) return

        this.clearMarkdownReloadTimeout()
        const events = [...this.markdownReloadEventsByPath.values()]
        this.markdownReloadEventsByPath.clear()
        const updatedFiles: MarkdownFile[] = []
        const removedPaths: string[] = []

        for (const event of events) {
            if (this.dependencies.commitPathsInFlight().has(event.path)) continue
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

            const currentFile = this.dependencies.files().find((file) => file.path === loadedFile.path)
            if (currentFile?.content === loadedFile.content) continue

            updatedFiles.push(loadedFile)
        }

        const removedPathSet = new Set(removedPaths)
        const watchedFiles = mergeFiles(
            this.dependencies.files().filter((file) => !removedPathSet.has(file.path)),
            updatedFiles,
        )
        const importedFiles = await this.importExternalCardFiles(watchedFiles, this.dependencies.requireDependencies().config.workingFolder)
        if (updatedFiles.length === 0 && removedPaths.length === 0 && importedFiles === watchedFiles) return

        const repositoryFiles = await storage.listRepositoryFiles(currentProject)
        const { config } = this.dependencies.requireDependencies()
        this.dependencies.replaceProjectFiles(importedFiles, config.workingFolder, repositoryFiles)
        this.dependencies.dispatchChanged()
    }

    private async loadWatchedMarkdownFile(event: ProjectWatchEvent) {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
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
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) return

        const changedPaths = [...this.actionReloadChangedPaths]
        if (changedPaths.length === 0) return

        this.clearActionReloadTimeout()
        this.actionReloadChangedPaths.clear()
        const actionFiles = await storage.loadActionFiles(currentProject, config.actionsFolder)
        actionService.reloadFromFiles(actionFiles, changedPaths)
    }
}
