import type { ProjectCard } from '../../data/data_types'
import { hasUnseenAgentResult } from './agent_acknowledgement_service'

export type CardAgentState = 'idle' | 'running' | 'unseen result' | 'waiting for input'

function isConversationWaiting(card: ProjectCard) {
    return card.agentConversations.some((conversation) => {
        if (conversation.status === 'waitingForInput') return true
        if (conversation.status !== 'running') return false

        const stateEvent = conversation.entries.findLast((entry) => (
            entry.kind === 'event' && (entry.type === 'waiting' || entry.type === 'resumed')
        ))

        return stateEvent?.kind === 'event' && stateEvent.type === 'waiting'
    })
}

/** True when the card has at least one agent conversation still running. */
export function hasRunningConversation(card: ProjectCard) {
    return card.agentConversations.some((conversation) => (
        conversation.status === 'running' || conversation.status === 'waitingForInput'
    ))
}

/** Resolve the single agent state shown for a card, mirroring the priority waiting > running > unseen > idle. */
export function cardAgentState(card: ProjectCard): CardAgentState {
    if (isConversationWaiting(card)) return 'waiting for input'
    if (hasRunningConversation(card)) return 'running'
    if (hasUnseenAgentResult(card.path, card.agentConversations)) return 'unseen result'

    return 'idle'
}

/** Human-readable description of an agent state, or null when idle. */
export function agentStateDescription(agentState: CardAgentState): string | null {
    if (agentState === 'waiting for input') return 'Agent is waiting for input'
    if (agentState === 'running') return 'Agent is running'
    if (agentState === 'unseen result') return 'New agent result available'

    return null
}
