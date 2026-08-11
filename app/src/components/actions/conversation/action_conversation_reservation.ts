import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import type { ActionConversationRenderGroup } from './action_conversation_render_groups'

const MIN_RESERVED_BLOCK_COUNT = 1

export interface ActionConversationReservationState {
    active: boolean
    conversationPath: string | null
    inputKey: string
    permanentKeys: Set<string>
    runningKeys: Set<string>
    slotCount: number
}

function runIsActive(status: PopupRunStatus) {
    return status === 'queued' || status === 'running' || status === 'waitingForInput'
}

function groupIsRunning(group: ActionConversationRenderGroup) {
    if (group.kind !== 'entry' || group.entry.kind !== 'event') return false

    return group.entry.status === 'inProgress'
        || group.entry.status === 'running'
        || group.entry.status === 'started'
}

function reservationInputKey(
    conversationPath: string | null,
    groups: ActionConversationRenderGroup[],
    active: boolean,
) {
    return JSON.stringify([conversationPath, active, groups.map((group) => [group.key, groupIsRunning(group)])])
}

/** Creates empty presentation state for chat-bottom reservation tracking. */
export function createActionConversationReservationState(): ActionConversationReservationState {
    return {
        active: false,
        conversationPath: null,
        inputKey: '',
        permanentKeys: new Set(),
        runningKeys: new Set(),
        slotCount: 0,
    }
}

/** Advances reserved-slot state from visible render-group lifecycle changes. */
export function updateActionConversationReservation(
    previous: ActionConversationReservationState,
    conversationPath: string | null,
    groups: ActionConversationRenderGroup[],
    status: PopupRunStatus,
) {
    const active = runIsActive(status)
    const inputKey = reservationInputKey(conversationPath, groups, active)
    if (inputKey === previous.inputKey) return previous
    if (!active) return { ...createActionConversationReservationState(), inputKey }

    const runningKeys = new Set(groups.filter(groupIsRunning).map(({ key }) => key))
    const permanentKeys = new Set(groups.filter((group) => !groupIsRunning(group)).map(({ key }) => key))
    const sessionChanged = !previous.active || previous.conversationPath !== conversationPath
    if (sessionChanged) {
        return {
            active,
            conversationPath,
            inputKey,
            permanentKeys,
            runningKeys,
            slotCount: Math.max(MIN_RESERVED_BLOCK_COUNT, runningKeys.size),
        }
    }

    const newPermanentCount = [...permanentKeys].filter((key) => !previous.permanentKeys.has(key)).length
    const retainedRunningCount = [...runningKeys].filter((key) => previous.runningKeys.has(key)).length
    const newRunningCount = runningKeys.size - retainedRunningCount
    const reducedSlotCount = Math.max(MIN_RESERVED_BLOCK_COUNT, previous.slotCount - newPermanentCount)
    const availableSlotCount = Math.max(0, reducedSlotCount - retainedRunningCount)
    const slotCount = reducedSlotCount + Math.max(0, newRunningCount - availableSlotCount)

    return { active, conversationPath, inputKey, permanentKeys, runningKeys, slotCount }
}

/** Returns currently unused slots rendered as bottom placeholders. */
export function reservedActionConversationBlockCount(state: ActionConversationReservationState) {
    return Math.max(0, state.slotCount - state.runningKeys.size)
}
