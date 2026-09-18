import { describe, expect, it } from 'vitest'
import { createScheduleFile, parseScheduleFile } from '../../../shared/action_schedules.mjs'
import {
    createActionScheduleFile,
    parseActionScheduleFile,
    type ActionSchedule,
    type AnySchedule,
} from './action_schedule_types'

const createdAt = '2026-07-06T10:00:00.000Z'

function createActionSchedule(trigger: ActionSchedule['trigger']): ActionSchedule {
    return {
        actionId: 'action-implement',
        context: { cardInternalId: 'card-action', kind: 'card', type: 'feature' },
        createdAt,
        id: 'schedule-1',
        kind: 'action',
        status: 'pending',
        trigger,
    }
}

describe('action schedule types', () => {
    it('uses shared parser and serializer directly', () => {
        expect(parseActionScheduleFile).toBe(parseScheduleFile)
        expect(createActionScheduleFile).toBe(createScheduleFile)
    })

    it('parses explicit schedule files', () => {
        const schedule = createActionSchedule({ timestamp: '2026-07-06T11:00:00.000Z', type: 'at' })

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] })
        expect(createActionScheduleFile([schedule])).toEqual({ schedules: [schedule] })
    })

    it('rejects schedules with missing required fields', () => {
        expect(() => parseActionScheduleFile({ schedules: [{ id: 'schedule-1' }] })).toThrow('missing kind')
    })

    it('parses project-wide schedules without a file target', () => {
        const schedule: ActionSchedule = {
            actionId: 'md2.custom-prompt',
            context: { kind: 'project' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-project',
            kind: 'action',
            status: 'pending',
            trigger: { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' },
        }

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] })
    })

    it.each(['cancelled', 'completed', 'failed'] as const)('parses %s terminal status', (status) => {
        const schedule: ActionSchedule = {
            actionId: 'action-implement',
            context: { kind: 'file' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-1',
            kind: 'action',
            status,
            trigger: { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' },
        }

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] })
    })

    it('rejects unsupported trigger types', () => {
        const schedule = {
            actionId: 'action-implement',
            context: { kind: 'project' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-1',
            kind: 'action',
            status: 'pending',
            trigger: { type: 'agentSlot' },
        }

        expect(() => parseActionScheduleFile({ schedules: [schedule] })).toThrow('unsupported trigger type agentSlot')
    })

    it('parses account-reset and card-state action triggers', () => {
        const accountSchedule = createActionSchedule({
            agent: 'codex',
            expectedResetAt: '2026-07-06T11:00:00.000Z',
            limitId: 'weekly',
            type: 'account-reset',
            windowId: 'primary',
        })
        const cardSchedule = createActionSchedule({
            cardInternalId: 'card-trigger',
            registrationState: 'todo',
            targetState: 'ready',
            type: 'card-state',
        })

        const schedules = [accountSchedule, cardSchedule]

        expect(parseActionScheduleFile({ schedules })).toEqual({ schedules })
    })

    it('parses sequence schedules with now triggers', () => {
        const schedule: AnySchedule = {
            actionCompleted: false,
            actionId: 'implement',
            cardInternalIds: ['card-1', 'card-2'],
            createdAt,
            currentIndex: 0,
            currentRunId: null,
            failure: null,
            id: 'sequence-1',
            kind: 'sequence',
            readyState: 'ready',
            readyStateMet: false,
            status: 'pending',
            trigger: { type: 'now' },
        }

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] })
    })

    it.each([
        [{ ...createActionSchedule({ timestamp: 'invalid', type: 'at' }) }, 'invalid trigger.timestamp'],
        [{ ...createActionSchedule({ timestamp: '2026-07-06T11:00:00.000Z', type: 'at' }), createdAt: 'invalid' }, 'invalid createdAt'],
        [{ ...createActionSchedule({ timestamp: '2026-07-06T11:00:00.000Z', type: 'at' }), kind: 'unknown' }, 'unsupported kind unknown'],
        [{ ...createActionSchedule({ timestamp: '2026-07-06T11:00:00.000Z', type: 'at' }), status: 'unknown' }, 'unsupported status unknown'],
        [{ ...createActionSchedule({ type: 'now' } as never) }, 'now trigger requires sequence kind'],
        [{
            ...createActionSchedule({
                agent: 'codex',
                expectedResetAt: '2026-07-06T11:00:00.000Z',
                limitId: 'weekly',
                type: 'account-reset',
            } as never),
        }, 'missing trigger.windowId'],
        [{...createActionSchedule({ registrationState: 'todo', targetState: 'ready', type: 'card-state' } as never)}, 'missing trigger.cardInternalId'],
        [{...createActionSchedule({ cardInternalId: 'card-action', registrationState: 'todo', targetState: 'ready', type: 'card-state' })}, 'scheduled action card and trigger card must differ'],
        [{
            actionCompleted: false,
            actionId: 'implement',
            cardInternalIds: ['card-1', 'card-1'],
            createdAt,
            currentIndex: 0,
            currentRunId: null,
            failure: null,
            id: 'sequence-1',
            kind: 'sequence',
            readyState: 'ready',
            readyStateMet: false,
            status: 'pending',
            trigger: { type: 'now' },
        }, 'duplicate sequence cardInternalId'],
    ])('rejects malformed schedule %#', (schedule, message) => {
        expect(() => parseActionScheduleFile({ schedules: [schedule] })).toThrow(message)
    })
})
