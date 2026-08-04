import { CommitBatcher } from '../../data/commit_batcher'
import type { ActionContext } from '../../data/action_context'
import { resolveProjectConfigPaths, type MarkdownFile, type ProjectConfig, type ProjectReference, type ProjectSnapshot, type RunningAgent, type StorageService } from '../../data/data_types'
import type { RemarkableBridge } from '../../data/remarkable_bridge'
import { agentAcknowledgementService } from '../agents/agent_acknowledgement_service'
import { agentConversationService, listAgentConversationReferences, loadAgentConversation } from '../agents/agent_conversation_service'
import { CardOperations, type CardOperationsDeps } from './card_operations'
import { configService } from '../config/config_service'
import { type DataServiceDependencies, getProjectConfigOrNull, reportCommitFlushFailure } from './data_service_context'
import { notifyActionCardStateChange } from '../actions/action_run_registry'
import { AgentIntegration, type AgentIntegrationDeps } from '../agents/agent_integration'
import { ProjectLoading, type ProjectLoadingDeps } from '../project/project_loading'
import { ProjectState } from '../project/project_state'
import { ReleaseOperations, type ReleaseOperationsDeps } from '.././release_operations'
import { SaveStateService, withSaveStateTracking } from '../project/save_state_service'
import { getRemarkableMetadataContent, importRemarkableImages, type RemarkableImportInput } from '../remarkable/remarkable_import_service'
import type { RemarkableImportPlan } from '../remarkable/remarkable_import_service'
import { getService, register } from '.././service_injector'
import { telemetryService } from '../telemetry/telemetry_service'
import { worktreeService } from '../project/worktree_service'
import { dialogService } from '.././dialog_service'
import type { CardParseError } from './markdown_parsing_service'
import type { OpenDocumentSaveReference } from '../open_files_service'

export type { RemarkableImportInput }
export interface DataServiceState {
    project: ProjectReference | null
    runningAgents: RunningAgent[]
    snapshot: ProjectSnapshot | null
}

export interface DataPersistenceSnapshot {
    hasPendingFileCommit: boolean
    hasPendingPush: boolean
    isSaving: boolean
}

export interface CardAddedEventDetail {
    card: ProjectSnapshot['activeCards'][number]
}

export interface CardChangedEventDetail extends CardAddedEventDetail {
    previousCard: ProjectSnapshot['activeCards'][number]
}

export interface CardRemovedEventDetail {
    card: ProjectSnapshot['activeCards'][number]
}

export interface CardPathChangedEventDetail {
    fromPath: string
    toPath: string
}

export const CARD_ADDED_EVENT = 'cardAdded'
export const CARD_CHANGED_EVENT = 'cardChanged'
export const CARD_PATH_CHANGED_EVENT = 'cardPathChanged'
export const CARD_REMOVED_EVENT = 'cardRemoved'

function reportCardParseErrors(errors: CardParseError[]) {
    const paths = errors.map(({ path }) => path).join(', ')
    dialogService.warning(`Some project files could not be loaded and were skipped: ${paths}`, { title: 'Some cards were not loaded' })
    errors.forEach(({ error }) => telemetryService.captureError(error))
}

async function flushAggregatePendingChanges() {
    const persistenceService = getService<{ flushPendingChanges(): Promise<void> }>('projectPersistenceService')
    await persistenceService.flushPendingChanges()
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
    private readonly saveStateService: SaveStateService
    private persistenceSnapshot: DataPersistenceSnapshot = { hasPendingFileCommit: false, hasPendingPush: false, isSaving: false }

    constructor() {
        super()
        this.saveStateService = new SaveStateService()
        this.saveStateService.addEventListener('changed', () => this.dispatchPersistenceChanged())
        this.projectState = new ProjectState(
            (cards) => this.agents.attachAgentConversations(cards),
            (previousCards, nextCards) => this.dispatchCardChanges(previousCards, nextCards),
            reportCardParseErrors,
        )
        this.cards = new CardOperations(
            this.createCardOperationsDependencies(),
            (cardPath, state) => {
                this.agents.triggerStateActions(cardPath, state)
                const snapshot = this.projectState.snapshot
                const card = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
                    .find(({ path }) => path === cardPath)
                void notifyActionCardStateChange(card?.header.internalId ?? null, state).catch((error: unknown) => {
                    dialogService.error(error, { fallbackMessage: 'Could not update automatic agent finish' })
                })
            },
        )
        this.agents = new AgentIntegration(this.createAgentIntegrationDependencies(), (file) => this.cards.saveFile(file))
        this.projectLoading = new ProjectLoading(
            this.createProjectLoadingDependencies(),
            (snapshot, project, projectLoadToken) => this.agents.loadAgentConversationsInBackground(snapshot, project, projectLoadToken),
        )
        this.releases = new ReleaseOperations(this.createReleaseOperationsDependencies(), () => this.cards.flushPendingCommits())
        agentConversationService.subscribe(() => this.dispatchChanged())
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.projectLoading.reset()
        this.agents.reset()
        this.projectState.resetLoadedProject()
        this.remarkableBridge = dependencies.remarkableBridge ?? null
        this.storage = withSaveStateTracking(dependencies.storage, this.saveStateService)
        worktreeService.init({
            assignCardWorktree: (path, worktree) => this.cards.updateCardWorktree(path, worktree),
            cardSeparatorProvider: () => this.requireDependencies().config.cardSeparator,
            flushPendingChanges: flushAggregatePendingChanges,
            projectFolderProvider: () => this.requireDependencies().config.projectFolder,
            projectProvider: () => this.projectState.project,
            snapshotProvider: () => this.projectState.snapshot,
            storageProvider: () => this.storage,
        })
        this.agents.startScheduledRunWatch()
        const delayMs = configService.get('react.autoCommitDelayMs')
        this.commitBatcher = new CommitBatcher({
            afterCommit: (request) => this.cards.pushCommittedFiles(request),
            clearDelay: (delayId) => window.clearTimeout(delayId),
            commit: (request) => this.cards.commitFiles(request),
            delayMs,
            onFlushError: (error) => this.reportCommitFlushFailure(error),
            onPendingChange: () => this.dispatchPersistenceChanged(),
            setDelay: (callback, delay) => window.setTimeout(callback, delay),
        })
        this.dispatchChanged()
        this.dispatchPersistenceChanged()
    }

    getState(): DataServiceState {
        return {
            project: this.projectState.project,
            runningAgents: agentConversationService.getRunningAgents(),
            snapshot: this.projectState.snapshot,
        }
    }

    getPersistenceSnapshot(): DataPersistenceSnapshot {
        const currentProject = this.projectState.project

        return {
            hasPendingFileCommit: this.commitBatcher?.hasPending() ?? false,
            hasPendingPush: currentProject ? this.storage?.hasPendingPush?.(currentProject) ?? false : false,
            isSaving: this.saveStateService.getState().isSaving,
        }
    }

    getConfig(): ProjectConfig | null {
        return getProjectConfigOrNull(this.storage)
    }
    async listAgentConversations(context: ActionContext) {
        const { config, storage } = this.requireDependencies()
        const currentProject = this.projectState.project
        if (!currentProject) throw new Error('Cannot list agent conversations before a project is open')

        if (context.kind !== 'project') {
            if (!context.cardInternalId) throw new Error(`Missing cardInternalId for ${context.kind} agent conversation context`)

            return this.agents.getAgentConversations(context.cardInternalId)
        }

        const references = await listAgentConversationReferences(storage, currentProject, config.projectFolder)
        const conversations = await Promise.all(references.map((reference) => loadAgentConversation(storage, currentProject, reference)))

        return conversations.filter(({ cardInternalId }) => cardInternalId === null)
    }
    async loadAgentConversation(path: string) {
        const { storage } = this.requireDependencies()
        const currentProject = this.projectState.project
        if (!currentProject) throw new Error('Cannot load an agent conversation before a project is open')

        return loadAgentConversation(storage, currentProject, path)
    }
    async persistActionFile(
        file: MarkdownFile,
        sourcePath = file.path,
        onPathCommitted?: (fromPath: string, toPath: string) => void,
        sourceExists = true,
        saveReference?: OpenDocumentSaveReference,
        onPersisted?: () => void,
    ) {
        const { commitBatcher } = this.requireDependencies()
        const currentProject = this.projectState.project
        if (!currentProject) throw new Error('Cannot save an action before a project is open')

        if (sourceExists && sourcePath === file.path) {
            commitBatcher.schedule(currentProject.branch, [{ ...file, onPersisted, saveReference }], `Update ${file.path}`)
        } else {
            if (!onPathCommitted) throw new Error(`Missing action path callback for rename from ${sourcePath} to ${file.path}`)
            commitBatcher.schedulePathChange(
                currentProject.branch,
                sourcePath,
                { ...file, onPersisted, saveReference },
                `Rename ${sourcePath} to ${file.path}`,
                onPathCommitted,
                sourceExists,
            )
        }
    }

    discardPendingFile(path: string) {
        const { commitBatcher } = this.requireDependencies()
        commitBatcher.discardPendingFile(path)
    }

    hasPendingFile(path: string) {
        const { commitBatcher } = this.requireDependencies()

        return commitBatcher.hasPendingFile(path)
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
            cardPathChanged: (fromPath, toPath) => this.dispatchCardPathChanged(fromPath, toPath),
            dispatchChanged: () => this.dispatchChanged(),
            dispatchPersistenceChanged: () => this.dispatchPersistenceChanged(),
            commitPathsInFlight: () => this.projectState.commitPathsInFlight,
            deleteFile: (path, committedFiles, workingFolder) => (
                this.projectState.deleteFile(path, committedFiles, workingFolder)
            ),
            files: () => this.projectState.files,
            mergeCommittedFiles: (files, workingFolder) => this.projectState.mergeCommittedFiles(files, workingFolder),
            project: () => this.projectState.project,
            recordCommittedContent: (files) => this.projectState.recordCommittedContent(files),
            refreshSnapshot: (workingFolder) => this.refreshSnapshot(workingFolder),
            reloadCurrentProjectSnapshot: () => this.projectLoading.reloadCurrentProjectSnapshot(),
            renameFile: (fromPath, toPath, workingFolder) => this.projectState.renameFile(fromPath, toPath, workingFolder),
            requireDependencies: () => this.requireDependencies(),
            requireFile: (path) => this.projectState.requireFile(path),
            replaceFiles: (files, workingFolder) => this.projectState.replaceFiles(files, workingFolder),
            snapshot: () => this.projectState.snapshot,
        }
    }

    private createAgentIntegrationDependencies(): AgentIntegrationDeps {
        return {
            beginAgentConversationLoad: () => this.projectState.beginAgentConversationLoad(),
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
            clearLoadedProject: () => this.projectState.resetLoadedProject(),
            commitPathsInFlight: () => this.projectState.commitPathsInFlight,
            dispatchChanged: () => this.dispatchChanged(),
            dispatchPersistenceChanged: () => this.dispatchPersistenceChanged(),
            dispatchRepositoryChanged: (event) => this.dispatchEvent(new CustomEvent('repositoryChanged', { detail: event })),
            files: () => this.projectState.files,
            flushPendingChanges: flushAggregatePendingChanges,
            isCommittedContent: (path, content) => this.projectState.isCommittedContent(path, content),
            isCurrentLoad: (project, projectLoadToken) => this.projectState.isCurrentLoad(project, projectLoadToken),
            project: () => this.projectState.project,
            replaceFiles: (files, workingFolder) => this.projectState.replaceFiles(files, workingFolder),
            replaceProject: (project) => this.projectState.replaceProject(project),
            ensureCardInternalIds: async () => {
                if (this.cards.ensureCardInternalIds() > 0) await this.cards.flushPendingCommits()
            },
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
        reportCommitFlushFailure(error, () => this.dispatchPersistenceChanged())
    }
    private requireDependencies() {
        if (!this.storage) throw new Error('Data service storage is not initialized')
        if (!this.commitBatcher) throw new Error('Data service commit batcher is not initialized')
        const config = resolveProjectConfigPaths(configService.getProjectConfig())
        return { commitBatcher: this.commitBatcher, config, storage: this.storage }
    }
    private dispatchChanged() {
        this.dispatchPersistenceChanged()
        this.dispatchEvent(new CustomEvent<DataServiceState>('changed', { detail: this.getState() }))
    }
    private dispatchCardPathChanged(fromPath: string, toPath: string) {
        const currentProject = this.projectState.project
        if (currentProject) agentAcknowledgementService.renameCardPath(currentProject.id, fromPath, toPath)
        const detail: CardPathChangedEventDetail = { fromPath, toPath }
        this.dispatchEvent(new CustomEvent<CardPathChangedEventDetail>(CARD_PATH_CHANGED_EVENT, { detail }))
    }
    private dispatchCardChanges(
        previousCards: ProjectSnapshot['activeCards'],
        nextCards: ProjectSnapshot['activeCards'],
    ) {
        const previousByPath = new Map(previousCards.map((card) => [card.path, card]))
        const nextByPath = new Map(nextCards.map((card) => [card.path, card]))
        for (const card of previousCards) {
            if (!nextByPath.has(card.path)) {
                this.dispatchEvent(new CustomEvent<CardRemovedEventDetail>(CARD_REMOVED_EVENT, { detail: { card } }))
            }
        }
        for (const card of nextCards) {
            const previousCard = previousByPath.get(card.path)
            if (!previousCard) {
                this.dispatchEvent(new CustomEvent<CardAddedEventDetail>(CARD_ADDED_EVENT, { detail: { card } }))
            } else if (previousCard !== card) {
                const detail = { card, previousCard }
                this.dispatchEvent(new CustomEvent<CardChangedEventDetail>(CARD_CHANGED_EVENT, { detail }))
                if (previousCard.header.status !== card.header.status && card.header.status) {
                    const finishNotification = notifyActionCardStateChange(card.header.internalId, card.header.status)
                    void finishNotification.catch((error: unknown) => {
                        dialogService.error(error, { fallbackMessage: 'Could not update automatic agent finish' })
                    })
                }
            }
        }
    }
    private dispatchPersistenceChanged() {
        const nextSnapshot = this.getPersistenceSnapshot()
        if (DataService.isSamePersistenceSnapshot(this.persistenceSnapshot, nextSnapshot)) return

        this.persistenceSnapshot = nextSnapshot
        this.dispatchEvent(new CustomEvent<DataPersistenceSnapshot>('persistenceChanged', { detail: nextSnapshot }))
    }
    private static isSamePersistenceSnapshot(first: DataPersistenceSnapshot, second: DataPersistenceSnapshot) {
        return first.hasPendingFileCommit === second.hasPendingFileCommit
            && first.hasPendingPush === second.hasPendingPush
            && first.isSaving === second.isSaving
    }
}

export const dataService = new DataService()
