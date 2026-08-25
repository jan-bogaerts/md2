import { describe, expect, it } from 'vitest'
import type { AgentConversation } from '../../../data/data_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import {
    createAcknowledgementConversationSelector,
    createConversationTranscriptSelector,
} from './action_conversation_chat_selectors'

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: null,
        entries: [],
        hasExplicitTitle: false,
        id: 'conversation-1',
        path: 'conversation.json',
        providerSessions: [],
        startedAt: '2026-08-25T10:00:00.000Z',
        status: 'running',
        title: 'Review',
        viewed: true,
        ...overrides,
    }
}

function run(value: AgentConversation): ActionRun {
    return { conversation: value } as ActionRun
}

describe('action conversation chat selectors', () => {
    it('keeps transcript identity when only logs or metadata change', () => {
        const selectTranscript = createConversationTranscriptSelector()
        const initialConversation = conversation()
        const initialTranscript = selectTranscript(run(initialConversation))
        const metadataUpdate = conversation({
            contextWindowUsage: { capacityTokens: 100, usedTokens: 25 },
            entries: initialConversation.entries,
            providerSessions: initialConversation.providerSessions,
            timer: { elapsedMs: 1_000, runningStartedAt: null },
        })

        expect(selectTranscript(run(metadataUpdate))).toBe(initialTranscript)

        const entries = [{
            content: 'Answer',
            id: 'message-1',
            kind: 'message' as const,
            role: 'assistant' as const,
            timestamp: '2026-08-25T10:00:01.000Z',
        }]
        expect(selectTranscript(run(conversation({ entries })))).not.toBe(initialTranscript)
    })

    it('keeps acknowledgement identity until acknowledgement fields change', () => {
        const selectConversation = createAcknowledgementConversationSelector()
        const initialConversation = conversation()
        const initialSelection = selectConversation(run(initialConversation))

        expect(selectConversation(run(conversation({ entries: [...initialConversation.entries] })))).toBe(initialSelection)
        expect(selectConversation(run(conversation({ viewed: false })))).not.toBe(initialSelection)
    })
})
