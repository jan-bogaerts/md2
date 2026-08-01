import { describe, expect, it } from 'vitest'
import { createScheduleTrigger } from './action_schedule_trigger'

describe('createScheduleTrigger', () => {
    it('creates a time trigger with an absolute timestamp', () => {
        const input = ' 2099-07-07T10:30 '

        expect(createScheduleTrigger(input, 0)).toEqual({ timestamp: new Date(input.trim()).toISOString(), type: 'at' })
    })

    it('fails when the timestamp is missing or invalid', () => {
        expect(() => createScheduleTrigger('', 0)).toThrow('Timestamp is required for time schedules')
        expect(() => createScheduleTrigger('not-a-date', 0)).toThrow('Schedule timestamp is invalid')
    })

    it('fails when the timestamp is not in the future', () => {
        expect(() => createScheduleTrigger('2026-07-07T10:30:00.000Z', Date.parse('2026-07-07T10:30:00.000Z')))
            .toThrow('Schedule time must be in the future')
    })
})
