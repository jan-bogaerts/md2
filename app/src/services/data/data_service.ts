import {
    COMMIT_BATCHER_FLUSH_FAILED_EVENT,
    COMMIT_BATCHER_PENDING_CHANGED_EVENT,
    CommitBatcher,
} from '../../data/commit_batcher'
import type { ActionContext } from '../../data/action_context'
import { resolveProjectConfigPaths, type MarkdownFile, type ProjectConfig, type ProjectReference, type ProjectSnapshot, type RunningAgent, type StorageService } from '../../data/data_types'
import type { RemarkableBridge } from '../../data/remarkable_bridge'
import { agentAcknowledgementService } from '../agents/agent_acknowledgement_service'
import { agentConversationService, loadAgentConversation } from '../agents/agent_conversation_service'
import { planAgentReferenceMigration } from '../agents/agent_reference_migration'
import { CardOperations, type CardOperationsDeps } from './card_operations'
import { configService } from '../config/config_service'
import { type DataServiceDependencies, getProjectConfigOrNull, reportCommitFlushFailure } from './data_service_context'
import { actionRunRegistry, notifyActionCardStateChange } from '../actions/action_run_registry'
import { actionService } from '../actions/action_service'
import { AgentIntegration, type AgentIntegrationDeps } from '../agents/agent_integration'
import { ProjectLoading, type ProjectLoadingDeps } from '../project/project_loading'
import { ProjectState } from '../project/project_state'
import { ReleaseOperations, type ReleaseOperationsDeps } from '../release_operations'
import { SaveStateService, withSaveStateTracking } from '../project/save_state_service'
import { getRemarkableMetadataContent, importRemarkableImages, type RemarkableImportInput } from '../remarkable/remarkable_import_service'
import type { RemarkableImportPlan } from '../remarkable/remarkable_import_service'
import { getService, register } from '../service_injector'
import { telemetryService } from '../telemetry/telemetry_service'
import { worktreeService } from '../project/worktree_service'
import { mergeConflictService } from '../project/merge_conflict_service'
import { dialogService } from '../dialog_service'
import type { CardParseError } from './markdown_parsing_service'
import type { OpenDocumentSaveReference } from '../open_files_service'
import { CARD_CHANGED_EVENT, CARD_FIELDS, cardCollectionFieldChangedEvent, cardFieldChangedEvent, type CardField } from './card_events'
import { projectAgentTokenUsageService } from '../agents/project_agent_token_usage_service'
import { withExpectedPersistenceOutcomes } from '../project/expected_persistence_storage'

export { CARD_CHANGED_EVENT, cardCollectionFieldChangedEvent, cardFieldChangedEvent } from './card_events'
export type { CardField } from './card_events'

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
export const CARD_PATH_CHANGED_EVENT = 'cardPathChanged'
export const CARD_REMOVED_EVENT = 'cardRemoved'

function reportCardParseErrors(errors: CardParseError[]) {
    const paths = errors.map(({ path }) => path).join(', ')
    dialogService.warning(`Some project files could not be loaded and were skipped: ${paths}`, { title: 'Some cards were not loaded' })
    errors.forEach(({ error }) => telemetryService.captureError(error))
}

function eventCard(card: ProjectSnapshot['activeCards'][number]) {
    return {
        ...card,
        header: {
            ...card.header,
            affects: [...card.header.affects],
            agentLogReferences: [...card.header.agentLogReferences],
            changedFiles: [...card.header.changedFiles],
            policy: { ...card.header.policy },
            references: [...card.header.references],
        },
    }
}

function isSameArray<T>(first: readonly T[], second: readonly T[]) {
    return first === second || (first.length === second.length && second.every((value, index) => first[index] === value))
}

function isSamePolicy(first: Record<string, boolean>, second: Record<string, boolean>) {
    if (first === second) return true
    const entries = Object.entries(second)

    return Object.keys(first).length === entries.length && entries.every(([key, value]) => first[key] === value)
}

function cardFieldChanged(field: CardField, previousCard: CardAddedEventDetail['card'], card: CardAddedEventDetail['card']) {
    const previousHeader = previousCard.header
    const header = card.header
    if (field === 'affects') return !isSameArray(previousHeader.affects, header.affects)
    if (field === 'changedFiles') return !isSameArray(previousHeader.changedFiles, header.changedFiles)
    if (field === 'body') return previousCard.content !== card.content
    if (field === 'conversation') {
        return !isSameArray(previousCard.agentConversations, card.agentConversations)
            || !isSameArray(previousCard.agentConversationErrors, card.agentConversationErrors)
            || !isSameArray(previousHeader.agentLogReferences, header.agentLogReferences)
    }
    if (field === 'identity') {
        return previousHeader.id !== header.id
            || previousHeader.internalId !== header.internalId
            || previousCard.isActive !== card.isActive
            || previousCard.path !== card.path
    }
    if (field === 'ordering') return previousHeader.after !== header.after || previousHeader.status !== header.status
    if (field === 'policy') return !isSamePolicy(previousHeader.policy, header.policy)
    if (field === 'references') return !isSameArray(previousHeader.references, header.references)
    if (field === 'status') return previousHeader.status !== header.status
    if (field === 'title') return previousHeader.title !== header.title

    return previousHeader.worktree !== header.worktree
        || previousHeader.worktreeError !== header.worktreeError
        || previousHeader.worktreeValue !== header.worktreeValue
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
    private fullProjectLoaded = false
    private readonly reportedAgentReferenceMigrationConflicts: Set<string> = new Set()
    private readonly projectState: ProjectState
    private readonly saveStateService: SaveStateService
    private persistenceSnapshot: DataPersistenceSnapshot = { hasPendingFileCommit: false, hasPendingPush: false, isSaving: false }

    constructor() {
        super()
        this.saveStateService = new SaveStateService()
        this.saveStateService.addEventListener('changed', () => this.dispatchPersistenceChanged())
        this.projectState = new ProjectState(
            (card) => this.agents.attachCardAgentConversations(card),
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
        this.agents = new AgentIntegration(
            this.createAgentIntegrationDependencies(),
            (cardPath, reference) => this.cards.addAgentLogReference(cardPath, reference),
        )
        agentAcknowledgementService.connectConversationStore((conversation) => this.agents.findStoredConversation(conversation))
        this.projectLoading = new ProjectLoading(
            this.createProjectLoadingDependencies(),
            (projectLoadToken) => this.agents.prepareProjectConversationLoad(projectLoadToken),
        )
        this.releases = new ReleaseOperations(this.createReleaseOperationsDependencies(), () => this.cards.flushPendingCommits())
        agentConversationService.subscribe(() => {
            this.dispatchChanged()
            void projectAgentTokenUsageService.refresh().catch((error: unknown) => {
                dialogService.error(error, { fallbackMessage: 'Could not refresh project agent token usage' })
            })
        })
        actionRunRegistry.subscribeActiveRunEvents((event) => {
            if (event.type !== 'update' || event.update.kind !== 'agentUsage') return
            void projectAgentTokenUsageService.refresh().catch((error: unknown) => {
                dialogService.error(error, { fallbackMessage: 'Could not refresh project agent token usage' })
            })
        })
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.projectLoading.reset()
        this.agents.reset()
        this.projectState.resetLoadedProject()
        this.fullProjectLoaded = false
        this.remarkableBridge = dependencies.remarkableBridge ?? null
        this.storage = this.trackStorage(dependencies.storage)
        this.initializeStorageServices()
        worktreeService.init({
            assignCardWorktree: (path, worktree, branch) => this.cards.assignCardWorktree(path, worktree, branch),
            cardSeparatorProvider: () => this.requireDependencies().config.cardSeparator,
            clearCardBranch: (path) => this.cards.clearCardBranch(path),
            flushPendingChanges: flushAggregatePendingChanges,
            projectFolderProvider: () => this.requireDependencies().config.projectFolder,
            projectProvider: () => this.projectState.project,
            snapshotProvider: () => this.projectState.snapshot,
            storageProvider: () => this.storage,
            unassignCardWorktree: (path) => this.cards.updateCardWorktree(path, null),
        })
        this.agents.startScheduledRunWatch()
        const delayMs = configService.get('react.autoCommitDelayMs')
        this.commitBatcher = new CommitBatcher(this.cards, delayMs)
        this.commitBatcher.addEventListener(
            COMMIT_BATCHER_FLUSH_FAILED_EVENT,
            (event) => this.reportCommitFlushFailure((event as CustomEvent<unknown>).detail),
        )
        this.commitBatcher.addEventListener(
            COMMIT_BATCHER_PENDING_CHANGED_EVENT,
            () => this.dispatchPersistenceChanged(),
        )
        this.dispatchChanged()
        this.dispatchPersistenceChanged()
    }

    /** Replace remote transport while preserving loaded project and its in-memory state. */
    replaceRemoteStorage(storage: StorageService) {
        if (!this.storage || !this.projectState.project) throw new Error('Cannot replace storage without a loaded project')

        this.storage = this.trackStorage(storage)
        this.initializeStorageServices()
        this.projectLoading.restartProjectWatch()
    }

    getState(): DataServiceState {
        return {
            project: this.projectState.project,
            runningAgents: agentConversationService.getRunningAgents(),
            snapshot: this.projectState.snapshot,
        }
    }

    isFullProjectLoaded() {
        return this.fullProjectLoaded
    }

    getPersistenceSnapshot(): DataPersistenceSnapshot {
        const currentProject = this.projectState.project

        return {
            hasPendingFileCommit: this.commitBatcher?.hasPending() ?? false,
            hasPendingPush: currentProject ? this.storage?.hasPendingPush?.(currentProject) ?? false : false,
            isSaving: this.saveStateService.getState().isSaving,
        }
    }

    async drainPendingStorageWrites() {
        await this.saveStateService.drain()
    }

    getConfig(): ProjectConfig | null {
        return getProjectConfigOrNull(this.storage)
    }

    /** Conversation ownership follows the presence of cardInternalId, not the context kind. */
    async listAgentConversations(context: ActionContext) {
        if (!context.cardInternalId) return this.agents.listProjectAgentConversations()

        return this.agents.ensureAgentConversationsForCard(context.cardInternalId)
    }
    async loadAgentConversation(path: string) {
        const { storage } = this.requireDependencies()
        const currentProject = this.projectState.project
        if (!currentProject) throw new Error('Cannot load an agent conversation before a project is open')

        return loadAgentConversation(storage, currentProject, path)
    }
    async persistActionFile(
        file: MarkdownFile,
        actionId: string,
        sourcePath = file.path,
        onPathCommitted?: (fromPath: string, toPath: string) => void,
        saveReference?: OpenDocumentSaveReference,
        onPersisted?: () => void,
    ) {
        const { commitBatcher } = this.requireDependencies()
        const currentProject = this.projectState.project
        if (!currentProject) throw new Error('Cannot save an action before a project is open')

        if (!onPathCommitted) throw new Error(`Missing action path callback for ${actionId}`)
        const change = {
            ...file,
            actionId,
            kind: 'action' as const,
            onPathCommitted,
            onPersisted,
            saveReference,
            sourcePath,
        }
        const message = sourcePath === file.path ? `Update ${file.path}` : `Rename ${sourcePath} to ${file.path}`
        commitBatcher.schedule(currentProject.branch, [change], message)
    }

    /** Queues a repository file that is not part of loaded card state for the shared commit batch. */
    scheduleFileCommit(file: MarkdownFile, message: string) {
        const { commitBatcher } = this.requireDependencies()
        const currentProject = this.projectState.project
        if (!currentProject) throw new Error('Cannot save a file before a project is open')

        commitBatcher.schedule(currentProject.branch, [{ ...file, kind: 'file' as const }], message)
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
            addRepositoryFile: (path) => this.projectState.addRepositoryFile(path),
            applyMoves: (moves, workingFolder) => this.projectState.applyMoves(moves, workingFolder),
            cardPathChanged: (fromPath, toPath) => this.dispatchCardPathChanged(fromPath, toPath),
            dispatchChanged: () => this.dispatchChanged(),
            dispatchPersistenceChanged: () => this.dispatchPersistenceChanged(),
            deleteFile: (path, committedFiles, workingFolder) => (
                this.projectState.deleteFile(path, committedFiles, workingFolder)
            ),
            files: () => this.projectState.files,
            mergeCommittedFiles: (files, workingFolder) => this.projectState.mergeCommittedFiles(files, workingFolder),
            mutateCard: (path, mutation, workingFolder) => this.projectState.mutateCard(path, mutation, workingFolder),
            project: () => this.projectState.project,
            recordCurrentContent: (files) => this.projectState.recordCurrentContent(files),
            reconcileDeletedActionFile: (path) => actionService.reconcileCommittedDeletion(path),
            refreshSnapshot: (workingFolder) => this.refreshSnapshot(workingFolder),
            reloadCurrentProjectSnapshot: () => this.projectLoading.reloadCurrentProjectSnapshot(),
            removeFolder: (path, workingFolder) => this.projectState.removeFolder(path, workingFolder),
            renameFile: (fromPath, toPath, workingFolder) => this.projectState.renameFile(fromPath, toPath, workingFolder),
            requireDependencies: () => this.requireDependencies(),
            requireCard: (path) => this.projectState.requireCard(path),
            requireCardByInternalId: (internalId) => this.projectState.requireCardByInternalId(internalId),
            requireFile: (path) => this.projectState.requireFile(path),
            replaceFiles: (files, workingFolder) => this.projectState.replaceFiles(files, workingFolder),
            snapshot: () => this.projectState.snapshot,
            updateFiles: (updatedFiles, removedPaths, workingFolder) => (
                this.projectState.updateFiles(updatedFiles, removedPaths, workingFolder)
            ),
        }
    }

    private createAgentIntegrationDependencies(): AgentIntegrationDeps {
        return {
            conversationsChanged: (cardPath) => {
                this.projectState.refreshCardConversations(cardPath, this.requireDependencies().config.workingFolder)
                this.dispatchEvent(new Event(cardFieldChangedEvent(cardPath, 'conversation')))
            },
            findCardByInternalId: (cardInternalId) => this.projectState.findCardByInternalId(cardInternalId),
            isCurrentLoad: (project, projectLoadToken) => this.projectState.isCurrentLoad(project, projectLoadToken),
            project: () => this.projectState.project,
            requireDependencies: () => this.requireDependencies(),
            snapshot: () => this.projectState.snapshot,
        }
    }

    private createProjectLoadingDependencies(): ProjectLoadingDeps {
        return {
            beginProjectLoad: () => {
                this.fullProjectLoaded = false
                return this.projectState.beginProjectLoad()
            },
            clearLoadedProject: () => this.projectState.resetLoadedProject(),
            expectedPersistenceOutcomes: () => this.projectState.expectedPersistenceOutcomes,
            dispatchChanged: () => this.dispatchChanged(),
            dispatchPersistenceChanged: () => this.dispatchPersistenceChanged(),
            dispatchRepositoryChanged: (event) => {
                projectAgentTokenUsageService.handleRepositoryChange(event)
                this.dispatchEvent(new CustomEvent('repositoryChanged', { detail: event }))
            },
            files: () => this.projectState.files,
            flushPendingChanges: flushAggregatePendingChanges,
            hydrateActiveCardConversations: () => this.agents.hydrateActiveCardConversations(),
            matchesCurrentContent: (path, content) => this.projectState.matchesCurrentContent(path, content),
            isCurrentLoad: (project, projectLoadToken) => this.projectState.isCurrentLoad(project, projectLoadToken),
            mergeBackgroundProjectFiles: (files, workingFolder, repositoryFiles) => (
                this.projectState.mergeBackgroundProjectFiles(files, workingFolder, repositoryFiles)
            ),
            markFullProjectLoaded: () => {
                this.fullProjectLoaded = true
            },
            migrateAgentLogReferences: () => this.migrateAgentLogReferences(),
            project: () => this.projectState.project,
            projectToken: () => this.projectState.projectToken,
            replaceFiles: (files, workingFolder) => this.projectState.replaceFiles(files, workingFolder),
            replaceProject: (project) => {
                const currentProject = this.projectState.project
                const projectChanged = currentProject?.id !== project?.id || currentProject?.branch !== project?.branch
                this.projectState.replaceProject(project)
                if (projectChanged) this.cards.resetProjectTracking()
            },
            ensureCardInternalIds: async () => {
                if (this.cards.ensureCardInternalIds() > 0) await this.cards.flushPendingCommits()
            },
            replaceProjectFiles: (files, workingFolder, repositoryFiles) => (
                this.projectState.replaceProjectFiles(files, workingFolder, repositoryFiles)
            ),
            updateFiles: (updatedFiles, removedPaths, workingFolder) => (
                this.projectState.updateFiles(updatedFiles, removedPaths, workingFolder)
            ),
            updateRepositoryFile: (event) => this.projectState.updateRepositoryFile(event),
            requireDependencies: () => this.requireDependencies(),
            resetAgentConversations: () => this.agents.resetLoadedConversations(),
            snapshot: () => this.projectState.snapshot,
            storage: () => this.storage,
        }
    }

    private trackStorage(storage: StorageService) {
        const saveTrackedStorage = withSaveStateTracking(storage, this.saveStateService)

        return withExpectedPersistenceOutcomes(saveTrackedStorage, {
            outcomes: this.projectState.expectedPersistenceOutcomes,
            project: () => this.projectState.project,
            repositoryFiles: () => this.projectState.snapshot?.repositoryFiles ?? [],
            verifyRetainedOutcomes: () => this.projectLoading.verifyExpectedPersistenceOutcomes(),
        })
    }

    private createReleaseOperationsDependencies(): ReleaseOperationsDeps {
        return {
            applyMoves: (moves, workingFolder) => this.projectState.applyMoves(moves, workingFolder),
            dispatchChanged: () => this.dispatchChanged(),
            files: () => this.projectState.files,
            project: () => this.projectState.project,
            requireDependencies: () => this.requireDependencies(),
            resetAgentConversations: () => this.agents.resetLoadedConversations(),
            snapshot: () => this.projectState.snapshot,
        }
    }

    private refreshSnapshot(workingFolder: string) {
        this.projectState.refreshSnapshot(workingFolder)
        this.dispatchChanged()
    }
    private async migrateAgentLogReferences() {
        const snapshot = this.projectState.snapshot
        if (!snapshot) return

        const cards = [...snapshot.activeCards, ...snapshot.backgroundCards]
        const { conflicts, plans } = planAgentReferenceMigration(cards)
        const project = this.projectState.project
        const newConflicts = conflicts.filter(({ cardPath, message }) => {
            const key = `${project?.id}:${project?.branch}:${cardPath}:${message}`
            if (this.reportedAgentReferenceMigrationConflicts.has(key)) return false

            this.reportedAgentReferenceMigrationConflicts.add(key)

            return true
        })
        if (newConflicts.length > 0) {
            const details = newConflicts.map(({ cardPath, message }) => `${cardPath}: ${message}`).join('\n')
            dialogService.warning(details, { title: 'Some card activity references were not migrated' })
        }
        if (plans.length === 0) return

        const resumeAutomaticCommit = this.cards.deferAutomaticCommit()
        try {
            for (const { cardPath, references } of plans) {
                this.cards.setAgentLogReferences(cardPath, references, 'Migrate card activity references')
            }
        } finally {
            resumeAutomaticCommit()
        }
        await this.cards.flushPendingCommits()
    }
    private initializeStorageServices() {
        if (!this.storage) throw new Error('Data service storage is not initialized')

        mergeConflictService.init({
            completeBranchCleanup: (cardInternalId) => {
                const snapshot = this.projectState.snapshot
                const card = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
                    .find((candidate) => candidate.header.internalId === cardInternalId)
                if (!card) return
                this.cards.updateCardWorktree(card.path, null)
                this.cards.clearCardBranch(card.path)
            },
            reloadPaths: (paths) => this.projectLoading.reloadConflictPaths(paths),
            reportError: (error) => dialogService.error(error, { fallbackMessage: 'Could not verify merge conflict state' }),
            storage: this.storage,
        })
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
                this.dispatchEvent(new CustomEvent<CardRemovedEventDetail>(CARD_REMOVED_EVENT, { detail: { card: eventCard(card) } }))
            }
        }
        for (const card of nextCards) {
            const previousCard = previousByPath.get(card.path)
            if (!previousCard) {
                this.dispatchEvent(new CustomEvent<CardAddedEventDetail>(CARD_ADDED_EVENT, { detail: { card: eventCard(card) } }))
            } else if (previousCard !== card) {
                const detail = { card: eventCard(card), previousCard: eventCard(previousCard) }
                this.dispatchEvent(new CustomEvent<CardChangedEventDetail>(CARD_CHANGED_EVENT, { detail }))
                for (const field of CARD_FIELDS) {
                    if (!cardFieldChanged(field, previousCard, card)) continue
                    this.dispatchEvent(new Event(cardFieldChangedEvent(card.path, field)))
                    this.dispatchEvent(new Event(cardCollectionFieldChangedEvent(field)))
                }
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
