import type { AgentConversation } from '../../data/data_types'

export type CardAgentState = 'idle' | 'running' | 'unseen result' | 'waiting for input'

/** Newest not-yet-viewed conversation for one action, or null when all are viewed. */
export function latestUnseenConversation(conversations: AgentConversation[], actionId: string) {
    return [...conversations]
        .filter((conversation) => conversation.actionId === actionId && !conversation.viewed)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ?? null
}

/** True when any conversation has not been viewed yet. */
export function hasUnseenConversation(conversations: AgentConversation[]) {
    return conversations.some(({ viewed }) => !viewed)
}

function isConversationWaiting(conversations: AgentConversation[]) {
    return conversations.some((conversation) => {
        if (conversation.status === 'waitingForInput') return true
        if (conversation.status !== 'running') return false

        const stateEvent = conversation.entries.findLast((entry) => (
            entry.kind === 'event' && (entry.type === 'waiting' || entry.type === 'resumed')
        ))

        return stateEvent?.kind === 'event' && stateEvent.type === 'waiting'
    })
}

/** True when the card has at least one agent conversation still running. */
export function hasRunningConversation(conversations: AgentConversation[]) {
    return conversations.some((conversation) => (
        conversation.status === 'running' || conversation.status === 'waitingForInput'
    ))
}

/** Resolve the single agent state shown for a card, mirroring the priority waiting > running > unseen > idle. */
export function cardAgentState(conversations: AgentConversation[]): CardAgentState {
    if (isConversationWaiting(conversations)) return 'waiting for input'
    if (hasRunningConversation(conversations)) return 'running'
    if (hasUnseenConversation(conversations)) return 'unseen result'

    return 'idle'
}

/** Human-readable description of an agent state, or null when idle. */
export function agentStateDescription(agentState: CardAgentState): string | null {
    if (agentState === 'waiting for input') return 'Agent is waiting for input'
    if (agentState === 'running') return 'Agent is running'
    if (agentState === 'unseen result') return 'New agent result available'

    return null
}
