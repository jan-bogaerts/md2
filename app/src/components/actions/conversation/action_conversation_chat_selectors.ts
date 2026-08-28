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
