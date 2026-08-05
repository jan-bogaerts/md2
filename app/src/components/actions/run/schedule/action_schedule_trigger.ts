import type { ActionScheduleTrigger } from '../../../data/action_schedule_types'

/** Validate a local date/time input and create its absolute scheduler timestamp. */
export function createScheduleTrigger(timestampInput: string, now = Date.now()): ActionScheduleTrigger {
    const timestamp = timestampInput.trim()
    if (timestamp.length === 0) throw new Error('Timestamp is required for time schedules')
    const fireAt = Date.parse(timestamp)
    if (Number.isNaN(fireAt)) throw new Error('Schedule timestamp is invalid')
    if (fireAt <= now) throw new Error('Schedule time must be in the future')

    return { timestamp: new Date(fireAt).toISOString(), type: 'at' }
}
