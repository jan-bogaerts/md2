import type {
    CommitRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    MoveFilesRequest,
    ProjectConfig,
    ProjectReference,
    StorageService,
} from '../../data/data_types'
import { GithubProjectConfigStorage } from './github_project_config_storage'
import {
    GithubPendingCommitConflictError,
    GithubStorageContext,
} from './github_storage_context'
import { GithubStorageGitData } from './github_storage_git_data'
import { GithubStorageLoader } from './github_storage_loader'
import type { GithubStorageDependencies } from './github_storage_types'
import { GithubStorageWriter } from './github_storage_writer'

export { GithubPendingCommitConflictError }

export class GithubStorageService implements StorageService {
    private readonly configStorage: GithubProjectConfigStorage
    private readonly context: GithubStorageContext
    private readonly loader: GithubStorageLoader
    private readonly writer: GithubStorageWriter

    constructor() {
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
        return this.writer.createProject(project, workingFolder)
    }

    async loadProject(project: ProjectReference, workingFolder: string) {
        return this.loader.loadProject(project, workingFolder)
    }

    async loadProjectRoot(project: ProjectReference, workingFolder: string) {
        return this.loader.loadProjectRoot(project, workingFolder)
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
        return this.configStorage.loadProjectConfig(project)
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
        return this.writer.commit(request)
    }

    async deleteFile(request: DeleteFileRequest) {
        return this.writer.deleteFile(request)
    }

    async deleteFolder(request: DeleteFolderRequest) {
        return this.writer.deleteFolder(request)
    }

    async moveFiles(request: MoveFilesRequest) {
        return this.writer.moveFiles(request)
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig) {
        return this.configStorage.saveProjectConfig(project, config)
    }

    async push(project: ProjectReference) {
        return this.writer.push(project)
    }

    async restorePendingCommits(project: ProjectReference) {
        return this.writer.restorePendingCommits(project)
    }

    hasPendingPush(project: ProjectReference) {
        return this.writer.hasPendingPush(project)
    }

    discardPendingCommits(project: ProjectReference) {
        this.writer.discardPendingCommits(project)
    }

    async findRepository(owner: string, repository: string) {
        return this.loader.findRepository(owner, repository)
    }
}
