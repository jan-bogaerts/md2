import {
    DEFAULT_PROJECT_CONFIG,
    MISSING_WORKING_FOLDER_ERROR,
    resolveProjectConfigPaths,
    type BranchReference,
    type CardDraft,
    type ProjectReference,
    type RepositoryReference,
    type StorageService,
    type TopLevelFolderReference,
} from '../../data/data_types'
import { deriveStatesFromCards, mergeStatesWithDefaults } from '../../data/card_ordering'
import { createStorageService, readLastProject, writeLastProject, type StorageType } from '../../data/project_session'
import { activateStorageService } from '../../data/project_storage_activation'
import { configureRemoteControlConnection } from '../../data/remote_control_connection'
import { configService } from '../config/config_service'
import { dataService } from '../data/data_service'
import { dialogService } from '../dialog_service'
import { GithubPendingCommitConflictError, GithubStorageService } from '../github/github_storage_service'
import { markdownParsingService } from '../data/markdown_parsing_service'
import { register } from '../service_injector'
import { createRandomProjectBackgroundShade } from '../../theme/project_background_shade'
import { isProjectLoadErrorReported } from './project_loading'
import { projectPersistenceService } from './project_persistence_service'
import { createDefaultActionFiles } from '../../project_template/project_template'

export interface MissingWorkingFolderResolution {
    kind: 'missing-working-folder'
    configuredWorkingFolder: string
    folders: TopLevelFolderReference[]
    project: ProjectReference
    resolvedWorkingFolder: string
    storageType: StorageType
}

export interface ProjectFolderSetupResolution {
    folders: TopLevelFolderReference[]
    kind: 'project-folder-setup'
    project: ProjectReference
    storageType: 'github' | 'local'
}

export type ProjectOpenResolution = MissingWorkingFolderResolution | ProjectFolderSetupResolution

export interface ProjectSessionState {
    errorMessage: string | null
    isCommitting: boolean
    isLoading: boolean
    isPulling: boolean
    isPushing: boolean
    pendingGithubConflictProject: ProjectReference | null
}

const EMPTY_TOP_LEVEL_FOLDERS: TopLevelFolderReference[] = []

function isMissingWorkingFolderError(error: unknown): error is { workingFolder: string } {
    if (!error || typeof error !== 'object') return false

    const storageError = error as { code?: unknown; workingFolder?: unknown }

    return storageError.code === MISSING_WORKING_FOLDER_ERROR && typeof storageError.workingFolder === 'string'
}

function createGithubStorage(accessToken: string | null) {
    const storage = new GithubStorageService()
    storage.init({ accessToken: accessToken ?? '' })

    return storage
}

async function persistWorkingFolder(storage: StorageService, project: ProjectReference, workingFolder: string) {
    const projectConfig = await storage.loadProjectConfig(project)
    configService.loadProjectConfig(projectConfig)
    let nextConfig = { ...configService.getProjectConfig(), workingFolder }
    if (projectConfig?.states === undefined) {
        const resolvedConfig = resolveProjectConfigPaths(nextConfig)
        const projectFiles = await storage.loadProjectRoot(project, resolvedConfig.workingFolder)
        const { activeCards } = markdownParsingService.splitCards(projectFiles.files, resolvedConfig.workingFolder)
        const derivedStates = deriveStatesFromCards(activeCards)
        nextConfig = { ...nextConfig, states: mergeStatesWithDefaults(derivedStates) }
    }
    configService.loadProjectConfig(nextConfig)
    await storage.saveProjectConfig(project, nextConfig)
}

function requireProjectFolder(projectFolder: string) {
    const normalizedFolder = projectFolder.trim().replace(/\\/gu, '/')
    if (normalizedFolder.length === 0) throw new Error('Project folder is required')
    if (normalizedFolder === '.' || normalizedFolder === '..' || normalizedFolder.includes('/')) {
        throw new Error('Project folder must be a root folder name')
    }

    return normalizedFolder
}

async function listTopLevelFolders(storage: StorageService, project: ProjectReference) {
    try {
        return await storage.listTopLevelFolders(project)
    } catch {
        return EMPTY_TOP_LEVEL_FOLDERS
    }
}

async function createMissingWorkingFolderResolution(
    storage: StorageService,
    storageType: StorageType,
    project: ProjectReference,
): Promise<MissingWorkingFolderResolution> {
    const config = configService.getProjectConfig()
    const resolvedConfig = resolveProjectConfigPaths(config)
    const folders = await listTopLevelFolders(storage, project)

    return {
        configuredWorkingFolder: config.workingFolder,
        folders,
        kind: 'missing-working-folder',
        project,
        resolvedWorkingFolder: resolvedConfig.workingFolder,
        storageType,
    }
}

async function loadProjectSession(storage: StorageService, storageType: StorageType, project: ProjectReference) {
    try {
        await activateProjectSession(storage, storageType, project)

        return null
    } catch (error) {
        if (!isMissingWorkingFolderError(error)) throw error

        return createMissingWorkingFolderResolution(storage, storageType, project)
    }
}

async function activateProjectSession(storage: StorageService, storageType: StorageType, project: ProjectReference) {
    await projectPersistenceService.flushPendingChanges()
    await activateStorageService(storageType, storage)
    dataService.init({ storage })
    await dataService.projectLoading.openProject(project)
    writeLastProject(storageType, project)
}

async function resolveRestoredProject(storageType: StorageType, storage: StorageService, project: ProjectReference) {
    if (storageType !== 'local') return project
    if (!storage.resolveProject) throw new Error('Local project validation is not available')

    return storage.resolveProject(project)
}

export class ProjectSessionService extends EventTarget {
    private state: ProjectSessionState = {
        errorMessage: null,
        isCommitting: false,
        isLoading: false,
        isPulling: false,
        isPushing: false,
        pendingGithubConflictProject: null,
    }

    constructor() {
        super()
        register('projectSessionService', this)
    }

    getSnapshot(): ProjectSessionState {
        return this.state
    }

    setError(message: string | null) {
        this.state = { ...this.state, errorMessage: message, pendingGithubConflictProject: null }
        this.dispatchChanged()
    }

    /** Restore last project through same service-owned loading path used by explicit project opens. */
    async restoreLastProject(accessToken: string | null) {
        this.setError(null)
        const lastProject = readLastProject()
        if (!lastProject) return
        if (lastProject.storageType === 'github' && !accessToken) return

        const storage = createStorageService(lastProject.storageType, accessToken)
        const project = await resolveRestoredProject(lastProject.storageType, storage, lastProject.project)
        await activateProjectSession(storage, lastProject.storageType, project)
    }

    async listRepositories(accessToken: string | null): Promise<RepositoryReference[]> {
        return this.withLoading('Repository list failed', async () => createGithubStorage(accessToken).listRepositories())
    }

    async listBranches(storageType: StorageType, project: ProjectReference, accessToken: string | null): Promise<BranchReference[]> {
        return this.withLoading('Branch list failed', async () => {
            const storage = createStorageService(storageType, accessToken)

            return storage.listBranches(project)
        })
    }

    async findGithubRepositoryBranches(owner: string, repositoryName: string, accessToken: string | null) {
        return this.withLoading('Manual repository branch list failed', async () => {
            const storage = createGithubStorage(accessToken)
            const repository = await storage.findRepository(owner, repositoryName)
            const branches = await storage.listBranches(repository)

            return { branches, repository }
        })
    }

    async openProject(
        storageType: StorageType,
        project: ProjectReference,
        accessToken: string | null,
        existingStorage?: StorageService,
    ): Promise<ProjectOpenResolution | null> {
        return this.withLoading('Project load failed', async () => {
            const storage = existingStorage ?? createStorageService(storageType, accessToken)
            if (storageType === 'github' || storageType === 'local') {
                const projectConfig = await storage.loadProjectConfig(project)
                if (projectConfig !== null) return loadProjectSession(storage, storageType, project)

                const folders = await listTopLevelFolders(storage, project)

                return { folders, kind: 'project-folder-setup', project, storageType }
            }

            return loadProjectSession(storage, storageType, project)
        })
    }

    async openWorkingFolder(resolution: MissingWorkingFolderResolution, folder: TopLevelFolderReference, accessToken: string | null) {
        await this.withLoading('Working folder selection failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            await persistWorkingFolder(storage, resolution.project, folder.path)
            await activateProjectSession(storage, resolution.storageType, resolution.project)
        })
    }

    async createWorkingFolder(resolution: MissingWorkingFolderResolution, accessToken: string | null) {
        await this.withLoading('Working folder creation failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            const project = await storage.createProject(resolution.project, resolution.resolvedWorkingFolder)
            await persistWorkingFolder(storage, project, resolution.configuredWorkingFolder)
            await activateProjectSession(storage, resolution.storageType, project)
        })
    }

    async createProjectFolders(resolution: ProjectFolderSetupResolution, projectFolder: string, accessToken: string | null) {
        await this.withLoading('Project folder creation failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            const normalizedProjectFolder = requireProjectFolder(projectFolder)
            const projectConfig = {
                ...DEFAULT_PROJECT_CONFIG,
                backgroundShade: createRandomProjectBackgroundShade(),
                projectFolder: normalizedProjectFolder,
            }
            const resolvedConfig = resolveProjectConfigPaths(projectConfig)
            const project = await storage.createProject(resolution.project, resolvedConfig.workingFolder)
            await storage.commit({
                branch: project.branch,
                files: createDefaultActionFiles(resolvedConfig.actionsFolder),
                message: 'Add default MD² actions',
            })
            await storage.saveProjectConfig(project, projectConfig)
            configService.loadProjectConfig(projectConfig)
            await activateProjectSession(storage, resolution.storageType, project)
        })
    }

    configureRemote(endpoint: string, token: string) {
        this.setError(null)
        configureRemoteControlConnection({ endpoint, token })
    }

    async activateRemoteConnection(storage: StorageService) {
        await this.withLoading('Remote desktop config load failed', () => activateStorageService('remote', storage))
    }

    async switchBranch(branch: string) {
        await this.withLoading('Branch switch failed', () => dataService.projectLoading.switchBranch(branch))
    }

    async push() {
        this.state = { ...this.state, isPushing: true }
        this.dispatchChanged()

        try {
            await this.withLoading('Push failed', async () => {
                await projectPersistenceService.flushPendingChanges()
                await dataService.projectLoading.push()
            })
        } finally {
            this.state = { ...this.state, isPushing: false }
            this.dispatchChanged()
        }
    }

    async commit() {
        this.state = { ...this.state, isCommitting: true }
        this.dispatchChanged()

        try {
            await this.withLoading('Commit failed', () => projectPersistenceService.flushPendingChanges())
        } finally {
            this.state = { ...this.state, isCommitting: false }
            this.dispatchChanged()
        }
    }

    async pull() {
        this.state = { ...this.state, isPulling: true }
        this.dispatchChanged()

        try {
            await this.withLoading('Pull failed', () => dataService.projectLoading.pull())
        } finally {
            this.state = { ...this.state, isPulling: false }
            this.dispatchChanged()
        }
    }

    discardGithubPendingCommits(project: ProjectReference, accessToken: string | null) {
        const storage = createGithubStorage(accessToken)
        storage.discardPendingCommits(project)
        this.state = { ...this.state, errorMessage: null, pendingGithubConflictProject: null }
        this.dispatchChanged()
    }

    async getReleaseBranchCandidates() {
        return this.withLoading('Release preparation failed', () => dataService.releases.getReleaseBranchCandidates())
    }

    async completeRelease(releaseName: string, selectedBranchNames: string[]) {
        await this.withLoading('Release completion failed', () => dataService.releases.completeRelease(releaseName, selectedBranchNames))
    }

    async createCard(draft: CardDraft, initialState: string) {
        await this.withLoading('Card creation failed', () => dataService.cards.createCard(draft, initialState))
    }

    private async withLoading<T>(fallbackMessage: string, operation: () => Promise<T>): Promise<T> {
        this.state = { ...this.state, errorMessage: null, isLoading: true, pendingGithubConflictProject: null }
        this.dispatchChanged()

        try {
            return await operation()
        } catch (error) {
            const message = error instanceof Error ? error.message : fallbackMessage
            this.state = {
                ...this.state,
                errorMessage: message,
                isLoading: false,
                pendingGithubConflictProject: error instanceof GithubPendingCommitConflictError ? error.project : null,
            }
            this.dispatchChanged()
            if (!isProjectLoadErrorReported(error)) dialogService.error(error, { fallbackMessage })
            throw error
        } finally {
            if (this.state.isLoading) {
                this.state = { ...this.state, isLoading: false }
                this.dispatchChanged()
            }
        }
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<ProjectSessionState>('changed', { detail: this.state }))
    }
}

export const projectSessionService = new ProjectSessionService()
