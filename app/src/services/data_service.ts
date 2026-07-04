import { CommitBatcher } from '../data/commit_batcher'
import { createCardFile } from '../data/card_naming'
import {
    DEFAULT_PROJECT_CONFIG,
    type CardDraft,
    type MarkdownFile,
    type ProjectConfig,
    type ProjectReference,
    type ProjectSnapshot,
    type StorageService,
} from '../data/data_types'
import { markdownParsingService } from './markdown_parsing_service'
import { register } from './service_injector'

interface DataServiceDependencies {
    config?: ProjectConfig
    storage: StorageService
}

export interface DataServiceState {
    project: ProjectReference | null
    snapshot: ProjectSnapshot | null
}

export class DataService extends EventTarget {
    private commitBatcher: CommitBatcher | null
    private config: ProjectConfig | null
    private currentFiles
    private currentProject: ProjectReference | null
    private currentSnapshot: ProjectSnapshot | null
    private storage: StorageService | null

    constructor() {
        super()
        this.commitBatcher = null
        this.config = null
        this.currentFiles = [] as MarkdownFile[]
        this.currentProject = null
        this.currentSnapshot = null
        this.storage = null
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.config = dependencies.config ?? DEFAULT_PROJECT_CONFIG
        this.currentFiles = []
        this.currentProject = null
        this.currentSnapshot = null
        this.storage = dependencies.storage
        this.commitBatcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit: this.commitFiles.bind(this),
            setDelay: window.setTimeout,
        })
        this.dispatchChanged()
    }

    getState(): DataServiceState {
        return { project: this.currentProject, snapshot: this.currentSnapshot }
    }

    async createProject(project: ProjectReference) {
        const { config, storage } = this.requireDependencies()
        this.currentProject = await storage.createProject(project, config.workingFolder)

        return this.openProject(this.currentProject)
    }

    async openProject(project: ProjectReference) {
        const { config, storage } = this.requireDependencies()
        this.currentProject = project
        const projectFiles = await storage.loadProject(project, config.workingFolder)
        this.currentFiles = projectFiles.files
        this.currentSnapshot = {
            ...markdownParsingService.splitCards(projectFiles.files, projectFiles.workingFolder),
            workingFolder: projectFiles.workingFolder,
        }
        this.dispatchChanged()

        return this.currentSnapshot
    }

    async switchBranch(branch: string) {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot switch branch before a project is open')

        const project = await storage.checkoutBranch(this.currentProject, branch)

        return this.openProject(project)
    }

    async createCard(draft: CardDraft) {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot create a card before a project is open')

        const file = createCardFile(this.currentFiles, config.workingFolder, config.cardTypes, draft)
        this.currentFiles = [...this.currentFiles, file]
        await storage.commit({
            branch: this.currentProject.branch,
            files: [file],
            message: `Create ${file.path}`,
        })

        if (config.pushMode === 'auto') await storage.push(this.currentProject)

        this.refreshSnapshot()

        return file
    }

    updateCardBody(path: string, body: string) {
        const existingFile = this.currentFiles.find((currentFile) => currentFile.path === path)
        if (!existingFile) throw new Error(`Cannot update a card that is not loaded: ${path}`)

        return this.saveFile({ content: markdownParsingService.replaceBody(existingFile.content, body), path, sha: existingFile.sha })
    }

    saveFile(file: MarkdownFile) {
        const { commitBatcher } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot save a file before a project is open')

        this.currentFiles = this.currentFiles.map((currentFile) => (currentFile.path === file.path ? file : currentFile))
        commitBatcher.schedule(this.currentProject.branch, [file], `Update ${file.path}`)
        this.refreshSnapshot()

        return file
    }

    async flushPendingCommits() {
        const { commitBatcher } = this.requireDependencies()
        await commitBatcher.flush()
    }

    async push() {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot push before a project is open')

        await storage.push(this.currentProject)
    }

    private refreshSnapshot() {
        const { config } = this.requireDependencies()
        const cards = markdownParsingService.splitCards(this.currentFiles, config.workingFolder)
        this.currentSnapshot = { ...cards, workingFolder: config.workingFolder }
        this.dispatchChanged()
    }

    private async commitFiles(request: Parameters<StorageService['commit']>[0]) {
        const { config, storage } = this.requireDependencies()
        await storage.commit(request)

        if (this.currentProject && config.pushMode === 'auto') await storage.push(this.currentProject)
    }

    private requireDependencies() {
        if (!this.config) throw new Error('Data service is not initialized')
        if (!this.storage) throw new Error('Data service storage is not initialized')
        if (!this.commitBatcher) throw new Error('Data service commit batcher is not initialized')

        return { commitBatcher: this.commitBatcher, config: this.config, storage: this.storage }
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<DataServiceState>('changed', { detail: this.getState() }))
    }
}

export const dataService = new DataService()
