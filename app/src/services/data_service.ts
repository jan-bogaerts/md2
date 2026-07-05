import { CommitBatcher } from '../data/commit_batcher'
import { cardContext } from '../data/action_context'
import { createCardFile } from '../data/card_naming'
import { computeMove } from '../data/card_ordering'
import {
    type AgentConversation,
    type AgentConversationError,
    type CardDraft,
    type MarkdownFile,
    type ProjectConfig,
    type ProjectReference,
    type ProjectWatchEvent,
    type ProjectSnapshot,
    type RunningAgent,
    type StorageService,
} from '../data/data_types'
import { actionService } from './action_service'
import { actionRunner } from './action_runner'
import { agentConversationService, loadAgentConversation } from './agent_conversation_service'
import { configService } from './config_service'
import { markdownParsingService } from './markdown_parsing_service'
import { register } from './service_injector'

const ACTION_RELOAD_DEBOUNCE_MS = 150
const JSON_EXTENSION = '.json'

function isActionDefinitionPath(path: string, actionsFolder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedActionsFolder = actionsFolder.replace(/\\/gu, '/').replace(/\/$/u, '')

    return normalizedPath.startsWith(`${normalizedActionsFolder}/`) && normalizedPath.toLowerCase().endsWith(JSON_EXTENSION)
}

interface DataServiceDependencies {
    storage: StorageService
}

export interface DataServiceState {
    project: ProjectReference | null
    runningAgents: RunningAgent[]
    snapshot: ProjectSnapshot | null
}

interface ResolvedAgentConversations {
    conversationsByCardPath: Map<string, AgentConversation[]>
    errorsByCardPath: Map<string, AgentConversationError[]>
}

export class DataService extends EventTarget {
    private actionReloadChangedPath: string | null
    private actionReloadTimeout: number | null
    private commitBatcher: CommitBatcher | null
    private conversationsByCardPath: Map<string, AgentConversation[]>
    private currentFiles
    private currentProject: ProjectReference | null
    private currentSnapshot: ProjectSnapshot | null
    private errorsByCardPath: Map<string, AgentConversationError[]>
    private storage: StorageService | null
    private watchCleanup: (() => void) | null

    constructor() {
        super()
        this.actionReloadChangedPath = null
        this.actionReloadTimeout = null
        this.commitBatcher = null
        this.conversationsByCardPath = new Map()
        this.currentFiles = [] as MarkdownFile[]
        this.currentProject = null
        this.currentSnapshot = null
        this.errorsByCardPath = new Map()
        this.storage = null
        this.watchCleanup = null
        agentConversationService.subscribe(() => this.dispatchChanged())
        register('dataService', this)
    }

    init(dependencies: DataServiceDependencies) {
        this.stopProjectWatch()
        this.clearActionReloadTimeout()
        this.actionReloadChangedPath = null
        this.conversationsByCardPath = new Map()
        this.currentFiles = []
        this.currentProject = null
        this.currentSnapshot = null
        this.errorsByCardPath = new Map()
        this.storage = dependencies.storage
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
        return { project: this.currentProject, runningAgents: agentConversationService.getRunningAgents(), snapshot: this.currentSnapshot }
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
        const actionFiles = await storage.loadActionFiles(project, config.actionsFolder)
        actionService.loadFromFiles(actionFiles)
        const projectFiles = await storage.loadProject(project, config.workingFolder)
        this.currentFiles = projectFiles.files
        this.currentSnapshot = await this.createSnapshot(projectFiles.files, projectFiles.workingFolder)
        this.startProjectWatch()
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

    async continueAgentConversation(cardPath: string, sourcePath: string) {
        const { storage } = this.requireDependencies()
        if (!this.currentProject) throw new Error('Cannot continue an agent before a project is open')

        const existingFile = this.requireFile(cardPath)
        const result = await agentConversationService.continueConversation(storage, this.currentProject, { cardPath, sourcePath })
        const card = markdownParsingService.parseCard(existingFile, this.requireDependencies().config.workingFolder)
        const nextReferences = [...new Set([...card.header.agentLogReferences, result.reference])]
        const conversations = this.conversationsByCardPath.get(cardPath) ?? []
        this.conversationsByCardPath.set(cardPath, [...conversations, result.conversation])

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

        await storage.commit({
            branch: this.currentProject.branch,
            files: [file],
            message,
        })

        if (config.pushMode === 'auto') await storage.push(this.currentProject)

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
        const cards = this.attachAgentConversations(markdownParsingService.splitCards(this.currentFiles, config.workingFolder))
        this.currentSnapshot = { ...cards, workingFolder: config.workingFolder }
        this.dispatchChanged()
    }

    private async createSnapshot(files: MarkdownFile[], workingFolder: string): Promise<ProjectSnapshot> {
        const cards = markdownParsingService.splitCards(files, workingFolder)
        const resolved = await this.resolveAgentConversations([...cards.activeCards, ...cards.backgroundCards])
        this.conversationsByCardPath = resolved.conversationsByCardPath
        this.errorsByCardPath = resolved.errorsByCardPath

        return { ...this.attachAgentConversations(cards), workingFolder }
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

    private async resolveAgentConversations(cards: ProjectSnapshot['activeCards']): Promise<ResolvedAgentConversations> {
        const conversationsByCardPath = new Map<string, AgentConversation[]>()
        const errorsByCardPath = new Map<string, AgentConversationError[]>()
        const { storage } = this.requireDependencies()
        if (!this.currentProject) return { conversationsByCardPath, errorsByCardPath }

        for (const card of cards) {
            for (const reference of card.header.agentLogReferences) {
                try {
                    const conversation = await loadAgentConversation(storage, this.currentProject, reference)
                    if (conversation.cardPath !== card.path) throw new Error(`Agent log belongs to ${conversation.cardPath}, not ${card.path}`)

                    conversationsByCardPath.set(card.path, [...(conversationsByCardPath.get(card.path) ?? []), conversation])
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Agent log failed to load'
                    errorsByCardPath.set(card.path, [...(errorsByCardPath.get(card.path) ?? []), { message, path: reference }])
                }
            }
        }

        return { conversationsByCardPath, errorsByCardPath }
    }

    private triggerStateActions(cardPath: string, state: string) {
        const { config } = this.requireDependencies()
        const card = this.currentSnapshot?.activeCards.find((currentCard) => currentCard.path === cardPath)
        if (!card) return

        const context = cardContext(card, config.cardTypes)
        const actions = actionService.getActionsForStateTrigger(state, context)
        for (const action of actions) {
            void actionRunner.run(action, context)
        }
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
