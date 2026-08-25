import type { AgentConversation } from '../../../data/data_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import type { ConversationTranscript } from './action_conversation_transcript'

function transcriptConversation(conversation: AgentConversation): ConversationTranscript {
    const { cardInternalId, entries, path, providerSessions } = conversation

    return { cardInternalId, entries, path, providerSessions }
}

/** Builds a selector whose result changes only when transcript fields change. */
export function createConversationTranscriptSelector() {
    let selectedConversation: AgentConversation | null = null
    let selectedTranscript: ConversationTranscript | null = null

    return (run: ActionRun | null) => {
        const conversation = run?.conversation ?? null
        if (!conversation) {
            selectedConversation = null
            selectedTranscript = null
            return null
        }
        const previousConversation = selectedConversation
        if (
            previousConversation !== null
            && previousConversation.cardInternalId === conversation.cardInternalId
            && previousConversation.entries === conversation.entries
            && previousConversation.path === conversation.path
            && previousConversation.providerSessions === conversation.providerSessions
        ) return selectedTranscript

        selectedConversation = conversation
        selectedTranscript = transcriptConversation(conversation)
        return selectedTranscript
    }
}

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

/** Produces transcript data for a loaded history selection. */
export function selectedConversationTranscript(conversation: AgentConversation | null) {
    return conversation ? transcriptConversation(conversation) : null
}
