import { CommitBatcher } from '../data/commit_batcher'
import type { AgentConversation, AgentConversationError, AgentRunEvent, CardDraft, MarkdownFile, ProjectAsset } from '../data/data_types'
import type { ProjectConfig, ProjectReference, ProjectSnapshot, RunningAgent, StorageService } from '../data/data_types'
import type { RemarkableBridge } from '../data/remarkable_bridge'
import { agentConversationService } from './agent_conversation_service'
import { CardOperations } from './card_operations'
import { configService } from './config_service'
import { type DataServiceContext, type DataServiceDependencies, getProjectConfigOrNull, reportCommitFlushFailure } from './data_service_context'
import { AgentIntegration } from './agent_integration'
import { markdownParsingService } from './markdown_parsing_service'
import { ProjectLoading } from './project_loading'
import { ReleaseOperations } from './release_operations'
import { getRemarkableMetadataContent, importRemarkableImages, type RemarkableImportInput } from './remarkable_import_service'
import type { RemarkableImportPlan } from './remarkable_import_service'
import { register } from './service_injector'
import { telemetryService } from './telemetry_service'

export type { RemarkableImportInput }

export interface DataServiceState {
    hasPendingCommits: boolean
    project: ProjectReference | null
    runningAgents: RunningAgent[]
    snapshot: ProjectSnapshot | null
}

export class DataService extends EventTarget {
    readonly agents: AgentIntegration
    readonly cards: CardOperations
    readonly projectLoading: ProjectLoading
    readonly releases: ReleaseOperations

    private agentConversationLoadToken = 0
    private commitBatcher: CommitBatcher | null = null
    private conversationsByCardPath: Map<string, AgentConversation[]> = new Map()
    private currentFiles: MarkdownFile[] = []
    private currentProject: ProjectReference | null = null
    private currentSnapshot: ProjectSnapshot | null = null
    private errorsByCardPath: Map<string, AgentConversationError[]> = new Map()
    private inFlightCommitPaths: Set<string> = new Set()
    private projectLoadToken = 0
    private remarkableBridge: RemarkableBridge | null = null
    private storage: StorageService | null = null

    private readonly context: DataServiceContext

    constructor() {
        super()
        this.context = this.createContext()
        this.cards = new CardOperations(this.context, (cardPath, state) => this.agents.triggerStateActions(cardPath, state))
        this.agents = new AgentIntegration(this.context, (file) => this.cards.saveFile(file))
        this.projectLoading = new ProjectLoading(
            this.context,
            (snapshot, project, projectLoadToken) => this.agents.loadAgentConversationsInBackground(snapshot, project, projectLoadToken),
        )
        this.releases = new ReleaseOperations(this.context, () => this.cards.flushPendingCommitBatch())
        agentConversationService.subscribe(() => this.dispatchChanged())
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.projectLoading.reset()
        this.agents.reset()
        this.resetLoadedProject()
        this.remarkableBridge = dependencies.remarkableBridge ?? null
        this.storage = dependencies.storage
        this.agents.startScheduledRunWatch()
        const delayMs = configService.get('react.autoCommitDelayMs')
        this.commitBatcher = new CommitBatcher({
            clearDelay: window.clearTimeout,
            commit: (request) => this.cards.commitFiles(request),
            delayMs,
            onFlushError: (error) => this.reportCommitFlushFailure(error),
            setDelay: window.setTimeout,
        })
        this.dispatchChanged()
    }

    getState(): DataServiceState {
        const hasStoragePendingCommits = this.currentProject
            ? this.storage?.hasPendingCommits?.(this.currentProject) ?? false
            : false

        return {
            hasPendingCommits: (this.commitBatcher?.hasPending() ?? false) || hasStoragePendingCommits,
            project: this.currentProject,
            runningAgents: agentConversationService.getRunningAgents(),
            snapshot: this.currentSnapshot,
        }
    }

    getConfig(): ProjectConfig | null {
        return getProjectConfigOrNull(this.storage)
    }
    createProject(project: ProjectReference) { return this.projectLoading.createProject(project) }
    openProject(project: ProjectReference) { return this.projectLoading.openProject(project) }
    saveProjectConfig() { return this.projectLoading.saveProjectConfig() }
    loadProjectAsset(path: string): Promise<ProjectAsset> { return this.projectLoading.loadProjectAsset(path) }
    switchBranch(branch: string) { return this.projectLoading.switchBranch(branch) }
    createCard(draft: CardDraft) { return this.cards.createCard(draft) }
    getRemarkableMetadataContent(): string | null {
        const config = this.getConfig()
        if (!config) return null
        return getRemarkableMetadataContent(this.currentFiles, config)
    }
    async importRemarkableImages(request: RemarkableImportInput): Promise<RemarkableImportPlan> {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot import Remarkable images before a project is open')
        const plan = await importRemarkableImages({
            bridge: this.remarkableBridge,
            commitAndMergeFiles: (commitRequest, fallbackFiles) => this.cards.commitAndMergeFiles(commitRequest, fallbackFiles),
            config,
            files: this.currentFiles,
            project: this.currentProject,
            request,
            storage,
        })
        this.refreshSnapshot()
        telemetryService.trackEvent('remarkable_import')
        return plan
    }
    updateCardBody(path: string, body: string) { return this.cards.updateCardBody(path, body) }
    updateCardAffects(path: string, affects: string[]) { return this.cards.updateCardAffects(path, affects) }
    continueAgentConversation(cardPath: string, sourcePath: string) { return this.agents.continueAgentConversation(cardPath, sourcePath) }
    startAgentConversation(cardPath: string, prompt: string) { return this.agents.startAgentConversation(cardPath, prompt) }
    sendAgentInput(runId: string, input: string) { return this.agents.sendAgentInput(runId, input) }
    recordAgentRunEvent(cardPath: string, event: AgentRunEvent) {
        this.agents.recordAgentRunEvent(cardPath, event)
    }
    linkAgentConversation(cardPath: string, conversation: AgentConversation, reference: string) {
        return this.agents.linkAgentConversation(cardPath, conversation, reference)
    }
    updateCardHeaderFields(path: string, updates: Record<string, string>) { return this.cards.updateCardHeaderFields(path, updates) }
    updateCardTitle(path: string, title: string) { return this.cards.updateCardTitle(path, title) }
    toggleCardPolicy(path: string, policyKey: string) { return this.cards.toggleCardPolicy(path, policyKey) }
    moveCard(cardPath: string, targetStatus: string, targetIndex: number) {
        return this.cards.moveCard(cardPath, targetStatus, targetIndex)
    }
    deleteCard(path: string) { return this.cards.deleteCard(path) }
    deleteFile(path: string) { return this.cards.deleteFile(path) }
    saveFile(file: MarkdownFile) { return this.cards.saveFile(file) }
    saveProjectFile(file: MarkdownFile, message: string) { return this.cards.saveProjectFile(file, message) }
    flushPendingCommits() { return this.cards.flushPendingCommits() }
    completeRelease(releaseName: string) { return this.releases.completeRelease(releaseName) }
    push() { return this.projectLoading.push() }
    private createContext(): DataServiceContext {
        return {
            createSnapshot: (files, workingFolder, repositoryFiles) => this.createSnapshot(files, workingFolder, repositoryFiles),
            dispatchChanged: () => this.dispatchChanged(),
            getAgentConversationLoadToken: () => this.agentConversationLoadToken,
            getConversationsByCardPath: () => this.conversationsByCardPath,
            getCurrentFiles: () => this.currentFiles,
            getCurrentProject: () => this.currentProject,
            getCurrentSnapshot: () => this.currentSnapshot,
            getErrorsByCardPath: () => this.errorsByCardPath,
            getInFlightCommitPaths: () => this.inFlightCommitPaths,
            getProjectLoadToken: () => this.projectLoadToken,
            getStorage: () => this.storage,
            increaseAgentConversationLoadToken: () => this.increaseAgentConversationLoadToken(),
            increaseProjectLoadToken: () => this.increaseProjectLoadToken(),
            refreshSnapshot: () => this.refreshSnapshot(),
            reloadCurrentProjectSnapshot: () => this.projectLoading.reloadCurrentProjectSnapshot(),
            requireDependencies: () => this.requireDependencies(),
            requireFile: (path) => this.requireFile(path),
            resetAgentConversations: () => this.resetAgentConversations(),
            setConversationsByCardPath: (conversationsByCardPath) => {
                this.conversationsByCardPath = conversationsByCardPath
            },
            setCurrentFiles: (files) => {
                this.currentFiles = files
            },
            setCurrentProject: (project) => {
                this.currentProject = project
            },
            setCurrentSnapshot: (snapshot) => {
                this.currentSnapshot = snapshot
            },
            setErrorsByCardPath: (errorsByCardPath) => {
                this.errorsByCardPath = errorsByCardPath
            },
        }
    }

    private increaseAgentConversationLoadToken() {
        this.agentConversationLoadToken += 1
        return this.agentConversationLoadToken
    }
    private increaseProjectLoadToken() {
        this.projectLoadToken += 1
        return this.projectLoadToken
    }
    private resetAgentConversations() {
        this.conversationsByCardPath = new Map()
        this.errorsByCardPath = new Map()
    }
    private resetLoadedProject() {
        this.currentFiles = []
        this.currentProject = null
        this.currentSnapshot = null
        this.inFlightCommitPaths = new Set()
    }
    private requireFile(path: string): MarkdownFile {
        const existingFile = this.currentFiles.find((currentFile) => currentFile.path === path)
        if (!existingFile) throw new Error(`Cannot update a card that is not loaded: ${path}`)
        return existingFile
    }
    private refreshSnapshot() {
        const { config } = this.requireDependencies()
        const cards = this.agents.attachAgentConversations(markdownParsingService.splitCards(this.currentFiles, config.workingFolder))
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.currentSnapshot = { ...cards, repositoryFiles, workingFolder: config.workingFolder }
        this.dispatchChanged()
    }
    private createSnapshot(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]): ProjectSnapshot {
        const cards = markdownParsingService.splitCards(files, workingFolder)
        return { ...this.agents.attachAgentConversations(cards), repositoryFiles, workingFolder }
    }
    private reportCommitFlushFailure(error: unknown) {
        reportCommitFlushFailure(error, () => this.dispatchChanged())
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
