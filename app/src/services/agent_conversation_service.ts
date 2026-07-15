import type {
    AgentConversation,
    AgentConversationEvent,
    AgentConversationMessage,
    AgentConversationStatus,
    ProjectReference,
    RunningAgent,
    AgentRunEvent,
    StorageService,
} from '../data/data_types'
import { register } from './service_injector'

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
        actionId: nullableString(payload.actionId, 'actionId'),
        cardPath: requireString(payload.cardPath, 'cardPath'),
        completedAt: nullableString(payload.completedAt, 'completedAt'),
        continuedFrom: nullableString(payload.continuedFrom, 'continuedFrom'),
        events,
        id: requireString(payload.id, 'id'),
        messages,
        nativeSessionId: nullableString(payload.nativeSessionId, 'nativeSessionId'),
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
