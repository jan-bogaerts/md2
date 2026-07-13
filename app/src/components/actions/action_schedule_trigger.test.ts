import { describe, expect, it } from 'vitest'
import { createScheduleTrigger } from './action_schedule_trigger'

describe('createScheduleTrigger', () => {
    it('creates a time trigger from trimmed timestamp input', () => {
        expect(createScheduleTrigger('at', ' 2026-07-07T10:30 ', '')).toEqual({ timestamp: '2026-07-07T10:30', type: 'at' })
    })

    it('creates an agent slot trigger without extra fields', () => {
        expect(createScheduleTrigger('agentSlot', '', '')).toEqual({ type: 'agentSlot' })
    })

    it('creates an after action trigger from trimmed action id input', () => {
        expect(createScheduleTrigger('afterAction', '', ' action-tests ')).toEqual({ actionId: 'action-tests', type: 'afterAction' })
    })

    it('fails when required input is missing', () => {
        expect(() => createScheduleTrigger('at', '', '')).toThrow('Timestamp is required for time schedules')
        expect(() => createScheduleTrigger('afterAction', '', '')).toThrow('Action id is required for after action schedules')
    })
})
