import type { ActionScheduleTrigger } from '../../data/action_schedule_types'

export function createScheduleTrigger(
    type: ActionScheduleTrigger['type'],
    timestampInput: string,
    afterActionNameInput: string,
): ActionScheduleTrigger {
    if (type === 'agentSlot') return { type: 'agentSlot' }
    if (type === 'afterAction') {
        const actionName = afterActionNameInput.trim()
        if (actionName.length === 0) throw new Error('Action name is required for after-action schedules')

        return { actionName, type: 'afterAction' }
    }

    const timestamp = timestampInput.trim()
    if (timestamp.length === 0) throw new Error('Timestamp is required for time schedules')

    return { timestamp, type: 'at' }
}
