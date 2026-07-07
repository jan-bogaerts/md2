import {
    MISSING_WORKING_FOLDER_ERROR,
    type BranchReference,
    type CardDraft,
    type ProjectReference,
    type RepositoryReference,
    type StorageService,
    type TopLevelFolderReference,
} from '../data/data_types'
import { createStorageService, writeLastProject, type StorageType } from '../data/project_session'
import { configureRemoteControlConnection } from '../data/remote_control_connection'
import { configService } from './config_service'
import { dataService } from './data_service'
import { GithubPendingCommitConflictError, GithubStorageService } from './github_storage_service'
import { register } from './service_injector'

export interface MissingWorkingFolderResolution {
    configuredWorkingFolder: string
    folders: TopLevelFolderReference[]
    project: ProjectReference
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
    const nextConfig = { ...configService.getProjectConfig(), workingFolder }
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
                await dataService.openProject(project)
                writeLastProject(storageType, project)

                return null
            } catch (error) {
                if (!isMissingWorkingFolderError(error)) throw error

                return ProjectSessionService.createMissingWorkingFolderResolution(storage, storageType, project, error.workingFolder)
            }
        })
    }

    async openWorkingFolder(resolution: MissingWorkingFolderResolution, folder: TopLevelFolderReference, accessToken: string | null) {
        await this.withLoading('Working folder selection failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            await persistWorkingFolder(storage, resolution.project, folder.path)
            dataService.init({ storage })
            await dataService.openProject(resolution.project)
            writeLastProject(resolution.storageType, resolution.project)
        })
    }

    async createWorkingFolder(resolution: MissingWorkingFolderResolution, accessToken: string | null) {
        await this.withLoading('Working folder creation failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            const project = await storage.createWorkingFolderFromTemplate(resolution.project, resolution.configuredWorkingFolder)
            await persistWorkingFolder(storage, project, resolution.configuredWorkingFolder)
            dataService.init({ storage })
            await dataService.openProject(project)
            writeLastProject(resolution.storageType, project)
        })
    }

    configureRemote(endpoint: string, token: string) {
        this.setError(null)
        configureRemoteControlConnection({ endpoint, token })
    }

    async switchBranch(branch: string) {
        await this.withLoading('Branch switch failed', () => dataService.switchBranch(branch))
    }

    async push() {
        await this.withLoading('Push failed', () => dataService.push())
    }

    discardGithubPendingCommits(project: ProjectReference, accessToken: string | null) {
        const storage = createGithubStorage(accessToken)
        storage.discardPendingCommits(project)
        this.state = { ...this.state, errorMessage: null, pendingGithubConflictProject: null }
        this.dispatchChanged()
    }

    async completeRelease(releaseName: string) {
        await this.withLoading('Release completion failed', () => dataService.completeRelease(releaseName))
    }

    async createCard(draft: CardDraft) {
        await this.withLoading('Card creation failed', () => dataService.createCard(draft))
    }

    private static async createMissingWorkingFolderResolution(
        storage: StorageService,
        storageType: StorageType,
        project: ProjectReference,
        workingFolder: string,
    ) {
        try {
            const folders = await storage.listTopLevelFolders(project)

            return { configuredWorkingFolder: workingFolder, folders, project, storageType }
        } catch {
            return { configuredWorkingFolder: workingFolder, folders: EMPTY_TOP_LEVEL_FOLDERS, project, storageType }
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
