import { describe, expect, it } from 'vitest'
import type { ActionScheduleAccountTracker, ActionScheduleCardOption } from './action_schedule_options'
import type { ActionScheduleSnapshot } from './action_schedule_store'
import { canRegisterSchedule, createScheduleTrigger, type ActionScheduleTriggerSources } from './action_schedule_trigger'

const accountTracker: ActionScheduleAccountTracker = {
    agent: 'codex',
    agentLabel: 'Codex',
    expectedResetAt: '2099-07-07T12:00:00.000Z',
    label: 'Pro · primary · 42% used',
    limitId: 'codex,pro',
    usedPercent: 42,
    windowId: 'primary',
}
const card: ActionScheduleCardOption = {
    cardInternalId: 'other-card',
    label: 'Other · design/F_2.md',
    registrationState: 'in progress',
}
const sources: ActionScheduleTriggerSources = {
    accountTrackers: [accountTracker],
    cards: [card],
    targetStates: ['ready'],
}

function atSnapshot(timestamp: string): ActionScheduleSnapshot {
    return { message: null, open: true, timestamp, triggerType: 'at' }
}

describe('createScheduleTrigger', () => {
    it('creates a time trigger with an absolute timestamp', () => {
        const input = ' 2099-07-07T10:30 '

        expect(createScheduleTrigger(atSnapshot(input), sources, 0))
            .toEqual({ timestamp: new Date(input.trim()).toISOString(), type: 'at' })
    })

    it('fails when the timestamp is missing or invalid', () => {
        expect(() => createScheduleTrigger(atSnapshot(''), sources, 0)).toThrow('Timestamp is required for time schedules')
        expect(() => createScheduleTrigger(atSnapshot('not-a-date'), sources, 0)).toThrow('Schedule timestamp is invalid')
    })

    it('fails when the timestamp is not in the future', () => {
        const timestamp = '2026-07-07T10:30:00.000Z'

        expect(() => createScheduleTrigger(atSnapshot(timestamp), sources, Date.parse(timestamp)))
            .toThrow('Schedule time must be in the future')
    })

    it('captures exact selected account tracker occurrence', () => {
        const snapshot: ActionScheduleSnapshot = {agent: 'codex', limitId: 'codex,pro', message: null, open: true, triggerType: 'account-reset', windowId: 'primary'}

        expect(createScheduleTrigger(snapshot, sources)).toEqual({
            agent: 'codex',
            expectedResetAt: accountTracker.expectedResetAt,
            limitId: 'codex,pro',
            type: 'account-reset',
            windowId: 'primary',
        })
    })

    it('rejects unavailable and reset-less account trackers', () => {
        const snapshot: ActionScheduleSnapshot = {agent: 'codex', limitId: 'codex,pro', message: null, open: true, triggerType: 'account-reset', windowId: 'primary'}

        expect(() => createScheduleTrigger(snapshot, { ...sources, accountTrackers: [] }))
            .toThrow('Selected account tracker is unavailable')
        expect(() => createScheduleTrigger(snapshot, {
            ...sources,
            accountTrackers: [{ ...accountTracker, expectedResetAt: null }],
        })).toThrow('Selected account tracker has no reset time')
    })

    it('uses card internal identity, current state, and configured target state', () => {
        const snapshot: ActionScheduleSnapshot = {cardInternalId: 'other-card', message: null, open: true, targetState: 'ready', triggerType: 'card-state'}

        expect(createScheduleTrigger(snapshot, sources)).toEqual({
            cardInternalId: 'other-card',
            registrationState: 'in progress',
            targetState: 'ready',
            type: 'card-state',
        })
        expect(canRegisterSchedule(snapshot, { ...sources, targetStates: ['done'] })).toBe(false)
    })
})
