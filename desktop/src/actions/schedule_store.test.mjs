import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    appendActionSchedule,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    findPendingSchedule,
    parseActionScheduleFile,
    pendingAfterActionSchedules,
    pendingScheduleIds,
    updateActionScheduleStatus,
} = require('./schedule_store')

const context = { file: 'design/F-022.md', kind: 'card', type: 'feature' }

function createSchedule(id = 'schedule-1', trigger = { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' }) {
    return {
        actionId: 'implement',
        context,
        createdAt: '2026-07-06T10:00:00.000Z',
        id,
        status: 'pending',
        trigger,
    }
}

describe('schedule store', () => {
    it('parses and creates explicit schedule files', () => {
        const schedule = createSchedule()

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] })
        expect(createActionScheduleFile([schedule])).toEqual({ schedules: [schedule] })
    })

    it('rejects schedules with missing required fields', () => {
        expect(() => parseActionScheduleFile({ schedules: [{ id: 'schedule-1' }] })).toThrow('missing actionId')
    })

    it('parses project-wide schedules without a file target', () => {
        const schedule = { ...createSchedule(), context: { kind: 'project' } }

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] })
    })

    it('appends schedules through the validated file model', () => {
        const firstSchedule = createSchedule('schedule-1')
        const secondSchedule = createSchedule('schedule-2', { type: 'agentSlot' })

        expect(appendActionSchedule([firstSchedule], secondSchedule)).toEqual([firstSchedule, secondSchedule])
    })

    it('updates and cancels schedule status immutably', () => {
        const schedule = createSchedule()

        expect(updateActionScheduleStatus([schedule], 'schedule-1', 'running')).toEqual([{ ...schedule, status: 'running' }])
        expect(cancelPendingActionSchedule([schedule], 'schedule-1')).toEqual([{ ...schedule, status: 'cancelled' }])
    })

    it('finds pending schedules and pending after-action schedules', () => {
        const afterActionSchedule = createSchedule('schedule-1', { actionId: 'build', type: 'afterAction' })
        const completedSchedule = { ...createSchedule('schedule-2', { actionId: 'build', type: 'afterAction' }), status: 'completed' }

        expect(findPendingSchedule([afterActionSchedule], 'schedule-1')).toEqual(afterActionSchedule)
        expect(pendingAfterActionSchedules([afterActionSchedule, completedSchedule], 'build')).toEqual([afterActionSchedule])
        expect([...pendingScheduleIds([afterActionSchedule, completedSchedule])]).toEqual(['schedule-1'])
    })
})
