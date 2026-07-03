import { CommitBatcher } from './CommitBatcher'
import { createCardFile } from './cardNaming'
import { DEFAULT_PROJECT_CONFIG, type CardDraft, type MarkdownFile, type ProjectConfig, type ProjectReference, type StorageService } from './dataTypes'
import { splitProjectCards } from './markdownHeaders'

interface DataServiceDependencies {
    config?: ProjectConfig
    storage: StorageService
}

export class DataService {
    private readonly commitBatcher
    private readonly config
    private currentFiles
    private currentProject: ProjectReference | null
    private readonly storage

    constructor(dependencies: DataServiceDependencies) {
        this.config = dependencies.config ?? DEFAULT_PROJECT_CONFIG
        this.currentFiles = [] as MarkdownFile[]
        this.currentProject = null
        this.storage = dependencies.storage
        this.commitBatcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit: this.commitFiles.bind(this),
            setDelay: window.setTimeout,
        })
    }

    async createProject(project: ProjectReference) {
        this.currentProject = await this.storage.createProject(project, this.config.workingFolder)

        return this.openProject(this.currentProject)
    }

    async openProject(project: ProjectReference) {
        this.currentProject = project
        const projectFiles = await this.storage.loadProject(project, this.config.workingFolder)
        this.currentFiles = projectFiles.files
        const cards = splitProjectCards(projectFiles.files, projectFiles.workingFolder)

        return { ...cards, workingFolder: projectFiles.workingFolder }
    }

    async switchBranch(branch: string) {
        if (!this.currentProject) throw new Error('Cannot switch branch before a project is open')

        const project = await this.storage.checkoutBranch(this.currentProject, branch)

        return this.openProject(project)
    }

    async createCard(draft: CardDraft) {
        if (!this.currentProject) throw new Error('Cannot create a card before a project is open')

        const file = createCardFile(this.currentFiles, this.config.workingFolder, this.config.cardTypes, draft)
        this.currentFiles = [...this.currentFiles, file]
        await this.storage.commit({
            branch: this.currentProject.branch,
            files: [file],
            message: `Create ${file.path}`,
        })

        if (this.config.pushMode === 'auto') await this.storage.push(this.currentProject)

        return file
    }

    saveFile(file: MarkdownFile) {
        if (!this.currentProject) throw new Error('Cannot save a file before a project is open')

        this.currentFiles = this.currentFiles.map((currentFile) => (currentFile.path === file.path ? file : currentFile))
        this.commitBatcher.schedule(this.currentProject.branch, [file], `Update ${file.path}`)
    }

    async flushPendingCommits() {
        await this.commitBatcher.flush()
    }

    async push() {
        if (!this.currentProject) throw new Error('Cannot push before a project is open')

        await this.storage.push(this.currentProject)
    }

    private async commitFiles(request: Parameters<StorageService['commit']>[0]) {
        await this.storage.commit(request)

        if (this.currentProject && this.config.pushMode === 'auto') await this.storage.push(this.currentProject)
    }
}
