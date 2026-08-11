import { describe, expect, it } from 'vitest'
import type { AgentConversationEventEntry, AgentConversationMessageEntry } from '../../../data/data_types'
import type { ActionConversationRenderGroup } from './action_conversation_render_groups'
import {
    createActionConversationReservationState,
    reservedActionConversationBlockCount,
    updateActionConversationReservation,
} from './action_conversation_reservation'

type EntryRenderGroup = Extract<ActionConversationRenderGroup, { kind: 'entry' }>
type EventEntryRenderGroup = EntryRenderGroup & { entry: AgentConversationEventEntry }

function runningGroup(key: string): EventEntryRenderGroup {
    const entry: AgentConversationEventEntry = {
        content: key,
        id: key,
        kind: 'event',
        providerItemId: key,
        status: 'inProgress',
        timestamp: 'now',
        type: 'reasoning',
    }

    return { entry, key, kind: 'entry' }
}

function permanentMessageGroup(key: string): EntryRenderGroup {
    const entry: AgentConversationMessageEntry = {
        content: key,
        id: key,
        kind: 'message',
        role: 'assistant',
        timestamp: 'now',
    }

    return { entry, key, kind: 'entry' }
}

describe('action conversation reservation', () => {
    it('reserves one block for an active conversation without running blocks', () => {
        const state = updateActionConversationReservation(
            createActionConversationReservationState(),
            'conversation.json',
            [],
            'running',
        )

        expect(reservedActionConversationBlockCount(state)).toBe(1)
    })

    it('restores simultaneous running slots and lets permanent blocks consume surplus', () => {
        const runningGroups = [runningGroup('first'), runningGroup('second')]
        const running = updateActionConversationReservation(
            createActionConversationReservationState(),
            'conversation.json',
            runningGroups,
            'running',
        )
        const disappeared = updateActionConversationReservation(running, 'conversation.json', [], 'running')
        const permanent = updateActionConversationReservation(
            disappeared,
            'conversation.json',
            [permanentMessageGroup('message')],
            'running',
        )

        expect(reservedActionConversationBlockCount(running)).toBe(0)
        expect(reservedActionConversationBlockCount(disappeared)).toBe(2)
        expect(reservedActionConversationBlockCount(permanent)).toBe(1)
    })

    it('does not treat in-place updates or existing tool-group regrouping as new permanent blocks', () => {
        const firstTool = runningGroup('first-tool')
        firstTool.entry.status = 'completed'
        const initial = updateActionConversationReservation(
            createActionConversationReservationState(),
            'conversation.json',
            [firstTool],
            'running',
        )
        const grouped: ActionConversationRenderGroup = {
            entries: [firstTool.entry, { ...firstTool.entry, id: 'second-tool', providerItemId: 'second-tool' }],
            key: 'first-tool',
            kind: 'completedToolCalls',
        }
        const updated = updateActionConversationReservation(initial, 'conversation.json', [grouped], 'running')

        expect(updated).toBe(initial)
        expect(reservedActionConversationBlockCount(updated)).toBe(1)
    })

    it('resets reservation when conversation changes or becomes terminal', () => {
        const running = updateActionConversationReservation(
            createActionConversationReservationState(),
            'first.json',
            [runningGroup('first'), runningGroup('second')],
            'running',
        )
        const disappeared = updateActionConversationReservation(running, 'first.json', [], 'running')
        const switched = updateActionConversationReservation(disappeared, 'second.json', [], 'running')
        const terminal = updateActionConversationReservation(switched, 'second.json', [], 'completed')

        expect(reservedActionConversationBlockCount(disappeared)).toBe(2)
        expect(reservedActionConversationBlockCount(switched)).toBe(1)
        expect(reservedActionConversationBlockCount(terminal)).toBe(0)
    })
})
