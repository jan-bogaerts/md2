import { cardContext, type ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import {
    type AgentConversation,
    type AgentConversationError,
    type AgentRunEvent,
    type MarkdownFile,
    type ProjectReference,
    type ProjectSnapshot,
    type StorageService,
} from '../data/data_types'
import { actionRunner } from './action_runner'
import { actionService } from './action_service'
import { agentConversationService, loadAgentConversation } from './agent_conversation_service'
import { mapWithConcurrency } from './concurrency'
import { markdownParsingService } from './markdown_parsing_service'
import { type DataServiceContext } from './data_service_context'

const AGENT_CONVERSATION_LOAD_CONCURRENCY = 8
const ON_STATE_ACTION_ERROR_PATH_PREFIX = 'onState'

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

function isOnStateActionError(error: AgentConversationError) {
    return error.path.startsWith(`${ON_STATE_ACTION_ERROR_PATH_PREFIX}:`)
}

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

export class AgentIntegration {
    private readonly context: DataServiceContext
    private readonly saveFile: (file: MarkdownFile) => MarkdownFile
    private scheduledRunCleanup: (() => void) | null = null

    constructor(
        context: DataServiceContext,
        saveFile: (file: MarkdownFile) => MarkdownFile,
    ) {
        this.context = context
        this.saveFile = saveFile
    }

    reset() {
        this.stopScheduledRunWatch()
        this.context.increaseAgentConversationLoadToken()
        this.context.resetAgentConversations()
    }

    startScheduledRunWatch() {
        this.stopScheduledRunWatch()
        const bridge = getElectronActionBridge()
        if (!bridge?.onScheduledActionRun) return

        this.scheduledRunCleanup = bridge.onScheduledActionRun((event) => this.handleScheduledRunEvent(event))
    }

    stopScheduledRunWatch() {
        if (!this.scheduledRunCleanup) return

        this.scheduledRunCleanup()
        this.scheduledRunCleanup = null
    }

    async continueAgentConversation(cardPath: string, sourcePath: string) {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot continue an agent before a project is open')

        const result = await agentConversationService.continueConversation(
            storage,
            currentProject,
            { cardPath, sourcePath },
            (event) => this.recordAgentRunEvent(cardPath, event),
        )
        this.upsertAgentConversation(cardPath, result.conversation)

        return this.linkAgentConversation(cardPath, result.conversation, result.reference)
    }

    async startAgentConversation(cardPath: string, prompt: string) {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot start an agent before a project is open')

        const result = await agentConversationService.startConversation(
            storage,
            currentProject,
            { cardPath, prompt, title: `Agent ${cardPath}` },
            (event) => this.handleAgentRunEvent(cardPath, event),
        )
        this.upsertAgentConversation(cardPath, result.conversation)

        return this.linkAgentConversation(cardPath, result.conversation, result.reference)
    }

    async sendAgentInput(runId: string, input: string) {
        const { storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot send agent input before a project is open')
        if (!storage.sendAgentInput) throw new Error('Sending agent input requires an Electron agent bridge')

        await storage.sendAgentInput(currentProject, runId, input)
    }

    recordAgentRunEvent(cardPath: string, event: AgentRunEvent) {
        this.upsertAgentConversation(cardPath, event.conversation)
    }

    linkAgentConversation(cardPath: string, conversation: AgentConversation, reference: string) {
        const { config } = this.context.requireDependencies()
        const existingFile = this.context.requireFile(cardPath)
        const card = markdownParsingService.parseCard(existingFile, config.workingFolder)
        const nextReferences = [...new Set([...card.header.agentLogReferences, reference])]
        this.upsertAgentConversation(cardPath, conversation)

        return this.saveFile({
            content: markdownParsingService.setAgentLogReferences(existingFile.content, nextReferences),
            path: cardPath,
            sha: existingFile.sha,
        })
    }

    loadAgentConversationsInBackground(snapshot: ProjectSnapshot, project: ProjectReference, projectLoadToken: number) {
        const cards = [...snapshot.activeCards, ...snapshot.backgroundCards]
        const agentConversationLoadToken = this.context.increaseAgentConversationLoadToken()
        void this.resolveAndAttachAgentConversations(cards, project, projectLoadToken, agentConversationLoadToken)
    }

    attachAgentConversations(cards: Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>) {
        const errorsByCardPath = this.context.getErrorsByCardPath()
        const conversationsByCardPath = this.context.getConversationsByCardPath()

        return {
            activeCards: cards.activeCards.map((card) => ({
                ...card,
                agentConversationErrors: errorsByCardPath.get(card.path) ?? [],
                agentConversations: conversationsByCardPath.get(card.path) ?? [],
            })),
            backgroundCards: cards.backgroundCards.map((card) => ({
                ...card,
                agentConversationErrors: errorsByCardPath.get(card.path) ?? [],
                agentConversations: conversationsByCardPath.get(card.path) ?? [],
            })),
        }
    }

    triggerStateActions(cardPath: string, state: string) {
        const { config } = this.context.requireDependencies()
        const card = this.context.getCurrentSnapshot()?.activeCards.find((currentCard) => currentCard.path === cardPath)
        if (!card) return

        const context = cardContext(card, config.cardTypes)
        const actions = actionService.getActionsForStateTrigger(state, context)
        for (const action of actions) {
            void this.runStateAction(action, context, cardPath)
        }
    }

    private async resolveAndAttachAgentConversations(
        cards: ProjectSnapshot['activeCards'],
        project: ProjectReference,
        projectLoadToken: number,
        agentConversationLoadToken: number,
    ) {
        const { storage } = this.context.requireDependencies()
        const resolved = await resolveAgentConversations(cards, project, storage)
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return
        if (this.context.getAgentConversationLoadToken() !== agentConversationLoadToken) return

        this.context.setConversationsByCardPath(resolved.conversationsByCardPath)
        this.context.setErrorsByCardPath(this.mergeResolvedAgentErrors(resolved.errorsByCardPath))
        this.context.refreshSnapshot()
    }

    private shouldApplyProjectLoad(project: ProjectReference, projectLoadToken: number) {
        const currentProject = this.context.getCurrentProject()

        return this.context.getProjectLoadToken() === projectLoadToken
            && currentProject?.branch === project.branch
            && currentProject.id === project.id
            && currentProject.owner === project.owner
            && currentProject.repository === project.repository
            && currentProject.rootPath === project.rootPath
    }

    private mergeResolvedAgentErrors(resolvedErrors: Map<string, AgentConversationError[]>) {
        const errors = new Map(resolvedErrors)

        for (const [cardPath, existingErrors] of this.context.getErrorsByCardPath()) {
            const onStateErrors = existingErrors.filter(isOnStateActionError)
            if (onStateErrors.length === 0) continue

            errors.set(cardPath, [...(errors.get(cardPath) ?? []), ...onStateErrors])
        }

        return errors
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
        const errorsByCardPath = this.context.getErrorsByCardPath()
        errorsByCardPath.set(cardPath, [...(errorsByCardPath.get(cardPath) ?? []), { message, path }])
        this.context.refreshSnapshot()
    }

    private handleAgentRunEvent(cardPath: string, event: AgentRunEvent) {
        this.upsertAgentConversation(cardPath, event.conversation)
    }

    private handleScheduledRunEvent(event: AgentRunEvent) {
        agentConversationService.observeRunEvent(event, event.conversation.title)
        if (!event.conversation.cardPath) {
            this.context.dispatchChanged()
            return
        }

        this.recordAgentRunEvent(event.conversation.cardPath, event)
    }

    private upsertAgentConversation(cardPath: string, conversation: AgentConversation) {
        const conversationsByCardPath = this.context.getConversationsByCardPath()
        const conversations = conversationsByCardPath.get(cardPath) ?? []
        const nextConversations = conversations.some((current) => current.id === conversation.id)
            ? conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...conversations, conversation]
        conversationsByCardPath.set(cardPath, nextConversations)
        this.context.refreshSnapshot()
    }
}
