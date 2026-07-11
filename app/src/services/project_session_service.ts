import {
    MISSING_WORKING_FOLDER_ERROR,
    resolveProjectConfigPaths,
    type BranchReference,
    type CardDraft,
    type ProjectReference,
    type RepositoryReference,
    type StorageService,
    type TopLevelFolderReference,
} from '../data/data_types'
import { deriveStatesFromCards, mergeStatesWithDefaults } from '../data/card_ordering'
import { createStorageService, writeLastProject, type StorageType } from '../data/project_session'
import { activateStorageService } from '../data/project_storage_activation'
import { configureRemoteControlConnection } from '../data/remote_control_connection'
import { configService } from './config_service'
import { dataService } from './data_service'
import { dialogService } from './dialog_service'
import { GithubPendingCommitConflictError, GithubStorageService } from './github_storage_service'
import { markdownParsingService } from './markdown_parsing_service'
import { register } from './service_injector'

export interface MissingWorkingFolderResolution {
    configuredWorkingFolder: string
    folders: TopLevelFolderReference[]
    project: ProjectReference
    resolvedWorkingFolder: string
    storageType: StorageType
}

export interface ProjectSessionState {
    errorMessage: string | null
    isLoading: boolean
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

export class ProjectSessionService extends EventTarget {
    private state: ProjectSessionState = { errorMessage: null, isLoading: false, pendingGithubConflictProject: null }

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
    ): Promise<MissingWorkingFolderResolution | null> {
        return this.withLoading('Project load failed', async () => {
            const storage = createStorageService(storageType, accessToken)
            try {
                dataService.init({ storage })
                activateStorageService(storageType, storage)
                await dataService.projectLoading.openProject(project)
                writeLastProject(storageType, project)

                return null
            } catch (error) {
                if (!isMissingWorkingFolderError(error)) throw error

                return ProjectSessionService.createMissingWorkingFolderResolution(storage, storageType, project)
            }
        })
    }

    async openWorkingFolder(resolution: MissingWorkingFolderResolution, folder: TopLevelFolderReference, accessToken: string | null) {
        await this.withLoading('Working folder selection failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            await persistWorkingFolder(storage, resolution.project, folder.path)
            dataService.init({ storage })
            activateStorageService(resolution.storageType, storage)
            await dataService.projectLoading.openProject(resolution.project)
            writeLastProject(resolution.storageType, resolution.project)
        })
    }

    async createWorkingFolder(resolution: MissingWorkingFolderResolution, accessToken: string | null) {
        await this.withLoading('Working folder creation failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            const project = await storage.createWorkingFolderFromTemplate(resolution.project, resolution.resolvedWorkingFolder)
            await persistWorkingFolder(storage, project, resolution.configuredWorkingFolder)
            dataService.init({ storage })
            activateStorageService(resolution.storageType, storage)
            await dataService.projectLoading.openProject(project)
            writeLastProject(resolution.storageType, project)
        })
    }

    configureRemote(endpoint: string, token: string) {
        this.setError(null)
        configureRemoteControlConnection({ endpoint, token })
    }

    async switchBranch(branch: string) {
        await this.withLoading('Branch switch failed', () => dataService.projectLoading.switchBranch(branch))
    }

    async push() {
        await this.withLoading('Push failed', () => dataService.projectLoading.push())
    }

    discardGithubPendingCommits(project: ProjectReference, accessToken: string | null) {
        const storage = createGithubStorage(accessToken)
        storage.discardPendingCommits(project)
        this.state = { ...this.state, errorMessage: null, pendingGithubConflictProject: null }
        this.dispatchChanged()
    }

    async completeRelease(releaseName: string) {
        await this.withLoading('Release completion failed', () => dataService.releases.completeRelease(releaseName))
    }

    async createCard(draft: CardDraft) {
        await this.withLoading('Card creation failed', () => dataService.cards.createCard(draft))
    }

    private static async createMissingWorkingFolderResolution(
        storage: StorageService,
        storageType: StorageType,
        project: ProjectReference,
    ) {
        const config = configService.getProjectConfig()
        const resolvedConfig = resolveProjectConfigPaths(config)
        try {
            const folders = await storage.listTopLevelFolders(project)

            return {
                configuredWorkingFolder: config.workingFolder,
                folders,
                project,
                resolvedWorkingFolder: resolvedConfig.workingFolder,
                storageType,
            }
        } catch {
            return {
                configuredWorkingFolder: config.workingFolder,
                folders: EMPTY_TOP_LEVEL_FOLDERS,
                project,
                resolvedWorkingFolder: resolvedConfig.workingFolder,
                storageType,
            }
        }
    }

    private async withLoading<T>(fallbackMessage: string, operation: () => Promise<T>): Promise<T> {
        this.state = { errorMessage: null, isLoading: true, pendingGithubConflictProject: null }
        this.dispatchChanged()

        try {
            return await operation()
        } catch (error) {
            const message = error instanceof Error ? error.message : fallbackMessage
            this.state = {
                errorMessage: message,
                isLoading: false,
                pendingGithubConflictProject: error instanceof GithubPendingCommitConflictError ? error.project : null,
            }
            this.dispatchChanged()
            dialogService.error(error, { fallbackMessage })
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
