import type { AgentConversation } from '../../data/data_types'
import { register } from '.././service_injector'

const STORAGE_KEY = 'md2.agentAcknowledgements'

function completedTimestamp(conversation: AgentConversation) {
    if (conversation.status === 'running' || !conversation.completedAt) return null

    return conversation.completedAt
}

function latestCompletedTimestamp(conversations: AgentConversation[]) {
    return conversations.map(completedTimestamp).filter((timestamp): timestamp is string => !!timestamp).sort().at(-1) ?? null
}

function readAcknowledgements() {
    const content = window.localStorage.getItem(STORAGE_KEY)
    if (!content) return {}

    const value: unknown = JSON.parse(content)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid agent acknowledgement storage')

    return value as Record<string, string>
}

function cardKey(projectId: string, cardPath: string) {
    return `${projectId}:${cardPath}`
}

export function hasUnseenAgentResult(projectId: string, cardPath: string, conversations: AgentConversation[]) {
    const timestamp = latestCompletedTimestamp(conversations)
    if (!timestamp) return false

    const acknowledgedAt = readAcknowledgements()[cardKey(projectId, cardPath)]

    return !acknowledgedAt || timestamp > acknowledgedAt
}

export class AgentAcknowledgementService extends EventTarget {
    constructor() {
        super()
        register('agentAcknowledgementService', this)
    }

    acknowledge(projectId: string, cardPath: string, conversations: AgentConversation[]) {
        const timestamp = latestCompletedTimestamp(conversations)
        if (!timestamp) return

        const values = readAcknowledgements()
        const key = cardKey(projectId, cardPath)
        if (values[key] && values[key] >= timestamp) return

        values[key] = timestamp
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
        this.dispatchEvent(new CustomEvent('changed'))
    }

}

export const agentAcknowledgementService = new AgentAcknowledgementService()
