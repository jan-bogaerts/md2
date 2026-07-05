import { CommitBatcher } from '../data/commit_batcher'
import { createCardFile } from '../data/card_naming'
import { computeMove } from '../data/card_ordering'
import {
    type CardDraft,
    type MarkdownFile,
    type ProjectConfig,
    type ProjectReference,
    type ProjectSnapshot,
    type StorageService,
} from '../data/data_types'
import { configService } from './config_service'
import { markdownParsingService } from './markdown_parsing_service'
import { register } from './service_injector'

interface DataServiceDependencies {
    storage: StorageService
}

export interface DataServiceState {
    project: ProjectReference | null
    snapshot: ProjectSnapshot | null
}

export class DataService extends EventTarget {
    private commitBatcher: CommitBatcher | null
    private currentFiles
    private currentProject: ProjectReference | null
    private currentSnapshot: ProjectSnapshot | null
    private storage: StorageService | null

    constructor() {
        super()
        this.commitBatcher = null
        this.currentFiles = [] as MarkdownFile[]
        this.currentProject = null
        this.currentSnapshot = null
        this.storage = null
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.currentFiles = []
        this.currentProject = null
        this.currentSnapshot = null
        this.storage = dependencies.storage
        const delayMs = configService.get('react.autoCommitDelayMs') as number
        this.commitBatcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit: this.commitFiles.bind(this),
            delayMs,
            setDelay: window.setTimeout,
        })
        this.dispatchChanged()
    }

    getState(): DataServiceState {
        return { project: this.currentProject, snapshot: this.currentSnapshot }
    }

    getConfig(): ProjectConfig | null {
        if (!this.storage) return null

        try {
            return configService.getProjectConfig()
        } catch {
            return null
        }
    }

    async createProject(project: ProjectReference) {
        const { config, storage } = this.requireDependencies()
        this.currentProject = await storage.createProject(project, config.workingFolder)
        await storage.saveProjectConfig(this.currentProject, config)

        return this.openProject(this.currentProject)
    }

    async openProject(project: ProjectReference) {
        const { storage } = this.requireDependencies()
        this.currentProject = project
        const projectConfig = await storage.loadProjectConfig(project)
        configService.loadProjectConfig(projectConfig)
        const config = configService.getProjectConfig()
        const projectFiles = await storage.loadProject(project, config.workingFolder)
        this.currentFiles = projectFiles.files
        this.currentSnapshot = {
            ...markdownParsingService.splitCards(projectFiles.files, projectFiles.workingFolder),
            workingFolder: projectFiles.workingFolder,
        }
        this.dispatchChanged()

        return this.currentSnapshot
    }

    async saveProjectConfig() {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot save project config before a project is open')

        await storage.saveProjectConfig(this.currentProject, configService.getProjectConfig())
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

        const file = createCardFile(this.currentFiles, config.workingFolder, config.cardTypes, config.cardBodyTemplate, draft)
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
        const existingFile = this.requireFile(path)

        return this.saveFile({ content: markdownParsingService.replaceBody(existingFile.content, body), path, sha: existingFile.sha })
    }

    private requireFile(path: string): MarkdownFile {
        const existingFile = this.currentFiles.find((currentFile) => currentFile.path === path)
        if (!existingFile) throw new Error(`Cannot update a card that is not loaded: ${path}`)

        return existingFile
    }

    updateCardHeaderFields(path: string, updates: Record<string, string>) {
        const existingFile = this.requireFile(path)

        return this.saveFile({
            content: markdownParsingService.rewriteHeader(existingFile.content, updates),
            path,
            sha: existingFile.sha,
        })
    }

    updateCardTitle(path: string, title: string) {
        return this.updateCardHeaderFields(path, { title })
    }

    toggleCardPolicy(path: string, policyKey: string) {
        const existingFile = this.requireFile(path)
        const card = markdownParsingService.parseCard(existingFile, this.requireDependencies().config.workingFolder)
        const enabled = card.header.policy[policyKey] === 'true'

        return this.saveFile({
            content: markdownParsingService.setPolicyFlag(existingFile.content, policyKey, !enabled),
            path,
            sha: existingFile.sha,
        })
    }

    moveCard(cardPath: string, targetStatus: string, targetIndex: number) {
        const activeCards = this.currentSnapshot?.activeCards ?? []
        const updates = computeMove(activeCards, cardPath, targetStatus, targetIndex)

        for (const update of updates) {
            this.updateCardHeaderFields(update.path, { after: update.after ?? '', status: update.status })
        }

        return updates
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
        if (!this.storage) throw new Error('Data service storage is not initialized')
        if (!this.commitBatcher) throw new Error('Data service commit batcher is not initialized')
        const config = configService.getProjectConfig()

        return { commitBatcher: this.commitBatcher, config, storage: this.storage }
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<DataServiceState>('changed', { detail: this.getState() }))
    }
}

export const dataService = new DataService()
