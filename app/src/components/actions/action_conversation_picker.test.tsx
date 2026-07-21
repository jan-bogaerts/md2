import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { AgentConversation } from '../../data/data_types'
import { mergeConversationHistory } from './use_action_popup_controller'
import { conversationPickerLabel, formatConversationDateTime } from './action_conversation_picker_data'

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'action-review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: '2026-07-15T10:01:00.000Z',
        events: [],
        hasExplicitTitle: true,
        id: 'conversation-1',
        messages: [],
        path: 'design/activity/card__card-1.json#conversation=conversation-1',
        providerSessions: [],
        startedAt: '2026-07-15T10:00:00.000Z',
        status: 'completed',
        title: 'Review',
        ...overrides,
    }
}

describe('conversation picker data', () => {
    it('uses explicit titles with local date/time and falls back to date/time alone', () => {
        const titled = conversation()
        const untitled = conversation({ hasExplicitTitle: false, title: 'conversation-1' })

        expect(conversationPickerLabel(titled)).toBe(`Review — ${formatConversationDateTime(titled.startedAt)}`)
        expect(conversationPickerLabel(untitled)).toBe(formatConversationDateTime(untitled.startedAt))
        expect(formatConversationDateTime('invalid timestamp')).toBe('invalid timestamp')
    })

    it('filters context, sorts newest first, and replaces live duplicates', () => {
        const context: ActionContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' }
        const older = conversation({ id: 'older', path: 'older.json', startedAt: '2026-07-14T10:00:00.000Z' })
        const newest = conversation({ id: 'newest', path: 'newest.json', startedAt: '2026-07-15T10:00:00.000Z' })
        const otherAction = conversation({ actionId: 'action-implement', id: 'other-action', path: 'other-action.json' })
        const otherCard = conversation({ cardInternalId: 'card-2', cardPath: 'design/F-2.md', id: 'other', path: 'other.json' })
        const liveNewest = conversation({ id: 'newest', messages: [{ content: 'live', id: 'm1', role: 'assistant', timestamp: 'now' }], path: 'live-newest.json' })

        const result = mergeConversationHistory([older, newest, otherAction, otherCard], 'action-review', context, liveNewest)

        expect(result.map(({ id }) => id)).toEqual(['newest', 'older'])
        expect(result[0].messages[0].content).toBe('live')
    })

    it('keeps project conversations separate from card conversations', () => {
        const projectConversation = conversation({ cardInternalId: null, cardPath: null, id: 'project', path: 'project.json' })

        expect(mergeConversationHistory([conversation(), projectConversation], 'action-review', { kind: 'project' }, null))
            .toEqual([projectConversation])
    })
})
