import type {
    CommitRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    MoveFilesRequest,
    ProjectConfig,
    ProjectReference,
    StorageService,
} from '../../data/data_types'
import { DEFAULT_PROJECT_CONFIG, MissingWorkingFolderError } from '../../data/data_types'
import { GithubProjectConfigStorage } from './github_project_config_storage'
import {
    GithubPendingCommitConflictError,
    GithubStorageContext,
} from './github_storage_context'
import { GithubStorageGitData } from './github_storage_git_data'
import { GithubStorageLoader } from './github_storage_loader'
import type { GithubStorageDependencies } from './github_storage_types'
import { GithubStorageWriter } from './github_storage_writer'
import { READ_ONLY_PROJECT_ERROR } from '../project/project_access_service'

export { GithubPendingCommitConflictError }

export class GithubStorageService implements StorageService {
    private readonly configStorage: GithubProjectConfigStorage
    private readonly context: GithubStorageContext
    private readonly loader: GithubStorageLoader
    private readonly writer: GithubStorageWriter
    readonly isReadOnly: boolean

    constructor(isReadOnly = false) {
        this.isReadOnly = isReadOnly
        this.context = new GithubStorageContext()
        const gitData = new GithubStorageGitData(this.context)
        this.writer = new GithubStorageWriter(this.context, gitData)
        this.loader = new GithubStorageLoader(this.context, gitData)
        this.configStorage = new GithubProjectConfigStorage(this.context, gitData, this.writer)
    }

    init(dependencies: GithubStorageDependencies) {
        this.context.init(dependencies)
    }

    async createProject(project: ProjectReference, workingFolder: string) {
        this.requireWritable()

        return this.writer.createProject(project, workingFolder)
    }

    async loadProject(project: ProjectReference, workingFolder: string) {
        try {
            return await this.loader.loadProject(project, workingFolder)
        } catch (error) {
            if (this.isReadOnly && error instanceof MissingWorkingFolderError) return { files: [], workingFolder }

            throw error
        }
    }

    async loadProjectRoot(project: ProjectReference, workingFolder: string) {
        try {
            return await this.loader.loadProjectRoot(project, workingFolder)
        } catch (error) {
            if (this.isReadOnly && error instanceof MissingWorkingFolderError) return { files: [], workingFolder }

            throw error
        }
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string) {
        return this.loader.loadActionFiles(project, actionsFolder)
    }

    async loadAgentConversation(project: ProjectReference, path: string) {
        return this.loader.loadAgentConversation(project, path)
    }

    async loadProjectAsset(project: ProjectReference, path: string) {
        return this.loader.loadProjectAsset(project, path)
    }

    async loadTextFile(project: ProjectReference, path: string) {
        return this.loader.loadTextFile(project, path)
    }

    async loadProjectConfig(project: ProjectReference) {
        const config = await this.configStorage.loadProjectConfig(project)

        return this.isReadOnly && config === null ? DEFAULT_PROJECT_CONFIG : config
    }

    async listBranches(project: ProjectReference) {
        return this.loader.listBranches(project)
    }

    async listRepositories() {
        return this.loader.listRepositories()
    }

    async listRepositoryFiles(project: ProjectReference) {
        return this.loader.listRepositoryFiles(project)
    }

    async listTopLevelFolders(project: ProjectReference) {
        return this.loader.listTopLevelFolders(project)
    }

    async checkoutBranch(project: ProjectReference, branch: string) {
        return this.writer.checkoutBranch(project, branch)
    }

    async commit(request: CommitRequest) {
        this.requireWritable()

        return this.writer.commit(request)
    }

    async deleteFile(request: DeleteFileRequest) {
        this.requireWritable()

        return this.writer.deleteFile(request)
    }

    async deleteFolder(request: DeleteFolderRequest) {
        this.requireWritable()

        return this.writer.deleteFolder(request)
    }

    async moveFiles(request: MoveFilesRequest) {
        this.requireWritable()

        return this.writer.moveFiles(request)
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig) {
        this.requireWritable()

        return this.configStorage.saveProjectConfig(project, config)
    }

    async push(project: ProjectReference) {
        this.requireWritable()

        return this.writer.push(project)
    }

    async restorePendingCommits(project: ProjectReference) {
        this.requireWritable()

        return this.writer.restorePendingCommits(project)
    }

    hasPendingPush(project: ProjectReference) {
        return this.writer.hasPendingPush(project)
    }

    discardPendingCommits(project: ProjectReference) {
        this.requireWritable()
        this.writer.discardPendingCommits(project)
    }

    async findRepository(owner: string, repository: string) {
        return this.loader.findRepository(owner, repository, this.isReadOnly)
    }

    private requireWritable() {
        if (this.isReadOnly) throw new Error(READ_ONLY_PROJECT_ERROR)
    }
}
