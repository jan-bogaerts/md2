import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../data/action_context'
import type { AgentConversation } from '../../../data/data_types'
import { ActionConversationPicker } from './action_conversation_picker'
import { conversationOptions } from './action_conversation_store'
import { conversationPickerLabel, formatConversationDateTime } from './action_conversation_picker_data'

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'action-review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: '2026-07-15T10:01:00.000Z',
        entries: [],
        hasExplicitTitle: true,
        id: 'conversation-1',
        path: 'design/activity/card__card-1.json#conversation=conversation-1',
        providerSessions: [],
        startedAt: '2026-07-15T10:00:00.000Z',
        status: 'completed',
        title: 'Review',
        viewed: true,
        ...overrides,
    }
}

describe('conversation picker data', () => {
    afterEach(cleanup)

    it('always allows selecting New conversation', () => {
        const onChange = vi.fn()
        const selectedConversation = conversation()
        render(
            <ActionConversationPicker
                conversations={[selectedConversation]}
                disabled={false}
                loading={false}
                onChange={onChange}
                selectedPath={selectedConversation.path}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Conversation history' }))
        const options = within(screen.getByRole('listbox'))
        const emptyConversation = options.getByRole('option', { name: 'New conversation' })
        expect(emptyConversation).not.toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(emptyConversation)

        expect(onChange).toHaveBeenCalledOnce()
    })

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
        const liveNewest = conversation({ entries: [{ content: 'live', id: 'm1', kind: 'message', role: 'assistant', timestamp: 'now' }], id: 'newest', path: 'live-newest.json' })

        const secondLive = conversation({ id: 'live-second', path: 'live-second.json', startedAt: '2026-07-16T10:00:00.000Z' })
        const result = conversationOptions([older, newest, otherAction, otherCard], 'action-review', context, [liveNewest, secondLive])

        expect(result.map(({ id }) => id)).toEqual(['live-second', 'newest', 'older'])
        expect(result[1].entries[0].content).toBe('live')
    })

    it('keeps project conversations separate from card conversations', () => {
        const projectConversation = conversation({ cardInternalId: null, cardPath: null, id: 'project', path: 'project.json' })

        expect(conversationOptions([conversation(), projectConversation], 'action-review', { kind: 'project' }, []))
            .toEqual([projectConversation])
    })
})
