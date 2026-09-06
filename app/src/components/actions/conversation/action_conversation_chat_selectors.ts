import type { AgentConversation } from '../../../data/data_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'

/** Keeps acknowledgement data stable while unrelated conversation fields stream. */
export function createAcknowledgementConversationSelector() {
    let selectedConversation: AgentConversation | null = null

    return (run: ActionRun | null) => {
        const conversation = run?.conversation ?? null
        if (!conversation) {
            selectedConversation = null
            return null
        }
        const previousConversation = selectedConversation
        if (
            previousConversation !== null
            && previousConversation.id === conversation.id
            && previousConversation.path === conversation.path
            && previousConversation.viewed === conversation.viewed
        ) return selectedConversation

        selectedConversation = conversation
        return selectedConversation
    }
}

/**
 * Questions of a conversation that is still waiting on them: the trailing `agentQuestion` entry.
 * Answering appends a user message and dismissing appends `questionsDismissed`, so a resolved question
 * is never the last entry.
 */
export function pendingConversationQuestions(conversation: AgentConversation | null) {
    if (!conversation || conversation.status !== 'waitingForInput') return null
    const lastEntry = conversation.entries.at(-1)
    if (!lastEntry || lastEntry.kind !== 'event' || lastEntry.type !== 'agentQuestion') return null

    return lastEntry.questions?.length ? lastEntry.questions : null
}
