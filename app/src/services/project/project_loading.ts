import { ACTION_SCHEDULES_FILE } from '../../data/action_schedule_types'
import { deriveStatesFromCards, mergeStatesWithDefaults } from '../../data/card_ordering'
import type { CardSeparator } from '../../data/card_identifiers'
import { resolveProjectConfigPaths, type MarkdownFile, type ProjectAsset, type ProjectConfig, type ProjectReference, type ProjectSnapshot, type ProjectWatchEvent, type StorageService } from '../../data/data_types'
import { actionService, type ActionReloadChange } from '../actions/action_service'
import { configService } from '../config/config_service'
import {
    type RequiredDataServiceDependencies,
    errorMessage,
    mergeFiles,
    removeFilesByPath,
    reportWorkspaceError,
    reportWorkspaceNotice,
} from '../data/data_service_context'
import { planExternalCardImports } from '../data/external_card_import_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { createRandomProjectBackgroundShade } from '../../theme/project_background_shade'
import { worktreeService } from './worktree_service'
import { planCardSeparatorMigration } from '../data/card_separator_migration'
import { globalProgressService } from '.././global_progress_service'
import { dialogService } from '.././dialog_service'
import { GithubUnauthorizedError } from '../../auth/github_api_client'

const ACTION_RELOAD_DEBOUNCE_MS = 150
const JSON_EXTENSION = '.json'
const MARKDOWN_EXTENSION = '.md'
const MARKDOWN_RELOAD_DEBOUNCE_MS = 150
const PROJECT_LOAD_ERROR_REPORTED = Symbol('project-load-error-reported')

type ReportedProjectLoadError = object & { [PROJECT_LOAD_ERROR_REPORTED]?: boolean }

export function isProjectLoadErrorReported(error: unknown) {
    return typeof error === 'object' && error !== null && !!(error as ReportedProjectLoadError)[PROJECT_LOAD_ERROR_REPORTED]
}

function markProjectLoadErrorReported(error: unknown) {
    if (typeof error === 'object' && error !== null) (error as ReportedProjectLoadError)[PROJECT_LOAD_ERROR_REPORTED] = true
}

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

function isProjectMarkdownPath(path: string, projectFolder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedProjectFolder = projectFolder.replace(/\\/gu, '/').replace(/\/$/u, '')
    if (normalizedProjectFolder.length === 0) return normalizedPath.toLowerCase().endsWith(MARKDOWN_EXTENSION)

    return normalizedPath.startsWith(`${normalizedProjectFolder}/`) && normalizedPath.toLowerCase().endsWith(MARKDOWN_EXTENSION)
}

function reportMarkdownWatchConflict(path: string) {
    reportWorkspaceError(`External change ignored for ${path} because the file has unsaved local edits.`)
}

function reportActionLoadIssues() {
    const message = actionService.getState().error
    if (message) dialogService.warning(message, { title: 'Some actions were not loaded' })
}

function backgroundProjectLoadFailureMessage(error: unknown) {
    const detail = errorMessage(error, 'Unknown error')

    return `Background project data failed to load - search and history may be incomplete. ${detail}`
}

function reportOptionalProjectLoadFailure(area: string, error: unknown) {
    const detail = errorMessage(error, 'Unknown error')
    dialogService.warning(`${area} could not be loaded and was skipped. ${detail}`, { title: 'Project loaded with errors' })
    telemetryService.captureError(error)
}

function initializeMissingProjectStates(projectConfig: Partial<ProjectConfig> | null, snapshot: ProjectSnapshot) {
    if (projectConfig?.states !== undefined) return

    const derivedStates = deriveStatesFromCards(snapshot.activeCards)
    configService.set('project.states', mergeStatesWithDefaults(derivedStates))
}

async function loadWorktrees(project: ProjectReference) {
    try {
        await worktreeService.load(project)
    } catch (error) {
        worktreeService.clear()
        reportOptionalProjectLoadFailure('Worktrees', error)
    }
}

export interface ProjectLoadingDeps {
    beginProjectLoad(): number
    clearLoadedProject(): void
    commitPathsInFlight(): Set<string>
    dispatchChanged(): void
    dispatchPersistenceChanged(): void
    ensureCardInternalIds(): Promise<void>
    files(): MarkdownFile[]
    flushPendingChanges(): Promise<void>
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
    private actionReloadChangesByPath: Map<string, ActionReloadChange> = new Map()
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
        this.actionReloadChangesByPath.clear()
        this.markdownReloadEventsByPath = new Map()
        this.dependencies.beginProjectLoad()
    }

    async createProject(project: ProjectReference) {
        const { config, storage } = this.dependencies.requireDependencies()
        const rawConfig = { ...configService.getProjectConfig(), backgroundShade: createRandomProjectBackgroundShade() }
        this.dependencies.replaceProject(await storage.createProject(project, config.workingFolder))
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot create a project without a project reference')

        await storage.saveProjectConfig(currentProject, rawConfig)
        telemetryService.trackEvent('create_project')

        return this.openProject(currentProject)
    }

    async openProject(project: ProjectReference) {
        const { storage } = this.dependencies.requireDependencies()
        await this.dependencies.flushPendingChanges()
        this.clearMarkdownReloadTimeout()
        const projectLoadToken = this.dependencies.beginProjectLoad()
        this.dependencies.resetAgentConversations()
        this.actionReloadChangesByPath.clear()
        this.markdownReloadEventsByPath = new Map()
        this.dependencies.replaceProject(project)

        try {
            const projectConfig = await this.loadProjectConfig(project)
            await loadWorktrees(project)
            if (projectConfig === null) await this.saveMissingProjectConfig(project)

            const config = resolveProjectConfigPaths(configService.getProjectConfig())
            if (config.pushMode === 'manual') {
                await storage.restorePendingCommits?.(project)
                await this.loadPendingPush(project)
            }

            await this.loadActions(project, config.actionsFolder)
            const projectFiles = await storage.loadProjectRoot(project, config.workingFolder)
            const repositoryFiles: string[] = []
            this.dependencies.replaceProjectFiles(projectFiles.files, config.workingFolder, repositoryFiles)
            await this.dependencies.ensureCardInternalIds()
            this.tryStartProjectWatch()
            const currentSnapshot = this.dependencies.snapshot()
            if (!currentSnapshot) throw new Error('Project snapshot was not created')
            initializeMissingProjectStates(projectConfig ?? null, currentSnapshot)
            this.dependencies.dispatchChanged()
            reportActionLoadIssues()

            this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)
            void this.loadFullProjectInBackground(project, config.projectFolder, config.workingFolder, projectLoadToken)
            telemetryService.trackEvent('open_project')

            return currentSnapshot
        } catch (error) {
            this.clearFailedProjectLoad()
            dialogService.error(error, { fallbackMessage: 'Project could not be loaded', title: 'Project load failed' })
            telemetryService.captureError(error)
            markProjectLoadErrorReported(error)
            throw error
        }
    }

    async saveProjectConfig() {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot save project config before a project is open')

        await storage.saveProjectConfig(currentProject, configService.getProjectConfig())
        this.dependencies.dispatchPersistenceChanged()
    }

    async updateCardSeparator(previousSeparator: CardSeparator, nextSeparator: CardSeparator) {
        if (previousSeparator === nextSeparator) return 0

        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot rename card files before a project is open')

        await this.dependencies.flushPendingChanges()
        const projectFiles = await storage.loadProject(currentProject, config.projectFolder)
        const moves = planCardSeparatorMigration(projectFiles.files, previousSeparator, nextSeparator)
        if (moves.length === 0) return 0

        globalProgressService.start('Preparing card file names', moves.length)
        try {
            for (const [index, move] of moves.entries()) {
                globalProgressService.update(index, `Renaming ${move.fromPath}`)
                const inFlightCommitPaths = this.dependencies.commitPathsInFlight()
                inFlightCommitPaths.add(move.fromPath)
                inFlightCommitPaths.add(move.toPath)
                try {
                    await storage.moveFiles({
                        branch: currentProject.branch,
                        message: `Rename card file ${index + 1} of ${moves.length}`,
                        moves: [move],
                    })
                } finally {
                    inFlightCommitPaths.delete(move.fromPath)
                    inFlightCommitPaths.delete(move.toPath)
                }
                globalProgressService.update(index + 1, `Renamed ${move.toPath}`)
            }

            if (config.pushMode === 'auto') await storage.push(currentProject)
            await this.reloadCurrentProjectSnapshot()

            return moves.length
        } finally {
            globalProgressService.finish()
        }
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

        await this.dependencies.flushPendingChanges()
        const project = await storage.checkoutBranch(currentProject, branch)

        return this.openProject(project)
    }

    async push() {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot push before a project is open')

        await storage.push(currentProject)
        this.dependencies.dispatchPersistenceChanged()
    }

    async reloadCurrentProjectSnapshot() {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot reload project snapshot before a project is open')

        const project = currentProject
        const projectLoadToken = this.dependencies.beginProjectLoad()
        const projectFiles = await storage.loadProject(currentProject, config.projectFolder)
        const repositoryFiles = await storage.listRepositoryFiles(currentProject)
        this.dependencies.replaceProjectFiles(projectFiles.files, config.workingFolder, repositoryFiles)
        await this.dependencies.ensureCardInternalIds()
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

    private clearFailedProjectLoad() {
        this.stopProjectWatch()
        this.clearActionReloadTimeout()
        this.clearMarkdownReloadTimeout()
        this.dependencies.beginProjectLoad()
        this.dependencies.resetAgentConversations()
        this.dependencies.clearLoadedProject()
        this.actionReloadChangesByPath.clear()
        this.markdownReloadEventsByPath.clear()
        actionService.clear()
        worktreeService.clear()
        this.dependencies.dispatchChanged()
    }

    private async loadProjectConfig(project: ProjectReference) {
        const { storage } = this.dependencies.requireDependencies()

        try {
            const projectConfig = await storage.loadProjectConfig(project)
            configService.loadProjectConfig(projectConfig)

            return projectConfig
        } catch (error) {
            if (error instanceof GithubUnauthorizedError) throw error

            configService.loadProjectConfig(null)
            reportOptionalProjectLoadFailure('Project configuration', error)

            return undefined
        }
    }

    private async saveMissingProjectConfig(project: ProjectReference) {
        const { storage } = this.dependencies.requireDependencies()
        configService.set('project.backgroundShade', createRandomProjectBackgroundShade())

        try {
            await storage.saveProjectConfig(project, configService.getProjectConfig())
        } catch (error) {
            reportOptionalProjectLoadFailure('Generated project configuration', error)
        }
    }

    private async loadActions(project: ProjectReference, actionsFolder: string) {
        const { storage } = this.dependencies.requireDependencies()

        try {
            const actionFiles = await storage.loadActionFiles(project, actionsFolder)
            actionService.loadFromFiles(actionFiles)
        } catch (error) {
            actionService.clear()
            reportOptionalProjectLoadFailure('Actions', error)
        }
    }

    private async loadPendingPush(project: ProjectReference) {
        const { storage } = this.dependencies.requireDependencies()

        try {
            await storage.loadPendingPush?.(project)
        } catch (error) {
            reportOptionalProjectLoadFailure('Pending push state', error)
        }
    }

    private tryStartProjectWatch() {
        try {
            this.startProjectWatch()
        } catch (error) {
            reportOptionalProjectLoadFailure('Project file watching', error)
        }
    }

    private async importExternalCardFiles(files: MarkdownFile[], workingFolder: string) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) return files

        const plan = planExternalCardImports(files, workingFolder, config.cardSeparator, config.cardTypes, config.states[0].state)
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
        if (config.pushMode === 'manual') this.dependencies.dispatchPersistenceChanged()

        reportWorkspaceNotice(importedNoticeMessage(plan.moves.length))
        telemetryService.trackEvent('external_file_import')

        return mergeFiles(removeFilesByPath(files, plan.moves.map((move) => move.fromPath)), plan.importedFiles)
    }

    private async loadFullProjectInBackground(
        project: ProjectReference,
        projectFolder: string,
        workingFolder: string,
        projectLoadToken: number,
    ) {
        const { storage } = this.dependencies.requireDependencies()
        const [projectFilesResult, repositoryFilesResult] = await Promise.allSettled([
            storage.loadProject(project, projectFolder),
            storage.listRepositoryFiles(project),
        ])
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

        let nextFiles = this.dependencies.files()
        let projectFilesLoaded = false
        if (projectFilesResult.status === 'fulfilled') {
            try {
                const importedFiles = await this.importExternalCardFiles(projectFilesResult.value.files, workingFolder)
                if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

                const importedPaths = new Set(importedFiles.map((file) => file.path))
                const removedImportedPaths = projectFilesResult.value.files
                    .filter((file) => !importedPaths.has(file.path))
                    .map((file) => file.path)
                const remainingFiles = removeFilesByPath(this.dependencies.files(), removedImportedPaths)
                nextFiles = mergeFiles(importedFiles, remainingFiles)
                projectFilesLoaded = true
            } catch (error) {
                reportWorkspaceError(backgroundProjectLoadFailureMessage(error))
                telemetryService.captureError(error)
            }
        } else {
            reportWorkspaceError(backgroundProjectLoadFailureMessage(projectFilesResult.reason))
            telemetryService.captureError(projectFilesResult.reason)
        }

        const currentRepositoryFiles = this.dependencies.snapshot()?.repositoryFiles ?? []
        const repositoryFiles = repositoryFilesResult.status === 'fulfilled'
            ? repositoryFilesResult.value
            : currentRepositoryFiles
        if (repositoryFilesResult.status === 'rejected') {
            reportOptionalProjectLoadFailure('Repository file index', repositoryFilesResult.reason)
        }
        if (!projectFilesLoaded && repositoryFilesResult.status === 'rejected') return
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

        this.dependencies.replaceProjectFiles(nextFiles, workingFolder, repositoryFiles)
        await this.dependencies.ensureCardInternalIds()
        this.dependencies.dispatchChanged()
        const currentSnapshot = this.dependencies.snapshot()
        if (currentSnapshot) this.loadAgentConversationsInBackground(currentSnapshot, project, projectLoadToken)
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
            const change: ActionReloadChange = this.dependencies.commitPathsInFlight().has(event.path)
                ? { origin: 'local', path: event.path, revision: actionService.getPublicationRevision(event.path) }
                : { origin: 'external', path: event.path }
            this.scheduleActionReload(change)
            return
        }

        if (isProjectMarkdownPath(event.path, config.projectFolder)) this.scheduleMarkdownReload(event)
    }

    private scheduleActionReload(change: ActionReloadChange) {
        this.actionReloadChangesByPath.set(change.path, change)
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
        await this.dependencies.ensureCardInternalIds()
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

        const changes = [...this.actionReloadChangesByPath.values()]
        if (changes.length === 0) return

        this.clearActionReloadTimeout()
        this.actionReloadChangesByPath.clear()
        const actionFiles = await storage.loadActionFiles(currentProject, config.actionsFolder)
        actionService.reloadFromFiles(actionFiles, changes)
        reportActionLoadIssues()
    }
}
