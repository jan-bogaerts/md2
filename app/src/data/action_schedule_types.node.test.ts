import { describe, expect, it } from 'vitest'
import { createActionScheduleFile, parseActionScheduleFile, type ActionSchedule } from './action_schedule_types'

describe('action schedule types', () => {
    it('parses explicit schedule files', () => {
        const schedule: ActionSchedule = {
            actionId: 'action-implement',
            context: { file: 'design/F-022.md', kind: 'card', type: 'feature' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-1',
            status: 'pending',
            trigger: { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' },
        }

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] })
        expect(createActionScheduleFile([schedule])).toEqual({ schedules: [schedule] })
    })

    it('rejects schedules with missing required fields', () => {
        expect(() => parseActionScheduleFile({ schedules: [{ id: 'schedule-1' }] })).toThrow('missing actionId')
    })

    it('parses project-wide schedules without a file target', () => {
        const schedule: ActionSchedule = {
            actionId: 'md2.custom-prompt',
            context: { kind: 'project' },
            createdAt: '2026-07-06T10:00:00.000Z',
            id: 'schedule-project',
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
            status: 'pending',
            trigger: { type: 'agentSlot' },
        }

        expect(() => parseActionScheduleFile({ schedules: [schedule] })).toThrow('unsupported trigger type agentSlot')
    })
})
