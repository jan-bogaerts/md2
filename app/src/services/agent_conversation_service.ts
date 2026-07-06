import type {
    AgentConversation,
    AgentConversationEvent,
    AgentConversationMessage,
    AgentConversationStatus,
    ContinueAgentConversationRequest,
    ContinueAgentConversationResult,
    ProjectReference,
    RunningAgent,
    AgentRunEvent,
    StartAgentConversationRequest,
    StartAgentConversationResult,
    StorageService,
} from '../data/data_types'
import { register } from './service_injector'

const CONTINUE_INPUT = 'continue'
const VALID_STATUSES = new Set<AgentConversationStatus>(['completed', 'failed', 'running'])
const VALID_ROLES = new Set(['agent', 'stderr', 'stdout', 'system', 'user'])

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
        content: requireText(message.content, 'message.content'),
        id: requireString(message.id, 'message.id'),
        role: role as AgentConversationMessage['role'],
        timestamp: requireString(message.timestamp, 'message.timestamp'),
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

export function parseAgentConversationLog(content: string, referencePath: string): AgentConversation {
    const payload = requireRecord(JSON.parse(content), 'root')
    const messages = requireArray(payload.messages, 'messages').map(normalizeMessage)
    const events = payload.events === undefined ? [] : requireArray(payload.events, 'events').map(normalizeEvent)

    return {
        cardPath: requireString(payload.cardPath, 'cardPath'),
        completedAt: nullableString(payload.completedAt, 'completedAt'),
        events,
        id: requireString(payload.id, 'id'),
        messages,
        path: referencePath,
        startedAt: requireString(payload.startedAt, 'startedAt'),
        status: requireStatus(payload.status),
        title: typeof payload.title === 'string' && payload.title.length > 0 ? payload.title : requireString(payload.id, 'id'),
    }
}

export async function loadAgentConversation(storage: StorageService, project: ProjectReference, path: string) {
    if (!storage.loadAgentConversation) throw new Error('Agent log loading requires a storage bridge')

    return storage.loadAgentConversation(project, path)
}

export class AgentConversationService extends EventTarget {
    private runningAgents: RunningAgent[]

    constructor() {
        super()
        this.runningAgents = []
        register('agentConversationService', this)
    }

    getRunningAgents() {
        return this.runningAgents
    }

    async continueConversation(
        storage: StorageService,
        project: ProjectReference,
        request: Omit<ContinueAgentConversationRequest, 'input'>,
    ): Promise<ContinueAgentConversationResult> {
        if (!storage.continueAgentConversation) throw new Error('Continuing agent conversations requires an Electron agent bridge')

        const runningAgent = { id: `${request.cardPath}:${request.sourcePath}:${Date.now()}`, label: `Continue ${request.cardPath}` }
        this.setRunningAgents([...this.runningAgents, runningAgent])

        try {
            return await storage.continueAgentConversation(project, { ...request, input: CONTINUE_INPUT })
        } finally {
            this.setRunningAgents(this.runningAgents.filter((agent) => agent.id !== runningAgent.id))
        }
    }

    async startConversation(
        storage: StorageService,
        project: ProjectReference,
        request: StartAgentConversationRequest,
        onEvent: (event: AgentRunEvent) => void,
    ): Promise<StartAgentConversationResult> {
        if (!storage.startAgentConversation) throw new Error('Starting agent conversations requires an Electron agent bridge')

        const result = await storage.startAgentConversation(project, request, (event) => {
            onEvent(event)
            if (event.type === 'closed') this.removeRunningAgent(event.runId)
        })
        const runningAgent = { id: result.runId, label: `Agent ${request.cardPath}` }
        this.setRunningAgents([...this.runningAgents, runningAgent])

        return result
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
