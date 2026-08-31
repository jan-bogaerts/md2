import { describe, expect, it } from 'vitest'
import {
    createActionConversationReservationState,
    reservedActionConversationBlockCount,
    type ReservationGroupState,
    updateActionConversationReservation,
} from './action_conversation_reservation'

function runningGroup(key: string): ReservationGroupState {
    return { key, running: true }
}

function permanentMessageGroup(key: string): ReservationGroupState {
    return { key, running: false }
}

describe('action conversation reservation', () => {
    it('reserves one block for an active conversation without running blocks', () => {
        const reservationSession = {}
        const state = updateActionConversationReservation(
            createActionConversationReservationState(),
            'conversation.json',
            [],
            reservationSession,
            [],
            'running',
        )

        expect(reservedActionConversationBlockCount(state)).toBe(1)
    })

    it('restores simultaneous running slots and lets permanent blocks consume surplus', () => {
        const reservationSession = {}
        const runningGroups = [runningGroup('first'), runningGroup('second')]
        const running = updateActionConversationReservation(
            createActionConversationReservationState(),
            'conversation.json',
            runningGroups,
            reservationSession,
            [],
            'running',
        )
        const disappeared = updateActionConversationReservation(
            running, 'conversation.json', [], reservationSession, [], 'running',
        )
        const permanent = updateActionConversationReservation(
            disappeared,
            'conversation.json',
            [permanentMessageGroup('message')],
            reservationSession,
            [],
            'running',
        )

        expect(reservedActionConversationBlockCount(running)).toBe(0)
        expect(reservedActionConversationBlockCount(disappeared)).toBe(2)
        expect(reservedActionConversationBlockCount(permanent)).toBe(1)
    })

    it('does not inspect group keys again when lifecycle inputs stay unchanged', () => {
        const reservationSession = {}
        const firstTool = permanentMessageGroup('first-tool')
        const groups = [firstTool]
        const transitionedGroupKeys: string[] = []
        const initial = updateActionConversationReservation(
            createActionConversationReservationState(),
            'conversation.json',
            groups,
            reservationSession,
            transitionedGroupKeys,
            'running',
        )
        const updated = updateActionConversationReservation(
            initial, 'conversation.json', groups, reservationSession, transitionedGroupKeys, 'running',
        )

        expect(updated).toBe(initial)
        expect(reservedActionConversationBlockCount(updated)).toBe(1)
    })

    it('resets reservation when conversation changes or becomes terminal', () => {
        const firstReservationSession = {}
        const secondReservationSession = {}
        const running = updateActionConversationReservation(
            createActionConversationReservationState(),
            'first.json',
            [runningGroup('first'), runningGroup('second')],
            firstReservationSession,
            [],
            'running',
        )
        const disappeared = updateActionConversationReservation(
            running, 'first.json', [], firstReservationSession, [], 'running',
        )
        const switched = updateActionConversationReservation(
            disappeared, 'second.json', [], secondReservationSession, [], 'running',
        )
        const terminal = updateActionConversationReservation(
            switched, 'second.json', [], secondReservationSession, [], 'completed',
        )

        expect(reservedActionConversationBlockCount(disappeared)).toBe(2)
        expect(reservedActionConversationBlockCount(switched)).toBe(1)
        expect(reservedActionConversationBlockCount(terminal)).toBe(0)
    })

    it('resets reservation when the same conversation path is replaced', () => {
        const firstSession = {}
        const running = updateActionConversationReservation(
            createActionConversationReservationState(),
            'conversation.json',
            [runningGroup('first'), runningGroup('second')],
            firstSession,
            [],
            'running',
        )
        const disappeared = updateActionConversationReservation(
            running, 'conversation.json', [], firstSession, [], 'running',
        )
        const replaced = updateActionConversationReservation(
            disappeared, 'conversation.json', [], {}, [], 'running',
        )

        expect(reservedActionConversationBlockCount(disappeared)).toBe(2)
        expect(reservedActionConversationBlockCount(replaced)).toBe(1)
    })
})
