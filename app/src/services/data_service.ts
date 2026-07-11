import { CommitBatcher } from '../data/commit_batcher'
import { resolveProjectConfigPaths, type ProjectConfig, type ProjectReference, type ProjectSnapshot, type RunningAgent, type StorageService } from '../data/data_types'
import type { RemarkableBridge } from '../data/remarkable_bridge'
import { agentConversationService } from './agent_conversation_service'
import { CardOperations, type CardOperationsDeps } from './card_operations'
import { configService } from './config_service'
import { type DataServiceDependencies, getProjectConfigOrNull, reportCommitFlushFailure } from './data_service_context'
import { AgentIntegration, type AgentIntegrationDeps } from './agent_integration'
import { ProjectLoading, type ProjectLoadingDeps } from './project_loading'
import { ProjectState } from './project_state'
import { ReleaseOperations, type ReleaseOperationsDeps } from './release_operations'
import { getRemarkableMetadataContent, importRemarkableImages, type RemarkableImportInput } from './remarkable_import_service'
import type { RemarkableImportPlan } from './remarkable_import_service'
import { register } from './service_injector'
import { telemetryService } from './telemetry_service'

export type { RemarkableImportInput }

export interface DataServiceState {
    hasPendingPush: boolean
    hasPendingSave: boolean
    project: ProjectReference | null
    runningAgents: RunningAgent[]
    snapshot: ProjectSnapshot | null
}

export class DataService extends EventTarget {
    readonly agents: AgentIntegration
    readonly cards: CardOperations
    readonly projectLoading: ProjectLoading
    readonly releases: ReleaseOperations

    private commitBatcher: CommitBatcher | null = null
    private remarkableBridge: RemarkableBridge | null = null
    private storage: StorageService | null = null
    private readonly projectState: ProjectState

    constructor() {
        super()
        this.projectState = new ProjectState((cards) => this.agents.attachAgentConversations(cards))
        this.cards = new CardOperations(
            this.createCardOperationsDependencies(),
            (cardPath, state) => this.agents.triggerStateActions(cardPath, state),
        )
        this.agents = new AgentIntegration(this.createAgentIntegrationDependencies(), (file) => this.cards.saveFile(file))
        this.projectLoading = new ProjectLoading(
            this.createProjectLoadingDependencies(),
            (snapshot, project, projectLoadToken) => this.agents.loadAgentConversationsInBackground(snapshot, project, projectLoadToken),
        )
        this.releases = new ReleaseOperations(this.createReleaseOperationsDependencies(), () => this.cards.flushPendingCommitBatch())
        agentConversationService.subscribe(() => this.dispatchChanged())
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.projectLoading.reset()
        this.agents.reset()
        this.projectState.resetLoadedProject()
        this.remarkableBridge = dependencies.remarkableBridge ?? null
        this.storage = dependencies.storage
        this.agents.startScheduledRunWatch()
        const delayMs = configService.get('react.autoCommitDelayMs')
        this.commitBatcher = new CommitBatcher({
            clearDelay: (delayId) => window.clearTimeout(delayId),
            commit: (request) => this.cards.commitFiles(request),
            delayMs,
            onFlushError: (error) => this.reportCommitFlushFailure(error),
            onPendingChange: () => this.dispatchChanged(),
            setDelay: (callback, delay) => window.setTimeout(callback, delay),
        })
        this.dispatchChanged()
    }

    getState(): DataServiceState {
        const currentProject = this.projectState.project
        const hasPendingPush = currentProject
            ? this.storage?.hasPendingPush?.(currentProject) ?? false
            : false

        return {
            hasPendingPush,
            hasPendingSave: this.commitBatcher?.hasPending() ?? false,
            project: currentProject,
            runningAgents: agentConversationService.getRunningAgents(),
            snapshot: this.projectState.snapshot,
        }
    }

    getConfig(): ProjectConfig | null {
        return getProjectConfigOrNull(this.storage)
    }
    getRemarkableMetadataContent(): string | null {
        const config = this.getConfig()
        if (!config) return null
        return getRemarkableMetadataContent(this.projectState.files, config)
    }
    async importRemarkableImages(request: RemarkableImportInput): Promise<RemarkableImportPlan> {
        const { config, storage } = this.requireDependencies()
        const currentProject = this.projectState.project
        if (!currentProject) throw new Error('Cannot import Remarkable images before a project is open')
        const plan = await importRemarkableImages({
            bridge: this.remarkableBridge,
            commitAndMergeFiles: (commitRequest, fallbackFiles) => this.cards.commitAndMergeFiles(commitRequest, fallbackFiles),
            config,
            files: this.projectState.files,
            project: currentProject,
            request,
            storage,
        })
        this.refreshSnapshot(config.workingFolder)
        telemetryService.trackEvent('remarkable_import')
        return plan
    }
    private createCardOperationsDependencies(): CardOperationsDeps {
        return {
            dispatchChanged: () => this.dispatchChanged(),
            commitPathsInFlight: () => this.projectState.commitPathsInFlight,
            files: () => this.projectState.files,
            mergeCommittedFiles: (files, workingFolder) => this.projectState.mergeCommittedFiles(files, workingFolder),
            project: () => this.projectState.project,
            refreshSnapshot: (workingFolder) => this.refreshSnapshot(workingFolder),
            reloadCurrentProjectSnapshot: () => this.projectLoading.reloadCurrentProjectSnapshot(),
            requireDependencies: () => this.requireDependencies(),
            requireFile: (path) => this.projectState.requireFile(path),
            replaceFiles: (files, workingFolder) => this.projectState.replaceFiles(files, workingFolder),
            snapshot: () => this.projectState.snapshot,
        }
    }

    private createAgentIntegrationDependencies(): AgentIntegrationDeps {
        return {
            beginAgentConversationLoad: () => this.projectState.beginAgentConversationLoad(),
            dispatchChanged: () => this.dispatchChanged(),
            isCurrentAgentConversationLoad: (agentConversationLoadToken) => (
                this.projectState.isCurrentAgentConversationLoad(agentConversationLoadToken)
            ),
            isCurrentLoad: (project, projectLoadToken) => this.projectState.isCurrentLoad(project, projectLoadToken),
            project: () => this.projectState.project,
            refreshSnapshot: (workingFolder) => this.refreshSnapshot(workingFolder),
            requireDependencies: () => this.requireDependencies(),
            requireFile: (path) => this.projectState.requireFile(path),
            snapshot: () => this.projectState.snapshot,
        }
    }

    private createProjectLoadingDependencies(): ProjectLoadingDeps {
        return {
            beginProjectLoad: () => this.projectState.beginProjectLoad(),
            commitPathsInFlight: () => this.projectState.commitPathsInFlight,
            dispatchChanged: () => this.dispatchChanged(),
            files: () => this.projectState.files,
            isCurrentLoad: (project, projectLoadToken) => this.projectState.isCurrentLoad(project, projectLoadToken),
            project: () => this.projectState.project,
            replaceFiles: (files, workingFolder) => this.projectState.replaceFiles(files, workingFolder),
            replaceProject: (project) => this.projectState.replaceProject(project),
            replaceProjectFiles: (files, workingFolder, repositoryFiles) => (
                this.projectState.replaceProjectFiles(files, workingFolder, repositoryFiles)
            ),
            requireDependencies: () => this.requireDependencies(),
            resetAgentConversations: () => this.agents.resetLoadedConversations(),
            snapshot: () => this.projectState.snapshot,
            storage: () => this.storage,
        }
    }

    private createReleaseOperationsDependencies(): ReleaseOperationsDeps {
        return {
            files: () => this.projectState.files,
            project: () => this.projectState.project,
            reloadCurrentProjectSnapshot: () => this.projectLoading.reloadCurrentProjectSnapshot(),
            requireDependencies: () => this.requireDependencies(),
            snapshot: () => this.projectState.snapshot,
        }
    }

    private refreshSnapshot(workingFolder: string) {
        this.projectState.refreshSnapshot(workingFolder)
        this.dispatchChanged()
    }
    private reportCommitFlushFailure(error: unknown) {
        reportCommitFlushFailure(error, () => this.dispatchChanged())
    }
    private requireDependencies() {
        if (!this.storage) throw new Error('Data service storage is not initialized')
        if (!this.commitBatcher) throw new Error('Data service commit batcher is not initialized')
        const config = resolveProjectConfigPaths(configService.getProjectConfig())
        return { commitBatcher: this.commitBatcher, config, storage: this.storage }
    }
    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<DataServiceState>('changed', { detail: this.getState() }))
    }
}

export const dataService = new DataService()
