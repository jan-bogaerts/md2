import type {
    AgentConversation,
    AgentConversationEvent,
    AgentConversationMessage,
    AgentProviderSession,
    AgentConversationStatus,
    ProjectReference,
    RunningAgent,
    AgentRunEvent,
    AgentTokenUsage,
    StorageService,
} from '../../data/data_types'
import { register } from '.././service_injector'
import { projectLogFolder } from '../../../../shared/log_paths.mjs'

const VALID_STATUSES = new Set<AgentConversationStatus>(['cancelled', 'completed', 'failed', 'running'])
const VALID_ROLES = new Set(['agent', 'assistant', 'stderr', 'stdout', 'system', 'user'])

type Listener = () => void

function requireRecord(value: unknown, fieldName: string) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed agent log: ${fieldName} must be an object`)

    return value as Record<string, unknown>
}

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed agent log: missing ${fieldName}`)

    return value
}

function requireText(value: unknown, fieldName: string) {
    if (typeof value !== 'string') throw new Error(`Malformed agent log: missing ${fieldName}`)

    return value
}

function nullableString(value: unknown, fieldName: string) {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed agent log: invalid ${fieldName}`)

    return value
}

function requireStatus(value: unknown) {
    const status = requireString(value, 'status') as AgentConversationStatus
    if (!VALID_STATUSES.has(status)) throw new Error(`Malformed agent log: invalid status ${status}`)

    return status
}

function requireArray(value: unknown, fieldName: string) {
    if (!Array.isArray(value)) throw new Error(`Malformed agent log: ${fieldName} must be an array`)

    return value
}

function normalizeMessage(value: unknown): AgentConversationMessage {
    const message = requireRecord(value, 'message')
    const role = requireString(message.role, 'message.role')
    if (!VALID_ROLES.has(role)) throw new Error(`Malformed agent log: invalid message role ${role}`)

    return {
        ...(message.agent === undefined ? {} : { agent: requireString(message.agent, 'message.agent') }),
        content: requireText(message.content, 'message.content'),
        id: requireString(message.id, 'message.id'),
        role: role as AgentConversationMessage['role'],
        timestamp: requireString(message.timestamp, 'message.timestamp'),
    }
}

function normalizeProviderSession(value: unknown): AgentProviderSession {
    const session = requireRecord(value, 'provider session')

    return {
        agent: requireString(session.agent, 'providerSession.agent'),
        conversationId: requireString(session.conversationId, 'providerSession.conversationId'),
        createdAt: requireString(session.createdAt, 'providerSession.createdAt'),
        lastUsedAt: requireString(session.lastUsedAt, 'providerSession.lastUsedAt'),
        synchronizedThroughMessageId: requireString(session.synchronizedThroughMessageId, 'providerSession.synchronizedThroughMessageId'),
    }
}

function normalizeEvent(value: unknown): AgentConversationEvent {
    const event = requireRecord(value, 'event')

    return {
        content: requireText(event.content, 'event.content'),
        id: requireString(event.id, 'event.id'),
        timestamp: requireString(event.timestamp, 'event.timestamp'),
        type: requireString(event.type, 'event.type'),
    }
}

function usageNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeUsage(value: unknown): AgentTokenUsage | undefined {
    if (value === undefined) return undefined
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined

    const usage = value as Record<string, unknown>
    const normalized = {
        cachedInputTokens: usageNumber(usage.cachedInputTokens),
        inputTokens: usageNumber(usage.inputTokens),
        outputTokens: usageNumber(usage.outputTokens),
        reasoningTokens: usageNumber(usage.reasoningTokens),
    }
    const totalTokens = normalized.inputTokens + normalized.cachedInputTokens + normalized.outputTokens + normalized.reasoningTokens

    return {
        ...normalized,
        ...(typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd) && usage.costUsd >= 0 ? { costUsd: usage.costUsd } : {}),
        totalTokens,
    }
}

export function parseAgentConversationLog(content: string, referencePath: string): AgentConversation {
    const payload = requireRecord(JSON.parse(content), 'root')
    const messages = requireArray(payload.messages, 'messages').map(normalizeMessage)
    const events = payload.events === undefined ? [] : requireArray(payload.events, 'events').map(normalizeEvent)
    const providerSessions = payload.providerSessions === undefined
        ? []
        : requireArray(payload.providerSessions, 'providerSessions').map(normalizeProviderSession)
    const hasExplicitTitle = typeof payload.title === 'string' && payload.title.trim().length > 0
    const usage = normalizeUsage(payload.usage)

    return {
        actionId: nullableString(payload.actionId, 'actionId'),
        cardPath: nullableString(payload.cardPath, 'cardPath'),
        completedAt: nullableString(payload.completedAt, 'completedAt'),
        events,
        hasExplicitTitle,
        id: requireString(payload.id, 'id'),
        messages,
        path: referencePath,
        providerSessions,
        startedAt: requireString(payload.startedAt, 'startedAt'),
        status: requireStatus(payload.status),
        title: hasExplicitTitle ? payload.title as string : requireString(payload.id, 'id'),
        ...(usage ? { usage } : {}),
    }
}

/** Discover persisted agent-log references through any storage implementation. */
export async function listAgentConversationReferences(storage: StorageService, project: ProjectReference, projectFolder: string) {
    const paths = await storage.listRepositoryFiles(project)
    const logFolderPrefix = `${projectLogFolder(projectFolder)}/`

    return paths.filter((path) => {
        const normalizedPath = path.replace(/\\/gu, '/')
        const fileName = normalizedPath.slice(logFolderPrefix.length)

        return normalizedPath.startsWith(logFolderPrefix)
            && fileName.startsWith('conversation__')
            && fileName.toLowerCase().endsWith('.json')
    })
}

export async function loadAgentConversation(storage: StorageService, project: ProjectReference, path: string) {
    if (!storage.loadAgentConversation) throw new Error('Agent log loading requires a storage bridge')

    return storage.loadAgentConversation(project, path)
}

export class AgentConversationService extends EventTarget {
    private nextRunningAgentId: number
    private runningAgents: RunningAgent[]

    constructor() {
        super()
        this.nextRunningAgentId = 0
        this.runningAgents = []
        register('agentConversationService', this)
    }

    getRunningAgents() {
        return this.runningAgents
    }

    startRunningAgent(label: string) {
        this.nextRunningAgentId += 1
        const id = `action-${this.nextRunningAgentId}`
        this.setRunningAgents([...this.runningAgents, { id, label }])

        return id
    }

    finishRunningAgent(id: string) {
        this.removeRunningAgent(id)
    }

    observeRunEvent(event: AgentRunEvent, label: string) {
        if (event.type === 'started') {
            if (!this.runningAgents.some((agent) => agent.id === event.runId)) {
                this.setRunningAgents([...this.runningAgents, { id: event.runId, label }])
            }

            return
        }

        if (event.type === 'closed' || event.type === 'error') this.removeRunningAgent(event.runId)
    }

    subscribe(listener: Listener) {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    private setRunningAgents(runningAgents: RunningAgent[]) {
        this.runningAgents = runningAgents
        this.dispatchEvent(new CustomEvent('changed'))
    }

    private removeRunningAgent(runId: string) {
        this.setRunningAgents(this.runningAgents.filter((agent) => agent.id !== runId))
    }
}

export const agentConversationService = new AgentConversationService()
