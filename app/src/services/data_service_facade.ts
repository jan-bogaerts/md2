import { CommitBatcher } from '../data/commit_batcher'
import { cardContext, type ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import { ACTION_SCHEDULES_FILE } from '../data/action_schedule_types'
import { createCardFile } from '../data/card_naming'
import { computeMove, orderByAfter, UNASSIGNED_STATUS } from '../data/card_ordering'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import { buildReleaseMoves } from '../data/release_archiving'
import {
    type AgentConversation,
    type AgentConversationError,
    type AgentRunEvent,
    type CardDraft,
    type MarkdownFile,
    type ProjectConfig,
    type ProjectReference,
    type ProjectWatchEvent,
    type ProjectSnapshot,
    type RunningAgent,
    type StorageService,
} from '../data/data_types'
import { getRemarkableBridge, validateRemarkableSettings, type RemarkableBridge, type RemarkableConnectionSettings } from '../data/remarkable_bridge'
import { remarkableMetadataPath } from '../data/remarkable_import_metadata'
import { actionService } from './action_service'
import { actionRunner } from './action_runner'
import { agentConversationService, loadAgentConversation } from './agent_conversation_service'
import { mapWithConcurrency } from './concurrency'
import { buildRemarkableImport, type RemarkableImportPlan, type RemarkableImportTarget } from './remarkable_import_service'
import { configService } from './config_service'
import { markdownParsingService } from './markdown_parsing_service'
import { register } from './service_injector'
import { telemetryService } from './telemetry_service'

const ACTION_RELOAD_DEBOUNCE_MS = 150
const AGENT_CONVERSATION_LOAD_CONCURRENCY = 8
const JSON_EXTENSION = '.json'
const ON_STATE_ACTION_ERROR_PATH_PREFIX = 'onState'

function isActionDefinitionPath(path: string, actionsFolder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedActionsFolder = actionsFolder.replace(/\\/gu, '/').replace(/\/$/u, '')
    const fileName = normalizedPath.split('/').pop()
    if (fileName === ACTION_SCHEDULES_FILE) return false

    return normalizedPath.startsWith(`${normalizedActionsFolder}/`) && normalizedPath.toLowerCase().endsWith(JSON_EXTENSION)
}

function isOnStateActionError(error: AgentConversationError) {
    return error.path.startsWith(`${ON_STATE_ACTION_ERROR_PATH_PREFIX}:`)
}

/** Merge committed files into the loaded set: replace matching paths, append new ones. */
function mergeFiles(current: MarkdownFile[], updates: MarkdownFile[]): MarkdownFile[] {
    const updateByPath = new Map(updates.map((file) => [file.path, file]))
    const merged = current.map((file) => updateByPath.get(file.path) ?? file)
    const existingPaths = new Set(current.map((file) => file.path))
    for (const file of updates) {
        if (!existingPaths.has(file.path)) merged.push(file)
    }

    return merged
}

function statusOf(card: ProjectSnapshot['activeCards'][number]) {
    return card.header.status ?? UNASSIGNED_STATUS
}

function isSameProjectReference(left: ProjectReference | null, right: ProjectReference) {
    return left?.branch === right.branch
        && left.id === right.id
        && left.owner === right.owner
        && left.repository === right.repository
        && left.rootPath === right.rootPath
}

interface DataServiceDependencies {
    remarkableBridge?: RemarkableBridge
    storage: StorageService
}

export interface RemarkableImportInput {
    paths: string[]
    settings: RemarkableConnectionSettings
    target: RemarkableImportTarget
}

export interface DataServiceState {
    hasPendingCommits: boolean
    project: ProjectReference | null
    runningAgents: RunningAgent[]
    snapshot: ProjectSnapshot | null
}

interface ResolvedAgentConversations {
    conversationsByCardPath: Map<string, AgentConversation[]>
    errorsByCardPath: Map<string, AgentConversationError[]>
}

interface AgentConversationLoadTask {
    cardPath: string
    reference: string
}

type AgentConversationLoadResult =
    | { cardPath: string; conversation: AgentConversation; error: null }
    | { cardPath: string; conversation: null; error: AgentConversationError }

async function loadAgentConversationReference(
    task: AgentConversationLoadTask,
    project: ProjectReference,
    storage: StorageService,
): Promise<AgentConversationLoadResult> {
    try {
        const conversation = await loadAgentConversation(storage, project, task.reference)
        if (conversation.cardPath !== task.cardPath) throw new Error(`Agent log belongs to ${conversation.cardPath}, not ${task.cardPath}`)

        return { cardPath: task.cardPath, conversation, error: null }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Agent log failed to load'

        return { cardPath: task.cardPath, conversation: null, error: { message, path: task.reference } }
    }
}

async function resolveAgentConversations(
    cards: ProjectSnapshot['activeCards'],
    project: ProjectReference,
    storage: StorageService,
): Promise<ResolvedAgentConversations> {
    const conversationsByCardPath = new Map<string, AgentConversation[]>()
    const errorsByCardPath = new Map<string, AgentConversationError[]>()
    const tasks = cards.flatMap((card) => card.header.agentLogReferences.map((reference) => ({ cardPath: card.path, reference })))
    const results = await mapWithConcurrency(tasks, AGENT_CONVERSATION_LOAD_CONCURRENCY, async (task) => (
        loadAgentConversationReference(task, project, storage)
    ))

    for (const result of results) {
        if (result.error) {
            errorsByCardPath.set(result.cardPath, [...(errorsByCardPath.get(result.cardPath) ?? []), result.error])
            continue
        }

        conversationsByCardPath.set(result.cardPath, [...(conversationsByCardPath.get(result.cardPath) ?? []), result.conversation])
    }

    return { conversationsByCardPath, errorsByCardPath }
}

export class DataService extends EventTarget {
    private actionReloadChangedPath: string | null
    private actionReloadTimeout: number | null
    private agentConversationLoadToken: number
    private commitBatcher: CommitBatcher | null
    private conversationsByCardPath: Map<string, AgentConversation[]>
    private currentFiles
    private currentProject: ProjectReference | null
    private currentSnapshot: ProjectSnapshot | null
    private errorsByCardPath: Map<string, AgentConversationError[]>
    private projectLoadToken: number
    private remarkableBridge: RemarkableBridge | null
    private storage: StorageService | null
    private scheduledRunCleanup: (() => void) | null
    private watchCleanup: (() => void) | null

    constructor() {
        super()
        this.actionReloadChangedPath = null
        this.actionReloadTimeout = null
        this.agentConversationLoadToken = 0
        this.commitBatcher = null
        this.conversationsByCardPath = new Map()
        this.currentFiles = [] as MarkdownFile[]
        this.currentProject = null
        this.currentSnapshot = null
        this.errorsByCardPath = new Map()
        this.projectLoadToken = 0
        this.remarkableBridge = null
        this.storage = null
        this.scheduledRunCleanup = null
        this.watchCleanup = null
        agentConversationService.subscribe(() => this.dispatchChanged())
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.stopProjectWatch()
        this.stopScheduledRunWatch()
        this.clearActionReloadTimeout()
        this.actionReloadChangedPath = null
        this.agentConversationLoadToken += 1
        this.conversationsByCardPath = new Map()
        this.currentFiles = []
        this.currentProject = null
        this.currentSnapshot = null
        this.errorsByCardPath = new Map()
        this.projectLoadToken += 1
        this.remarkableBridge = dependencies.remarkableBridge ?? null
        this.storage = dependencies.storage
        this.startScheduledRunWatch()
        actionService.init()
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
        telemetryService.trackEvent('create_project')

        return this.openProject(this.currentProject)
    }

    async openProject(project: ProjectReference) {
        const { storage } = this.requireDependencies()
        const projectLoadToken = this.projectLoadToken + 1
        this.projectLoadToken = projectLoadToken
        this.agentConversationLoadToken += 1
        this.conversationsByCardPath = new Map()
        this.errorsByCardPath = new Map()
        this.currentProject = project
        const projectConfig = await storage.loadProjectConfig(project)
        configService.loadProjectConfig(projectConfig)
        const config = configService.getProjectConfig()
        if (config.pushMode === 'manual') await storage.restorePendingCommits?.(project)
        const actionFiles = await storage.loadActionFiles(project, config.actionsFolder)
        actionService.loadFromFiles(actionFiles)
        const projectFiles = await storage.loadProjectRoot(project, config.workingFolder)
        const repositoryFiles: string[] = []
        this.currentFiles = projectFiles.files
        this.currentSnapshot = this.createSnapshot(projectFiles.files, projectFiles.workingFolder, repositoryFiles)
        this.startProjectWatch()
        this.dispatchChanged()
        this.loadAgentConversationsInBackground(this.currentSnapshot, project, projectLoadToken)
        void this.loadFullProjectInBackground(project, config.workingFolder, projectLoadToken)
        telemetryService.trackEvent('open_project')

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
        await this.commitAndMergeFiles({
            branch: this.currentProject.branch,
            files: [file],
            message: `Create ${file.path}`,
        }, [file])

        if (config.pushMode === 'auto') await storage.push(this.currentProject)

        this.refreshSnapshot()
        telemetryService.trackEvent('create_card')

        return file
    }

    getRemarkableMetadataContent(): string | null {
        const config = this.getConfig()
        if (!config) return null

        const path = remarkableMetadataPath(config.workingFolder)

        return this.currentFiles.find((file) => file.path === path)?.content ?? null
    }

    /**
     * Import selected Remarkable images beside a target card and commit the card, image assets and
     * refreshed import metadata together. The transfer and file plan are built before any commit, so
     * a failure (bad settings, transfer error, duplicate name, unsupported type) leaves state intact.
     */
    async importRemarkableImages(request: RemarkableImportInput): Promise<RemarkableImportPlan> {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot import Remarkable images before a project is open')

        const bridge = this.remarkableBridge ?? getRemarkableBridge()
        if (!bridge) throw new Error('Remarkable import requires Electron local mode')

        const settings = validateRemarkableSettings(request.settings)
        const assets = await bridge.importFiles({ paths: request.paths, settings })
        const plan = buildRemarkableImport({
            assets,
            config,
            files: this.currentFiles,
            importedAt: new Date().toISOString(),
            metadataContent: this.getRemarkableMetadataContent(),
            settings,
            target: request.target,
        })

        await this.commitAndMergeFiles({
            branch: this.currentProject.branch,
            files: plan.commitFiles,
            message: plan.message,
        }, plan.commitFiles)

        if (config.pushMode === 'auto') await storage.push(this.currentProject)

        this.refreshSnapshot()
        telemetryService.trackEvent('remarkable_import')

        return plan
    }

    updateCardBody(path: string, body: string) {
        const existingFile = this.requireFile(path)

        return this.saveFile({ content: markdownParsingService.replaceBody(existingFile.content, body), path, sha: existingFile.sha })
    }

    updateCardAffects(path: string, affects: string[]) {
        const existingFile = this.requireFile(path)

        return this.saveFile({ content: markdownParsingService.setAffects(existingFile.content, affects), path, sha: existingFile.sha })
    }

    async continueAgentConversation(cardPath: string, sourcePath: string) {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot continue an agent before a project is open')

        const result = await agentConversationService.continueConversation(
            storage,
            this.currentProject,
            { cardPath, sourcePath },
            (event) => this.recordAgentRunEvent(cardPath, event),
        )
        this.upsertAgentConversation(cardPath, result.conversation)

        return this.linkAgentConversation(cardPath, result.conversation, result.reference)
    }

    async startAgentConversation(cardPath: string, prompt: string) {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot start an agent before a project is open')

        const result = await agentConversationService.startConversation(
            storage,
            this.currentProject,
            { cardPath, prompt, title: `Agent ${cardPath}` },
            (event) => this.handleAgentRunEvent(cardPath, event),
        )
        this.upsertAgentConversation(cardPath, result.conversation)

        return this.linkAgentConversation(cardPath, result.conversation, result.reference)
    }

    async sendAgentInput(runId: string, input: string) {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot send agent input before a project is open')
        if (!storage.sendAgentInput) throw new Error('Sending agent input requires an Electron agent bridge')

        await storage.sendAgentInput(this.currentProject, runId, input)
    }

    recordAgentRunEvent(cardPath: string, event: AgentRunEvent) {
        this.upsertAgentConversation(cardPath, event.conversation)
    }

    linkAgentConversation(cardPath: string, conversation: AgentConversation, reference: string) {
        const existingFile = this.requireFile(cardPath)
        const card = markdownParsingService.parseCard(existingFile, this.requireDependencies().config.workingFolder)
        const nextReferences = [...new Set([...card.header.agentLogReferences, reference])]
        this.upsertAgentConversation(cardPath, conversation)

        return this.saveFile({
            content: markdownParsingService.setAgentLogReferences(existingFile.content, nextReferences),
            path: cardPath,
            sha: existingFile.sha,
        })
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
        const movedCard = activeCards.find((card) => card.path === cardPath)
        const previousStatus = movedCard?.header.status ?? null
        const updates = computeMove(activeCards, cardPath, targetStatus, targetIndex)

        for (const update of updates) {
            this.updateCardHeaderFields(update.path, { after: update.after ?? '', status: update.status })
        }

        if (movedCard && previousStatus !== targetStatus) this.triggerStateActions(movedCard.path, targetStatus)

        return updates
    }

    async deleteCard(path: string) {
        const card = this.currentSnapshot?.activeCards.find((currentCard) => currentCard.path === path)
        if (!card) throw new Error(`Cannot delete an active card that is not loaded: ${path}`)

        return this.deleteLoadedFile(path, true)
    }

    async deleteFile(path: string) {
        this.requireFile(path)

        const activeCard = this.currentSnapshot?.activeCards.some((card) => card.path === path) ?? false

        return this.deleteLoadedFile(path, activeCard)
    }

    saveFile(file: MarkdownFile) {
        const { commitBatcher } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot save a file before a project is open')

        this.currentFiles = this.currentFiles.map((currentFile) => (currentFile.path === file.path ? file : currentFile))
        commitBatcher.schedule(this.currentProject.branch, [file], `Update ${file.path}`)
        this.refreshSnapshot()

        return file
    }

    async saveProjectFile(file: MarkdownFile, message: string) {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot save a project file before a project is open')

        await this.commitAndMergeFiles({
            branch: this.currentProject.branch,
            files: [file],
            message,
        }, [file])

        if (config.pushMode === 'auto') await storage.push(this.currentProject)

        return file
    }

    async flushPendingCommits() {
        await this.flushPendingCommitBatch()
    }

    async completeRelease(releaseName: string) {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot complete a release before a project is open')

        await this.flushPendingCommitBatch()

        const activeCards = this.currentSnapshot?.activeCards ?? []
        if (activeCards.length === 0) throw new Error('Cannot complete a release without active cards')

        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        const moves = buildReleaseMoves(this.currentFiles, activeCards, config.workingFolder, releaseName, repositoryFiles)
        await storage.moveFiles({
            branch: this.currentProject.branch,
            message: `Complete release ${releaseName.trim()}`,
            moves,
        })

        if (config.pushMode === 'auto') await storage.push(this.currentProject)

        await this.reloadCurrentProjectSnapshot()
        telemetryService.trackEvent('complete_release')

        return this.currentSnapshot
    }

    async push() {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot push before a project is open')

        await storage.push(this.currentProject)
        this.dispatchChanged()
    }

    private refreshSnapshot() {
        const { config } = this.requireDependencies()
        const cards = this.attachAgentConversations(markdownParsingService.splitCards(this.currentFiles, config.workingFolder))
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.currentSnapshot = { ...cards, repositoryFiles, workingFolder: config.workingFolder }
        this.dispatchChanged()
    }

    private async deleteLoadedFile(path: string, repairActiveOrdering: boolean) {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot delete a file before a project is open')

        await this.flushPendingCommitBatch()

        const existingFile = this.requireFile(path)
        const repairFile = repairActiveOrdering ? this.createDeleteRepairFile(path) : null

        if (repairFile) {
            await storage.commit({
                branch: this.currentProject.branch,
                files: [repairFile],
                message: `Repair ordering after deleting ${path}`,
            })
        }

        await storage.deleteFile({
            branch: this.currentProject.branch,
            message: `Delete ${path}`,
            path,
            sha: existingFile.sha,
        })

        if (config.pushMode === 'auto') await storage.push(this.currentProject)

        await this.reloadCurrentProjectSnapshot()

        return this.currentSnapshot
    }

    private createDeleteRepairFile(path: string): MarkdownFile | null {
        const activeCards = this.currentSnapshot?.activeCards ?? []
        const deletedCard = activeCards.find((card) => card.path === path)
        if (!deletedCard) return null
        if (!deletedCard.header.internalId) return null

        const column = orderByAfter(activeCards.filter((card) => statusOf(card) === statusOf(deletedCard)))
        const deletedIndex = column.findIndex((card) => card.path === path)
        const follower = column[deletedIndex + 1]
        if (!follower || follower.header.after !== deletedCard.header.internalId) return null

        const followerFile = this.requireFile(follower.path)

        return {
            content: markdownParsingService.rewriteHeader(followerFile.content, { after: deletedCard.header.after ?? '' }),
            path: followerFile.path,
            sha: followerFile.sha,
        }
    }

    private async reloadCurrentProjectSnapshot() {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot reload project snapshot before a project is open')

        const project = this.currentProject
        const projectLoadToken = this.projectLoadToken + 1
        this.projectLoadToken = projectLoadToken
        const projectFiles = await storage.loadProject(this.currentProject, config.workingFolder)
        const repositoryFiles = await storage.listRepositoryFiles(this.currentProject)
        this.currentFiles = projectFiles.files
        this.currentSnapshot = this.createSnapshot(projectFiles.files, projectFiles.workingFolder, repositoryFiles)
        this.dispatchChanged()
        this.loadAgentConversationsInBackground(this.currentSnapshot, project, projectLoadToken)
    }

    private async flushPendingCommitBatch() {
        const { commitBatcher } = this.requireDependencies()
        const hadPendingCommits = commitBatcher.hasPending()

        await commitBatcher.flush()

        if (hadPendingCommits) this.dispatchChanged()
    }

    private createSnapshot(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]): ProjectSnapshot {
        const cards = markdownParsingService.splitCards(files, workingFolder)

        return { ...this.attachAgentConversations(cards), repositoryFiles, workingFolder }
    }

    private async loadFullProjectInBackground(project: ProjectReference, workingFolder: string, projectLoadToken: number) {
        const { storage } = this.requireDependencies()

        try {
            const [projectFiles, repositoryFiles] = await Promise.all([
                storage.loadProject(project, workingFolder),
                storage.listRepositoryFiles(project),
            ])
            if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return

            this.currentFiles = mergeFiles(projectFiles.files, this.currentFiles)
            this.currentSnapshot = this.createSnapshot(this.currentFiles, projectFiles.workingFolder, repositoryFiles)
            this.dispatchChanged()
            this.loadAgentConversationsInBackground(this.currentSnapshot, project, projectLoadToken)
        } catch (error) {
            console.error('Failed to load full project in background', error)
        }
    }

    private shouldApplyProjectLoad(project: ProjectReference, projectLoadToken: number) {
        return this.projectLoadToken === projectLoadToken && isSameProjectReference(this.currentProject, project)
    }

    private loadAgentConversationsInBackground(snapshot: ProjectSnapshot, project: ProjectReference, projectLoadToken: number) {
        const cards = [...snapshot.activeCards, ...snapshot.backgroundCards]
        const agentConversationLoadToken = this.agentConversationLoadToken + 1
        this.agentConversationLoadToken = agentConversationLoadToken
        void this.resolveAndAttachAgentConversations(cards, project, projectLoadToken, agentConversationLoadToken)
    }

    private async resolveAndAttachAgentConversations(
        cards: ProjectSnapshot['activeCards'],
        project: ProjectReference,
        projectLoadToken: number,
        agentConversationLoadToken: number,
    ) {
        const { storage } = this.requireDependencies()
        const resolved = await resolveAgentConversations(cards, project, storage)
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return
        if (this.agentConversationLoadToken !== agentConversationLoadToken) return

        this.conversationsByCardPath = resolved.conversationsByCardPath
        this.errorsByCardPath = this.mergeResolvedAgentErrors(resolved.errorsByCardPath)
        this.refreshSnapshot()
    }

    private mergeResolvedAgentErrors(resolvedErrors: Map<string, AgentConversationError[]>) {
        const errors = new Map(resolvedErrors)

        for (const [cardPath, existingErrors] of this.errorsByCardPath) {
            const onStateErrors = existingErrors.filter(isOnStateActionError)
            if (onStateErrors.length === 0) continue

            errors.set(cardPath, [...(errors.get(cardPath) ?? []), ...onStateErrors])
        }

        return errors
    }

    private attachAgentConversations(cards: Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>) {
        return {
            activeCards: cards.activeCards.map((card) => ({
                ...card,
                agentConversationErrors: this.errorsByCardPath.get(card.path) ?? [],
                agentConversations: this.conversationsByCardPath.get(card.path) ?? [],
            })),
            backgroundCards: cards.backgroundCards.map((card) => ({
                ...card,
                agentConversationErrors: this.errorsByCardPath.get(card.path) ?? [],
                agentConversations: this.conversationsByCardPath.get(card.path) ?? [],
            })),
        }
    }

    private triggerStateActions(cardPath: string, state: string) {
        const { config } = this.requireDependencies()
        const card = this.currentSnapshot?.activeCards.find((currentCard) => currentCard.path === cardPath)
        if (!card) return

        const context = cardContext(card, config.cardTypes)
        const actions = actionService.getActionsForStateTrigger(state, context)
        for (const action of actions) {
            this.runStateAction(action, context, cardPath)
        }
    }

    private async runStateAction(action: ActionDefinition, context: ActionContext, cardPath: string) {
        try {
            const result = await actionRunner.run(action, context)
            if (result.status === 'completed') return

            const failedLog = result.logs.find((log) => log.status === 'failed')
            this.recordCardAgentError(cardPath, action.name, failedLog?.message ?? `${action.label} failed`)
        } catch (error) {
            this.recordCardAgentError(cardPath, action.name, error instanceof Error ? error.message : `${action.label} failed`)
        }
    }

    private recordCardAgentError(cardPath: string, actionName: string, message: string) {
        const path = `${ON_STATE_ACTION_ERROR_PATH_PREFIX}:${actionName}`
        this.errorsByCardPath.set(cardPath, [...(this.errorsByCardPath.get(cardPath) ?? []), { message, path }])
        this.refreshSnapshot()
    }

    private handleAgentRunEvent(cardPath: string, event: AgentRunEvent) {
        this.upsertAgentConversation(cardPath, event.conversation)
    }

    private handleScheduledRunEvent(event: AgentRunEvent) {
        agentConversationService.observeRunEvent(event, event.conversation.title)
        if (!event.conversation.cardPath) {
            this.dispatchChanged()
            return
        }

        this.recordAgentRunEvent(event.conversation.cardPath, event)
    }

    private upsertAgentConversation(cardPath: string, conversation: AgentConversation) {
        const conversations = this.conversationsByCardPath.get(cardPath) ?? []
        const nextConversations = conversations.some((current) => current.id === conversation.id)
            ? conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...conversations, conversation]
        this.conversationsByCardPath.set(cardPath, nextConversations)
        this.refreshSnapshot()
    }

    private startProjectWatch() {
        this.stopProjectWatch()
        if (!this.currentProject || !this.storage?.watchProject) return

        this.watchCleanup = this.storage.watchProject(this.currentProject, (event) => this.handleProjectWatchEvent(event))
    }

    private stopProjectWatch() {
        if (!this.watchCleanup) return

        this.watchCleanup()
        this.watchCleanup = null
    }

    private startScheduledRunWatch() {
        this.stopScheduledRunWatch()
        const bridge = getElectronActionBridge()
        if (!bridge?.onScheduledActionRun) return

        this.scheduledRunCleanup = bridge.onScheduledActionRun((event) => this.handleScheduledRunEvent(event))
    }

    private stopScheduledRunWatch() {
        if (!this.scheduledRunCleanup) return

        this.scheduledRunCleanup()
        this.scheduledRunCleanup = null
    }

    private handleProjectWatchEvent(event: ProjectWatchEvent) {
        const { config } = this.requireDependencies()
        if (!isActionDefinitionPath(event.path, config.actionsFolder)) return

        this.scheduleActionReload(event.path)
    }

    private scheduleActionReload(changedPath: string) {
        this.actionReloadChangedPath = changedPath
        this.clearActionReloadTimeout()
        this.actionReloadTimeout = window.setTimeout(() => {
            void this.reloadActionsFromCurrentProject()
        }, ACTION_RELOAD_DEBOUNCE_MS)
    }

    private clearActionReloadTimeout() {
        if (this.actionReloadTimeout === null) return

        window.clearTimeout(this.actionReloadTimeout)
        this.actionReloadTimeout = null
    }

    private async reloadActionsFromCurrentProject() {
        const { config, storage } = this.requireDependencies()
        if (!this.currentProject) return

        const changedPath = this.actionReloadChangedPath
        if (!changedPath) return

        this.clearActionReloadTimeout()
        const actionFiles = await storage.loadActionFiles(this.currentProject, config.actionsFolder)
        actionService.reloadFromFiles(actionFiles, changedPath)
        this.actionReloadChangedPath = null
    }

    private async commitFiles(request: Parameters<StorageService['commit']>[0]) {
        const { config, storage } = this.requireDependencies()
        const updatedFiles = await storage.commit(request)

        if (updatedFiles.length > 0) {
            this.currentFiles = mergeFiles(this.currentFiles, updatedFiles)
            this.refreshSnapshot()
        }

        if (this.currentProject && config.pushMode === 'auto') await storage.push(this.currentProject)
        if (config.pushMode === 'manual') this.dispatchChanged()
    }

    private async commitAndMergeFiles(request: Parameters<StorageService['commit']>[0], fallbackFiles: MarkdownFile[] = []) {
        const { storage } = this.requireDependencies()
        const updatedFiles = await storage.commit(request)
        const committedFiles = updatedFiles.length > 0 ? updatedFiles : fallbackFiles
        if (committedFiles.length === 0) return updatedFiles

        this.currentFiles = mergeFiles(this.currentFiles, committedFiles)
        this.refreshSnapshot()

        return updatedFiles
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
