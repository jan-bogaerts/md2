import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import type { ReservationGroupState } from './action_conversation_render_projection'

const MIN_RESERVED_BLOCK_COUNT = 1

export interface ActionConversationReservationState {
    active: boolean
    conversationPath: string | null
    inputGroups: ReservationGroupState[]
    reservationSession: object | null
    sealedGroupKeys: string[]
    permanentKeys: Set<string>
    runningKeys: Set<string>
    slotCount: number
}

function runIsActive(status: PopupRunStatus) {
    return status === 'queued' || status === 'running' || status === 'waitingForInput'
}

/** Creates empty presentation state for chat-bottom reservation tracking. */
export function createActionConversationReservationState(): ActionConversationReservationState {
    return {
        active: false,
        conversationPath: null,
        inputGroups: [],
        permanentKeys: new Set(),
        reservationSession: null,
        runningKeys: new Set(),
        sealedGroupKeys: [],
        slotCount: 0,
    }
}

/** Advances reserved-slot state from visible render-group lifecycle changes. */
export function updateActionConversationReservation(
    previous: ActionConversationReservationState,
    conversationPath: string | null,
    groups: ReservationGroupState[],
    reservationSession: object,
    sealedGroupKeys: string[],
    status: PopupRunStatus,
) {
    const active = runIsActive(status)
    if (!active && !previous.active) return previous
    if (
        active === previous.active
        && conversationPath === previous.conversationPath
        && groups === previous.inputGroups
        && reservationSession === previous.reservationSession
        && sealedGroupKeys === previous.sealedGroupKeys
    ) return previous
    if (!active) return createActionConversationReservationState()

    const sessionChanged = !previous.active
        || previous.conversationPath !== conversationPath
        || previous.reservationSession !== reservationSession
    const retainedPermanentKeys = sessionChanged ? [] : previous.permanentKeys
    const runningKeys = new Set(groups.filter(({ running }) => running).map(({ key }) => key))
    const permanentKeys = new Set([
        ...retainedPermanentKeys,
        ...groups.filter(({ running }) => !running).map(({ key }) => key),
        ...sealedGroupKeys,
    ])
    if (sessionChanged) {
        return {
            active,
            conversationPath,
            inputGroups: groups,
            permanentKeys,
            reservationSession,
            runningKeys,
            sealedGroupKeys,
            slotCount: Math.max(MIN_RESERVED_BLOCK_COUNT, runningKeys.size),
        }
    }

    const newPermanentCount = [...permanentKeys].filter((key) => !previous.permanentKeys.has(key)).length
    const retainedRunningCount = [...runningKeys].filter((key) => previous.runningKeys.has(key)).length
    const newRunningCount = runningKeys.size - retainedRunningCount
    const reducedSlotCount = Math.max(MIN_RESERVED_BLOCK_COUNT, previous.slotCount - newPermanentCount)
    const availableSlotCount = Math.max(0, reducedSlotCount - retainedRunningCount)
    const slotCount = reducedSlotCount + Math.max(0, newRunningCount - availableSlotCount)

    return {
        active,
        conversationPath,
        inputGroups: groups,
        permanentKeys,
        reservationSession,
        runningKeys,
        sealedGroupKeys,
        slotCount,
    }
}

/** Returns currently unused slots rendered as bottom placeholders. */
export function reservedActionConversationBlockCount(state: ActionConversationReservationState) {
    return Math.max(0, state.slotCount - state.runningKeys.size)
}
