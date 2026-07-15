import { cardContext, fileContext, type ActionContext } from '../data/action_context'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../data/action_types'
import type { ActionExecutionEvent } from '../data/action_run_types'
import {
    type AgentConversation,
    type AgentConversationError,
    type AgentRunEvent,
    type MarkdownFile,
    type ProjectReference,
    type ProjectSnapshot,
    type StorageService,
} from '../data/data_types'
import { actionService } from './action_service'
import { actionExecutionService } from './action_execution_service'
import { agentConversationService, loadAgentConversation } from './agent_conversation_service'
import { recordActionEventProcessingError, runElectronAction } from './electron_action_runner'
import { mapWithConcurrency } from './concurrency'
import { type RequiredDataServiceDependencies } from './data_service_context'
import { markdownParsingService } from './markdown_parsing_service'
import { telemetryService } from './telemetry_service'

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

export interface AgentIntegrationDeps {
    beginAgentConversationLoad(): number
    dispatchChanged(): void
    isCurrentAgentConversationLoad(agentConversationLoadToken: number): boolean
    isCurrentLoad(project: ProjectReference, projectLoadToken: number): boolean
    project(): ProjectReference | null
    refreshSnapshot(workingFolder: string): void
    requireDependencies(): RequiredDataServiceDependencies
    requireFile(path: string): MarkdownFile
    snapshot(): ProjectSnapshot | null
}

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
    private actionRunIds: Map<string, string> = new Map()
    private conversationsByCardPath: Map<string, AgentConversation[]> = new Map()
    private readonly dependencies: AgentIntegrationDeps
    private errorsByCardPath: Map<string, AgentConversationError[]> = new Map()
    private readonly saveFile: (file: MarkdownFile) => MarkdownFile
    private scheduledRunCleanup: (() => void) | null = null

    constructor(
        dependencies: AgentIntegrationDeps,
        saveFile: (file: MarkdownFile) => MarkdownFile,
    ) {
        this.dependencies = dependencies
        this.saveFile = saveFile
    }

    reset() {
        this.stopScheduledRunWatch()
        this.resetLoadedConversations()
    }

    resetLoadedConversations() {
        this.dependencies.beginAgentConversationLoad()
        this.conversationsByCardPath = new Map()
        this.errorsByCardPath = new Map()
    }

    startScheduledRunWatch() {
        this.stopScheduledRunWatch()
        this.scheduledRunCleanup = actionExecutionService.subscribeEvents((event) => {
            try {
                this.handleActionExecutionEvent(event)
            } catch (error) {
                recordActionEventProcessingError(event.executionId, error)
                telemetryService.captureError(error)
            }
        })
    }

    stopScheduledRunWatch() {
        if (!this.scheduledRunCleanup) return

        this.scheduledRunCleanup()
        this.scheduledRunCleanup = null
        for (const runningAgentId of this.actionRunIds.values()) agentConversationService.finishRunningAgent(runningAgentId)
        this.actionRunIds.clear()
    }

    async continueAgentConversation(cardPath: string, sourcePath: string) {
        const { config } = this.dependencies.requireDependencies()
        const snapshot = this.dependencies.snapshot()
        const card = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
            .find((candidate) => candidate.path === cardPath)
        if (!card) throw new Error(`Cannot continue agent for unknown card: ${cardPath}`)
        const conversation = (this.conversationsByCardPath.get(cardPath) ?? []).find(({ path }) => path === sourcePath)
        if (!conversation) throw new Error(`Unknown agent conversation: ${sourcePath}`)
        const action = conversation.actionId
            ? actionService.getActions().find(({ id }) => id === conversation.actionId)
            : BUILTIN_CUSTOM_PROMPT
        if (!action) throw new Error(`Unknown originating action: ${conversation.actionId}`)

        return runElectronAction(action, fileContext(card, config.cardTypes), { continueFrom: sourcePath })
    }

    recordAgentRunEvent(cardPath: string, event: AgentRunEvent) {
        this.upsertAgentConversation(cardPath, event.conversation)
    }

    linkAgentConversation(cardPath: string, conversation: AgentConversation, reference: string) {
        const { config } = this.dependencies.requireDependencies()
        const existingFile = this.dependencies.requireFile(cardPath)
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
        const agentConversationLoadToken = this.dependencies.beginAgentConversationLoad()
        void this.resolveAndAttachAgentConversations(cards, project, projectLoadToken, agentConversationLoadToken)
    }

    attachAgentConversations(cards: Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>) {
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

    triggerStateActions(cardPath: string, state: string) {
        const { config } = this.dependencies.requireDependencies()
        const card = this.dependencies.snapshot()?.activeCards.find((currentCard) => currentCard.path === cardPath)
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
        const { config, storage } = this.dependencies.requireDependencies()
        const resolved = await resolveAgentConversations(cards, project, storage)
        if (!this.shouldApplyProjectLoad(project, projectLoadToken)) return
        if (!this.dependencies.isCurrentAgentConversationLoad(agentConversationLoadToken)) return

        this.conversationsByCardPath = resolved.conversationsByCardPath
        this.errorsByCardPath = this.mergeResolvedAgentErrors(resolved.errorsByCardPath)
        this.dependencies.refreshSnapshot(config.workingFolder)
    }

    private shouldApplyProjectLoad(project: ProjectReference, projectLoadToken: number) {
        return this.dependencies.isCurrentLoad(project, projectLoadToken)
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

    private async runStateAction(action: ActionDefinition, context: ActionContext, cardPath: string) {
        try {
            const result = await runElectronAction(action, context)
            if (result.status === 'completed') return

            const failedLog = result.logs.find((log) => log.status === 'failed')
            this.recordCardAgentError(cardPath, action.name, failedLog?.message ?? `${action.label} failed`)
        } catch (error) {
            this.recordCardAgentError(cardPath, action.name, error instanceof Error ? error.message : `${action.label} failed`)
        }
    }

    private recordCardAgentError(cardPath: string, actionName: string, message: string) {
        const path = `${ON_STATE_ACTION_ERROR_PATH_PREFIX}:${actionName}`
        const { config } = this.dependencies.requireDependencies()
        this.errorsByCardPath.set(cardPath, [...(this.errorsByCardPath.get(cardPath) ?? []), { message, path }])
        this.dependencies.refreshSnapshot(config.workingFolder)
    }

    private handleActionExecutionEvent(event: ActionExecutionEvent) {
        if (event.type === 'execution') this.handleActionExecutionStatus(event)
        if (event.type === 'action') this.linkActionConversation(event)
        if (!event.agentEvent) return

        if (!event.agentEvent.conversation.cardPath) {
            this.dependencies.dispatchChanged()
            return
        }

        this.recordAgentRunEvent(event.agentEvent.conversation.cardPath, event.agentEvent)
    }

    private linkActionConversation(event: ActionExecutionEvent) {
        if (event.status === 'running' || !event.conversation?.cardPath || !event.reference) return

        const reference = event.executionWorktree === null || event.executionWorktree === undefined
            ? event.reference
            : `worktree:${event.executionWorktree}:${event.reference}`
        this.linkAgentConversation(event.conversation.cardPath, event.conversation, reference)
    }

    private handleActionExecutionStatus(event: ActionExecutionEvent) {
        if (event.status === 'running' && !this.actionRunIds.has(event.executionId)) {
            this.actionRunIds.set(event.executionId, agentConversationService.startRunningAgent(`Action ${event.rootActionId}`))
            return
        }
        if (event.status === 'running') return

        const runningAgentId = this.actionRunIds.get(event.executionId)
        if (!runningAgentId) return

        agentConversationService.finishRunningAgent(runningAgentId)
        this.actionRunIds.delete(event.executionId)
    }

    private upsertAgentConversation(cardPath: string, conversation: AgentConversation) {
        const { config } = this.dependencies.requireDependencies()
        const conversations = this.conversationsByCardPath.get(cardPath) ?? []
        const nextConversations = conversations.some((current) => current.id === conversation.id)
            ? conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...conversations, conversation]
        this.conversationsByCardPath.set(cardPath, nextConversations)
        this.dependencies.refreshSnapshot(config.workingFolder)
    }

}
