import type { AgentConversation } from '../../data/data_types'
import { register } from '.././service_injector'

const STORAGE_KEY = 'md2.agentAcknowledgements'

type Listener = () => void

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

export function agentAcknowledgementCheckpoint(projectId: string, cardPath: string) {
    return readAcknowledgements()[cardKey(projectId, cardPath)] ?? null
}

/** Returns newest completed result for one action beyond card acknowledgement checkpoint. */
export function latestUnseenAgentResult(
    projectId: string,
    cardPath: string,
    conversations: AgentConversation[],
    actionId: string,
) {
    const acknowledgedAt = readAcknowledgements()[cardKey(projectId, cardPath)]

    return conversations
        .filter((conversation) => conversation.actionId === actionId)
        .filter((conversation) => {
            const timestamp = completedTimestamp(conversation)

            return !!timestamp && (!acknowledgedAt || timestamp > acknowledgedAt)
        })
        .sort((left, right) => (completedTimestamp(right) ?? '').localeCompare(completedTimestamp(left) ?? ''))[0] ?? null
}

export function hasUnseenAgentResult(projectId: string, cardPath: string, conversations: AgentConversation[]) {
    const timestamp = latestCompletedTimestamp(conversations)
    if (!timestamp) return false

    const acknowledgedAt = readAcknowledgements()[cardKey(projectId, cardPath)]

    return !acknowledgedAt || timestamp > acknowledgedAt
}

export class AgentAcknowledgementService extends EventTarget {
    private readonly cardListeners = new Map<string, Set<Listener>>()

    constructor() {
        super()
        register('agentAcknowledgementService', this)
    }

    subscribeCard(projectId: string, cardPath: string, listener: Listener) {
        const key = cardKey(projectId, cardPath)
        const listeners = this.cardListeners.get(key) ?? new Set<Listener>()
        listeners.add(listener)
        this.cardListeners.set(key, listeners)

        return () => {
            listeners.delete(listener)
            if (listeners.size === 0) this.cardListeners.delete(key)
        }
    }

    /** Keeps acknowledgements attached to a card after its file was renamed. */
    renameCardPath(projectId: string, fromPath: string, toPath: string) {
        const values = readAcknowledgements()
        const fromKey = cardKey(projectId, fromPath)
        const acknowledgedAt = values[fromKey]
        if (!acknowledgedAt) return

        delete values[fromKey]
        const toKey = cardKey(projectId, toPath)
        values[toKey] = acknowledgedAt
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
        this.notifyCard(fromKey)
        this.notifyCard(toKey)
    }

    acknowledge(projectId: string, cardPath: string, conversations: AgentConversation[]) {
        const timestamp = latestCompletedTimestamp(conversations)
        if (!timestamp) return

        const values = readAcknowledgements()
        const key = cardKey(projectId, cardPath)
        if (values[key] && values[key] >= timestamp) return

        values[key] = timestamp
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
        this.notifyCard(key)
    }

    private notifyCard(key: string) {
        for (const listener of this.cardListeners.get(key) ?? []) listener()
    }
}

export const agentAcknowledgementService = new AgentAcknowledgementService()
