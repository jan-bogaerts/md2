import { describe, expect, it } from 'vitest'
import type { AgentConversation, AgentConversationEntry } from '../../../data/data_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import {
    createAcknowledgementConversationSelector,
    pendingConversationQuestions,
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

const questions = [{ header: 'Scope', id: 'choice', question: 'How wide should the fix be?' }]

function questionEntry(): AgentConversationEntry {
    return { content: '', id: 'question-1', kind: 'event', questions, timestamp: 'now', type: 'agentQuestion' }
}

describe('pending conversation questions', () => {
    it('restores the questions of a waiting conversation whose last entry is the question', () => {
        expect(pendingConversationQuestions(conversation({
            entries: [questionEntry()],
            status: 'waitingForInput',
        }))).toEqual(questions)
    })

    it('reports no question once an answer message follows it', () => {
        const answer: AgentConversationEntry = {
            content: 'How wide should the fix be?: Narrow',
            id: 'answer-1',
            kind: 'message',
            role: 'user',
            timestamp: 'now',
        }

        expect(pendingConversationQuestions(conversation({
            entries: [questionEntry(), answer],
            status: 'waitingForInput',
        }))).toBeNull()
    })

    it('reports no question once a dismissal follows it', () => {
        const dismissal: AgentConversationEntry = {content: '', id: 'dismissed-1', kind: 'event', timestamp: 'now', type: 'questionsDismissed'}

        expect(pendingConversationQuestions(conversation({
            entries: [questionEntry(), dismissal],
            status: 'waitingForInput',
        }))).toBeNull()
    })

    it.each(['cancelled', 'completed', 'failed', 'running'] as const)('reports no question while %s', (status) => {
        expect(pendingConversationQuestions(conversation({ entries: [questionEntry()], status }))).toBeNull()
    })

    it('reports no question without a selected conversation', () => {
        expect(pendingConversationQuestions(null)).toBeNull()
    })
})

describe('action conversation chat selectors', () => {
    it('keeps acknowledgement identity until acknowledgement fields change', () => {
        const selectConversation = createAcknowledgementConversationSelector()
        const initialConversation = conversation()
        const initialSelection = selectConversation(run(initialConversation))

        expect(selectConversation(run(conversation({ entries: [...initialConversation.entries] })))).toBe(initialSelection)
        expect(selectConversation(run(conversation({ viewed: false })))).not.toBe(initialSelection)
    })
})
