import type { ActionScheduleTrigger } from '../../data/action_schedule_types'

export type ScheduleTriggerType = ActionScheduleTrigger['type']

/** Build a scheduler trigger from popup form fields. */
export function createScheduleTrigger(
    type: ScheduleTriggerType,
    timestampInput: string,
    afterActionIdInput: string,
): ActionScheduleTrigger {
    if (type === 'agentSlot') return { type: 'agentSlot' }
    if (type === 'afterAction') {
        const actionId = afterActionIdInput.trim()
        if (actionId.length === 0) throw new Error('Action id is required for after action schedules')

        return { actionId, type: 'afterAction' }
    }

    const timestamp = timestampInput.trim()
    if (timestamp.length === 0) throw new Error('Timestamp is required for time schedules')

    return { timestamp, type: 'at' }
}
