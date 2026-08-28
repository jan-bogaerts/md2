import { describe, expect, it } from 'vitest'
import type { AgentConversation } from '../../../data/data_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import { createAcknowledgementConversationSelector } from './action_conversation_chat_selectors'

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
    it('keeps acknowledgement identity until acknowledgement fields change', () => {
        const selectConversation = createAcknowledgementConversationSelector()
        const initialConversation = conversation()
        const initialSelection = selectConversation(run(initialConversation))

        expect(selectConversation(run(conversation({ entries: [...initialConversation.entries] })))).toBe(initialSelection)
        expect(selectConversation(run(conversation({ viewed: false })))).not.toBe(initialSelection)
    })
})
