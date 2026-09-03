import { ACTION_SCHEDULES_FILE } from '../../data/action_schedule_types'
import { deriveStatesFromCards, mergeStatesWithDefaults } from '../../data/card_ordering'
import type { CardSeparator } from '../../data/card_identifiers'
import { isMissingWorkingFolderError, resolveProjectConfigPaths, type MarkdownFile, type ProjectAsset, type ProjectConfig, type ProjectReference, type ProjectSnapshot, type ProjectWatchEvent, type StorageService } from '../../data/data_types'
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
import { planExternalCardImports, type ExternalCardImportPlan } from '../data/external_card_import_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { createRandomProjectBackgroundShade } from '../../theme/project_background_shade'
import { worktreeService } from './worktree_service'
import { planCardSeparatorMigration } from '../data/card_separator_migration'
import { globalProgressService } from '../global_progress_service'
import { dialogService } from '../dialog_service'
import { GithubUnauthorizedError } from '../../auth/github_api_client'
import { createDefaultActionFiles } from '../../project_template/project_template'
import { openFilesService } from '../open_files_service'
import { mergeConflictService } from './merge_conflict_service'
import { projectAccessService } from './project_access_service'
import { createProjectAgentTokenUsageFile, projectAgentTokenUsageService } from '../agents/project_agent_token_usage_service'
import { projectStatsService } from '../stats/project_stats_service'
import { diagramViewService } from '../diagrams/diagram_view_service'
import { normalizePath } from '../../../../shared/path_utils.mjs'
import {
    type ExpectedPersistenceOutcome,
    ExpectedPersistenceOutcomes,
    type ObservedPersistenceOutcome,
} from './expected_persistence_outcomes'

const ACTION_RELOAD_DEBOUNCE_MS = 150
const JSON_EXTENSION = '.json'
const MERGE_CONFLICT_VERIFY_DEBOUNCE_MS = 150
const MARKDOWN_EXTENSION = '.md'
const PROJECT_CONFIG_PATH = 'md2.config.json'
// The watcher already settles each path before reporting, so this only has to group
// events for different files into a single snapshot rebuild.
const MARKDOWN_RELOAD_DEBOUNCE_MS = 50
const MARKDOWN_REMOVAL_GRACE_MS = 750
const PROJECT_LOAD_ERROR_REPORTED = Symbol('project-load-error-reported')

type ReportedProjectLoadError = object & { [PROJECT_LOAD_ERROR_REPORTED]?: boolean }

interface ExternalCardImportResult {
    files: MarkdownFile[]
    importedFiles: MarkdownFile[]
    sourcePaths: string[]
    succeeded: boolean
}

interface ExternalCardImportInProgress {
    project: ProjectReference
    promise: Promise<ExternalCardImportResult>
}

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
    dialogService.displayError(`External change ignored for ${path} because the file has unsaved local edits.`)
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

function reportAgentTokenUsageFailure(error: unknown) {
    reportOptionalProjectLoadFailure('Agent token usage', error)
}

function initializeMissingProjectStates(projectConfig: Partial<ProjectConfig> | null, snapshot: ProjectSnapshot) {
    if (projectConfig?.states !== undefined) return

    const derivedStates = deriveStatesFromCards(snapshot.activeCards)
    configService.set('project.states', mergeStatesWithDefaults(derivedStates))
}

export interface ProjectLoadingDeps {
    beginProjectLoad(): number
    clearLoadedProject(): void
    expectedPersistenceOutcomes(): ExpectedPersistenceOutcomes
    dispatchChanged(): void
    dispatchPersistenceChanged(): void
    dispatchRepositoryChanged(event: ProjectWatchEvent): void
    ensureCardInternalIds(): Promise<void>
    files(): MarkdownFile[]
    flushPendingChanges(): Promise<void>
    hydrateActiveCardConversations(): Promise<void>
    matchesCurrentContent(path: string, content: string): boolean
    isCurrentLoad(project: ProjectReference, projectLoadToken: number): boolean
    mergeBackgroundProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]): void
    migrateAgentLogReferences(): Promise<void>
    markFullProjectLoaded(): void
    project(): ProjectReference | null
    projectToken(): number
    replaceFiles(files: MarkdownFile[], workingFolder: string): void
    replaceProject(project: ProjectReference | null): void
    replaceProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]): void
    updateFiles(updatedFiles: MarkdownFile[], removedPaths: string[], workingFolder: string): void
    updateRepositoryFile(event: ProjectWatchEvent): void
    requireDependencies(): RequiredDataServiceDependencies
    resetAgentConversations(): void
    snapshot(): ProjectSnapshot | null
    storage(): StorageService | null
}

export class ProjectLoading {
    private readonly dependencies: ProjectLoadingDeps
    private readonly prepareAgentConversationLoading: (projectLoadToken: number) => void
    private actionReloadChangesByPath: Map<string, ActionReloadChange> = new Map()
    private actionReloadTimeout: number | null = null
    private markdownReloadEventsByPath: Map<string, ProjectWatchEvent> = new Map()
    private markdownRemovalTimeoutsByPath: Map<string, number> = new Map()
    private markdownReloadTimeout: number | null = null
    private mergeConflictVerifyTimeout: number | null = null
    private externalCardImportInProgress: ExternalCardImportInProgress | null = null
    private watchCleanup: (() => void) | null = null

    constructor(
        dependencies: ProjectLoadingDeps,
        prepareAgentConversationLoading: (projectLoadToken: number) => void,
    ) {
        this.dependencies = dependencies
        this.prepareAgentConversationLoading = prepareAgentConversationLoading
    }

    reset() {
        this.stopProjectWatch()
        this.clearActionReloadTimeout()
        this.clearMarkdownReloadTimeout()
        this.clearMarkdownRemovalTimeouts()
        this.clearMergeConflictVerifyTimeout()
        this.actionReloadChangesByPath.clear()
        this.markdownReloadEventsByPath = new Map()
        this.dependencies.beginProjectLoad()
        projectAgentTokenUsageService.clear()
        projectStatsService.clear()
        diagramViewService.clear()
    }

    /** Rebind repository watching after storage transport replacement without reloading project data. */
    restartProjectWatch() {
        this.startProjectWatch()
    }

    async createProject(project: ProjectReference) {
        projectAccessService.requireWritable()
        const { config, storage } = this.dependencies.requireDependencies()
        const rawConfig = { ...configService.getProjectConfig(), backgroundShade: createRandomProjectBackgroundShade() }
        this.dependencies.replaceProject(await storage.createProject(project, [config.workingFolder]))
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot create a project without a project reference')

        await storage.commit({
            branch: currentProject.branch,
            files: [
                ...createDefaultActionFiles(config.actionsFolder),
                createProjectAgentTokenUsageFile(config.projectFolder),
            ],
            message: 'Add default MD² actions',
        })
        await storage.saveProjectConfig(currentProject, rawConfig)
        telemetryService.trackEvent('create_project')

        return this.openProject(currentProject)
    }

    async openProject(project: ProjectReference) {
        const { storage } = this.dependencies.requireDependencies()
        await this.dependencies.flushPendingChanges()
        this.clearMarkdownReloadTimeout()
        this.clearMarkdownRemovalTimeouts()
        this.clearMergeConflictVerifyTimeout()
        const projectLoadToken = this.dependencies.beginProjectLoad()
        this.dependencies.resetAgentConversations()
        this.actionReloadChangesByPath.clear()
        this.markdownReloadEventsByPath = new Map()
        this.dependencies.replaceProject(project)

        try {
            const projectConfig = await this.loadProjectConfig(project)
            if (projectConfig === null) await this.saveMissingProjectConfig(project)

            const config = resolveProjectConfigPaths(configService.getProjectConfig())
            projectStatsService.bindProject({ config, project, storage })
            diagramViewService.bindProject({ config, project, storage })
            if (config.pushMode === 'manual') {
                await storage.restorePendingCommits?.(project)
                await this.loadPendingPush(project)
            }

            try {
                await projectAgentTokenUsageService.load(project, config, storage, reportAgentTokenUsageFailure)
            } catch (error) {
                reportAgentTokenUsageFailure(error)
            }

            await this.loadActions(project, config.actionsFolder)
            const projectFiles = await storage.loadProjectRoot(project, config.workingFolder)
            const repositoryFiles: string[] = []
            this.dependencies.replaceProjectFiles(projectFiles.files, config.workingFolder, repositoryFiles)
            await this.ensureCardInternalIds()
            await this.dependencies.migrateAgentLogReferences()
            this.tryStartProjectWatch()
            const currentSnapshot = this.dependencies.snapshot()
            if (!currentSnapshot) throw new Error('Project snapshot was not created')
            initializeMissingProjectStates(projectConfig ?? null, currentSnapshot)
            this.prepareAgentConversationLoading(projectLoadToken)
            this.dependencies.dispatchChanged()
            void this.hydrateActiveCardConversations()
            reportActionLoadIssues()

            void this.loadFullProjectInBackground(project, config.projectFolder, config.workingFolder, projectLoadToken)
            telemetryService.trackEvent('open_project')

            return currentSnapshot
        } catch (error) {
            this.clearFailedProjectLoad()
            if (isMissingWorkingFolderError(error)) throw error

            dialogService.error(error, { fallbackMessage: 'Project could not be loaded', title: 'Project load failed' })
            markProjectLoadErrorReported(error)
            throw error
        }
    }

    async saveProjectConfig() {
        projectAccessService.requireWritable()
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot save project config before a project is open')

        await storage.saveProjectConfig(currentProject, configService.getProjectConfig())
        this.dependencies.dispatchPersistenceChanged()
    }

    async updateCardSeparator(previousSeparator: CardSeparator, nextSeparator: CardSeparator) {
        projectAccessService.requireWritable()
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
                await storage.moveFiles({
                    branch: currentProject.branch,
                    message: `Rename card file ${index + 1} of ${moves.length}`,
                    moves: [move],
                })
                globalProgressService.update(index + 1, `Renamed ${move.toPath}`)
            }

            if (config.pushMode === 'auto') await storage.push(currentProject)
            await this.dependencies.flushPendingChanges()
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
        projectAccessService.requireWritable()
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot push before a project is open')

        await storage.push(currentProject)
        this.dependencies.dispatchPersistenceChanged()
    }

    async pull() {
        projectAccessService.requireWritable()
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot pull before a project is open')
        if (!storage.pull) throw new Error('Pulling the primary worktree is not available')

        await storage.pull(currentProject)
    }

    async reloadCurrentProjectSnapshot() {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot reload project snapshot before a project is open')

        const projectLoadToken = this.dependencies.beginProjectLoad()
        this.prepareAgentConversationLoading(projectLoadToken)
        const projectFiles = await storage.loadProject(currentProject, config.projectFolder)
        const repositoryFiles = await storage.listRepositoryFiles(currentProject)
        this.dependencies.replaceProjectFiles(projectFiles.files, config.workingFolder, repositoryFiles)
        await this.ensureCardInternalIds()
        await this.dependencies.migrateAgentLogReferences()
        this.dependencies.markFullProjectLoaded()
        this.dependencies.dispatchChanged()
        void this.hydrateActiveCardConversations()
        return this.dependencies.snapshot()
    }

    stopProjectWatch() {
        if (!this.watchCleanup) return

        this.watchCleanup()
        this.watchCleanup = null
    }

    async reloadConflictPaths(paths: string[]) {
        const { config } = this.dependencies.requireDependencies()
        for (const path of paths) {
            if (!isProjectMarkdownPath(path, config.projectFolder)) continue
            this.markdownReloadEventsByPath.set(path, { changeKind: 'unknown', path })
        }
        if (this.markdownReloadEventsByPath.size === 0) return

        await this.reloadMarkdownFilesFromWatchEvents()
    }

    private clearFailedProjectLoad() {
        this.stopProjectWatch()
        this.clearActionReloadTimeout()
        this.clearMarkdownReloadTimeout()
        this.clearMarkdownRemovalTimeouts()
        this.clearMergeConflictVerifyTimeout()
        this.dependencies.beginProjectLoad()
        this.dependencies.resetAgentConversations()
        projectAgentTokenUsageService.clear()
        projectStatsService.clear()
        diagramViewService.clear()
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
        if (projectAccessService.getSnapshot()) return files

        const currentProject = this.dependencies.project()
        if (!currentProject) return files

        let nextFiles = files
        while (this.externalCardImportInProgress) {
            const activeImport = this.externalCardImportInProgress
            const result = await activeImport.promise
            const isSameProject = activeImport.project.id === currentProject.id
                && activeImport.project.branch === currentProject.branch
            if (isSameProject) {
                if (!result.succeeded) return nextFiles
                nextFiles = mergeFiles(removeFilesByPath(nextFiles, result.sourcePaths), result.importedFiles)
            }
            if (this.externalCardImportInProgress === activeImport) this.externalCardImportInProgress = null
        }

        const activeProject = this.dependencies.project()
        if (activeProject?.id !== currentProject.id || activeProject.branch !== currentProject.branch) return nextFiles

        const { config } = this.dependencies.requireDependencies()
        const plan = planExternalCardImports(nextFiles, workingFolder, config.cardSeparator, config.cardTypes, config.states[0].state)
        if (plan.moves.length === 0) return nextFiles

        const promise = this.executeExternalCardImport(nextFiles, currentProject, plan)
        const activeImport = { project: currentProject, promise }
        this.externalCardImportInProgress = activeImport

        try {
            const result = await promise

            return result.files
        } finally {
            if (this.externalCardImportInProgress === activeImport) this.externalCardImportInProgress = null
        }
    }

    private async executeExternalCardImport(
        files: MarkdownFile[],
        currentProject: ProjectReference,
        plan: ExternalCardImportPlan,
    ): Promise<ExternalCardImportResult> {
        const { config, storage } = this.dependencies.requireDependencies()

        const sourcePaths = plan.moves.map((move) => move.fromPath)

        try {
            await storage.moveFiles({
                branch: currentProject.branch,
                message: `Import ${plan.moves.length} external ${plan.moves.length === 1 ? 'file' : 'files'}`,
                moves: plan.moves,
            })
        } catch (error) {
            reportWorkspaceError(errorMessage(error, 'External file import failed'))
            telemetryService.captureError(error)

            return { files, importedFiles: [], sourcePaths: [], succeeded: false }
        }

        if (config.pushMode === 'auto') await storage.push(currentProject)
        if (config.pushMode === 'manual') this.dependencies.dispatchPersistenceChanged()

        reportWorkspaceNotice(importedNoticeMessage(plan.moves.length))
        telemetryService.trackEvent('external_file_import')

        const importedFiles = mergeFiles(removeFilesByPath(files, sourcePaths), plan.importedFiles)

        return { files: importedFiles, importedFiles: plan.importedFiles, sourcePaths, succeeded: true }
    }

    private async loadFullProjectInBackground(
        project: ProjectReference,
        projectFolder: string,
        workingFolder: string,
        projectLoadToken: number,
    ) {
        const { storage } = this.dependencies.requireDependencies()
        const [projectFilesResult, repositoryFilesResult] = await Promise.allSettled([
            storage.loadProject(project, projectFolder, workingFolder),
            storage.listRepositoryFiles(project),
        ])
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

        let nextFiles = this.dependencies.files()
        let projectFilesLoaded = false
        if (projectFilesResult.status === 'fulfilled') {
            try {
                const loadedFiles = mergeFiles(projectFilesResult.value.files, this.dependencies.files())
                const importedFiles = await this.importExternalCardFiles(loadedFiles, workingFolder)
                if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

                const importedPaths = new Set(importedFiles.map((file) => file.path))
                const removedImportedPaths = loadedFiles
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

        this.dependencies.mergeBackgroundProjectFiles(nextFiles, workingFolder, repositoryFiles)
        await this.ensureCardInternalIds()
        await this.dependencies.migrateAgentLogReferences()
        if (projectFilesLoaded) this.dependencies.markFullProjectLoaded()
        this.dependencies.dispatchChanged()
    }

    private shouldApplyProjectLoad(project: ProjectReference, projectLoadToken: number) {
        return this.dependencies.isCurrentLoad(project, projectLoadToken)
    }

    private async hydrateActiveCardConversations() {
        try {
            await this.dependencies.hydrateActiveCardConversations()
        } catch (error) {
            telemetryService.captureError(error)
        }
    }

    private startProjectWatch() {
        this.stopProjectWatch()
        const currentProject = this.dependencies.project()
        const storage = this.dependencies.storage()
        if (!currentProject || !storage?.watchProject) return

        this.watchCleanup = storage.watchProject(
            currentProject,
            (event) => this.handleProjectWatchEvent(event),
            () => void this.resynchronizeProjectAfterWatchRestore(),
            (error) => reportOptionalProjectLoadFailure('Project file watching', error),
        )
    }

    private async resynchronizeProjectAfterWatchRestore() {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) return

        try {
            await this.verifyExpectedPersistenceOutcomes()
            const projectFiles = await storage.loadProject(currentProject, config.projectFolder)
            if (this.dependencies.project() !== currentProject) return

            const currentFiles = this.dependencies.files().filter((file) => isProjectMarkdownPath(file.path, config.projectFolder))
            const currentFilesByPath = new Map(currentFiles.map((file) => [file.path, file]))
            const loadedPaths = new Set<string>()
            for (const file of projectFiles.files) {
                if (!isProjectMarkdownPath(file.path, config.projectFolder)) continue

                loadedPaths.add(file.path)
                const currentFile = currentFilesByPath.get(file.path)
                if (currentFile?.content === file.content) continue

                this.handleProjectWatchEvent({
                    changeKind: currentFile ? 'changed' : 'added',
                    path: file.path,
                })
            }
            for (const file of currentFiles) {
                if (!loadedPaths.has(file.path)) this.handleProjectWatchEvent({ changeKind: 'removed', path: file.path })
            }
        } catch (error) {
            reportOptionalProjectLoadFailure('Project resynchronization', error)
        }
    }

    private handleProjectWatchEvent(event: ProjectWatchEvent) {
        if (mergeConflictService.isConflictedPath(event.path)) {
            this.scheduleMergeConflictVerification()
            return
        }

        const expectedOutcome = this.dependencies.expectedPersistenceOutcomes().getExpected(event.path)
        if (expectedOutcome) {
            void this.classifyExpectedWatchEvent(expectedOutcome)
            return
        }

        this.handleExternalProjectWatchEvent(event)
    }

    private handleExternalProjectWatchEvent(event: ProjectWatchEvent) {
        this.dependencies.updateRepositoryFile(event)
        this.dependencies.dispatchRepositoryChanged(event)
        if (event.path === PROJECT_CONFIG_PATH) {
            void this.reloadProjectConfigFromWatch()
            return
        }
        const { config } = this.dependencies.requireDependencies()
        if (isActionDefinitionPath(event.path, config.actionsFolder)) {
            const change: ActionReloadChange = { origin: 'external', path: event.path }
            this.scheduleActionReload(change)
            return
        }

        if (!isProjectMarkdownPath(event.path, config.projectFolder)) return

        this.scheduleMarkdownReload(event)
    }

    private async classifyExpectedWatchEvent(expectedOutcome: ExpectedPersistenceOutcome) {
        const currentProject = this.dependencies.project()
        if (!currentProject) return
        const projectLoadToken = this.dependencies.projectToken()
        const outcomes = this.dependencies.expectedPersistenceOutcomes()
        await outcomes.waitForSettled(expectedOutcome.path)
        if (!this.dependencies.isCurrentLoad(currentProject, projectLoadToken)) return

        const latestExpectedOutcome = outcomes.getExpected(expectedOutcome.path)
        if (!latestExpectedOutcome) return
        const observedOutcome = await this.observePersistenceOutcome(latestExpectedOutcome, currentProject)
        if (!observedOutcome || !this.dependencies.isCurrentLoad(currentProject, projectLoadToken)) return

        const classification = outcomes.classify(observedOutcome)
        if (classification === 'matched') {
            this.publishObservedRepositoryChange(observedOutcome)
            return
        }
        if (classification === 'mismatched') {
            this.handleExternalProjectWatchEvent(this.watchEventFromObserved(observedOutcome))
        }
    }

    async verifyExpectedPersistenceOutcomes() {
        const currentProject = this.dependencies.project()
        if (!currentProject) return
        const projectLoadToken = this.dependencies.projectToken()
        const outcomes = this.dependencies.expectedPersistenceOutcomes()
        const retainedOutcomes = outcomes.getRetainedOutcomes()

        for (const retainedOutcome of retainedOutcomes) {
            await outcomes.waitForSettled(retainedOutcome.path)
            if (!this.dependencies.isCurrentLoad(currentProject, projectLoadToken)) return

            const latestExpectedOutcome = outcomes.getExpected(retainedOutcome.path)
            if (!latestExpectedOutcome) continue
            const observedOutcome = await this.observePersistenceOutcome(latestExpectedOutcome, currentProject)
            if (!observedOutcome || !this.dependencies.isCurrentLoad(currentProject, projectLoadToken)) continue

            const classification = outcomes.classify(observedOutcome)
            if (classification === 'matched') this.publishObservedRepositoryChange(observedOutcome)
            if (classification === 'mismatched') {
                this.handleExternalProjectWatchEvent(this.watchEventFromObserved(observedOutcome))
            }
        }
    }

    private async observePersistenceOutcome(
        expectedOutcome: ExpectedPersistenceOutcome,
        currentProject: ProjectReference,
    ): Promise<ObservedPersistenceOutcome | null> {
        const { config, storage } = this.dependencies.requireDependencies()
        const normalizedPath = normalizePath(expectedOutcome.path)

        try {
            const repositoryFiles = await storage.listRepositoryFiles(currentProject)
            const persistedPath = repositoryFiles.map(normalizePath).find((path) => path === normalizedPath)
            if (!persistedPath) return { kind: 'absent', path: normalizedPath }
            if (expectedOutcome.kind === 'absent') return { content: '', kind: 'present', path: normalizedPath }

            if (isActionDefinitionPath(normalizedPath, config.actionsFolder)) {
                const actionFiles = await storage.loadActionFiles(currentProject, config.actionsFolder)
                const actionFile = actionFiles.find(({ path }) => normalizePath(path) === normalizedPath)

                return actionFile
                    ? { content: actionFile.content, kind: 'present', path: normalizedPath }
                    : { kind: 'absent', path: normalizedPath }
            }
            if (isProjectMarkdownPath(normalizedPath, config.projectFolder) && storage.loadFile) {
                const file = await storage.loadFile(currentProject, normalizedPath)

                return { content: file.content, kind: 'present', path: normalizedPath }
            }
            if (expectedOutcome.encoding === 'base64' && storage.loadProjectAsset) {
                const asset = await storage.loadProjectAsset(currentProject, normalizedPath)

                return { content: asset.content, encoding: 'base64', kind: 'present', path: normalizedPath }
            }
            if (storage.loadTextFile) {
                const file = await storage.loadTextFile(currentProject, normalizedPath)

                return { content: file.content, kind: 'present', path: normalizedPath }
            }

            return null
        } catch (error) {
            reportOptionalProjectLoadFailure(`Persistence outcome verification for ${normalizedPath}`, error)

            return null
        }
    }

    private watchEventFromObserved(observedOutcome: ObservedPersistenceOutcome): ProjectWatchEvent {
        if (observedOutcome.kind === 'absent') return { changeKind: 'removed', path: observedOutcome.path }

        const repositoryFiles = this.dependencies.snapshot()?.repositoryFiles ?? []
        const pathExists = repositoryFiles.map(normalizePath).includes(observedOutcome.path)

        return { changeKind: pathExists ? 'changed' : 'added', path: observedOutcome.path }
    }

    private publishObservedRepositoryChange(observedOutcome: ObservedPersistenceOutcome) {
        const event = this.watchEventFromObserved(observedOutcome)
        this.dependencies.updateRepositoryFile(event)
        this.dependencies.dispatchRepositoryChanged(event)
    }

    private async reloadProjectConfigFromWatch() {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) return

        try {
            configService.loadProjectConfig(await storage.loadProjectConfig(currentProject))
        } catch (error) {
            reportOptionalProjectLoadFailure('Project configuration reload', error)
        }
    }

    private scheduleActionReload(change: ActionReloadChange) {
        this.actionReloadChangesByPath.set(change.path, change)
        this.clearActionReloadTimeout()
        this.actionReloadTimeout = window.setTimeout(() => {
            void this.reloadActionsFromCurrentProject()
        }, ACTION_RELOAD_DEBOUNCE_MS)
    }

    private scheduleMergeConflictVerification() {
        this.clearMergeConflictVerifyTimeout()
        this.mergeConflictVerifyTimeout = window.setTimeout(() => {
            void this.verifyMergeConflictState()
        }, MERGE_CONFLICT_VERIFY_DEBOUNCE_MS)
    }

    private clearMergeConflictVerifyTimeout() {
        if (this.mergeConflictVerifyTimeout === null) return

        window.clearTimeout(this.mergeConflictVerifyTimeout)
        this.mergeConflictVerifyTimeout = null
    }

    private async verifyMergeConflictState() {
        this.clearMergeConflictVerifyTimeout()
        try {
            await mergeConflictService.verifyCurrentSession()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not verify merge conflict state after file change' })
        }
    }

    private clearActionReloadTimeout() {
        if (this.actionReloadTimeout === null) return

        window.clearTimeout(this.actionReloadTimeout)
        this.actionReloadTimeout = null
    }

    private scheduleMarkdownReload(event: ProjectWatchEvent) {
        const pendingRemovalTimeout = this.markdownRemovalTimeoutsByPath.get(event.path)
        if (pendingRemovalTimeout !== undefined) {
            window.clearTimeout(pendingRemovalTimeout)
            this.markdownRemovalTimeoutsByPath.delete(event.path)
        }

        if (event.changeKind === 'removed') {
            const timeout = window.setTimeout(() => {
                this.markdownRemovalTimeoutsByPath.delete(event.path)
                this.markdownReloadEventsByPath.set(event.path, event)
                this.scheduleMarkdownReloadBatch()
            }, MARKDOWN_REMOVAL_GRACE_MS)
            this.markdownRemovalTimeoutsByPath.set(event.path, timeout)
            return
        }

        this.markdownReloadEventsByPath.set(event.path, event)
        this.scheduleMarkdownReloadBatch()
    }

    private scheduleMarkdownReloadBatch() {
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

    private clearMarkdownRemovalTimeouts() {
        this.markdownRemovalTimeoutsByPath.forEach((timeout) => window.clearTimeout(timeout))
        this.markdownRemovalTimeoutsByPath.clear()
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
            const loadedFile = event.changeKind === 'removed' ? null : await this.loadWatchedMarkdownFile(event)
            if (loadedFile && this.dependencies.matchesCurrentContent(loadedFile.path, loadedFile.content)) continue
            const dirtyOpenDocument = openFilesService.getRegisteredDocuments().some((document) => (
                document.kind === 'card' && document.path === event.path && document.dirty
            ))
            if (commitBatcher.hasPendingFile(event.path) || dirtyOpenDocument) {
                reportMarkdownWatchConflict(event.path)
                continue
            }

            if (event.changeKind === 'removed') {
                removedPaths.push(event.path)
                continue
            }

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

        const { config } = this.dependencies.requireDependencies()
        const currentFiles = this.dependencies.files()
        const currentFilesByPath = new Map(currentFiles.map((file) => [file.path, file]))
        const importedPaths = new Set(importedFiles.map((file) => file.path))
        const changedFiles = importedFiles.filter((file) => {
            const currentFile = currentFilesByPath.get(file.path)
            return !currentFile || currentFile.content !== file.content || currentFile.sha !== file.sha
        })
        const deletedPaths = currentFiles.filter((file) => !importedPaths.has(file.path)).map((file) => file.path)
        this.dependencies.updateFiles(changedFiles, deletedPaths, config.workingFolder)
        await this.ensureCardInternalIds()
        await this.dependencies.migrateAgentLogReferences()
        this.dependencies.dispatchChanged()
    }

    private async ensureCardInternalIds() {
        if (projectAccessService.getSnapshot()) return

        await this.dependencies.ensureCardInternalIds()
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
