import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    appendActionSchedule,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    findPendingSchedule,
    parseActionScheduleFile,
    pendingScheduleIds,
    updateActionScheduleStatus,
} = require('./schedule_store');

const context = { file: 'design/F-022.md', kind: 'card', type: 'feature' };

function createSchedule(id = 'schedule-1', trigger = { timestamp: '2026-07-06T11:00:00.000Z', type: 'at' }) {
    return {
        actionId: 'implement',
        context,
        createdAt: '2026-07-06T10:00:00.000Z',
        id,
        status: 'pending',
        trigger,
    };
}

describe('schedule store', () => {
    it('parses and creates explicit schedule files', () => {
        const schedule = createSchedule();

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] });
        expect(createActionScheduleFile([schedule])).toEqual({ schedules: [schedule] });
    });

    it('rejects schedules with missing required fields', () => {
        expect(() => parseActionScheduleFile({ schedules: [{ id: 'schedule-1' }] })).toThrow('missing actionId');
    });

    it('parses project-wide schedules without a file target', () => {
        const schedule = { ...createSchedule(), context: { kind: 'project' } };

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] });
    });

    it('appends schedules through the validated file model', () => {
        const firstSchedule = createSchedule('schedule-1');
        const secondSchedule = createSchedule('schedule-2', { timestamp: '2026-07-06T12:00:00.000Z', type: 'at' });

        expect(appendActionSchedule([firstSchedule], secondSchedule)).toEqual([firstSchedule, secondSchedule]);
    });

    it('updates and cancels schedule status immutably', () => {
        const schedule = createSchedule();

        expect(updateActionScheduleStatus([schedule], 'schedule-1', 'running')).toEqual([{ ...schedule, status: 'running' }]);
        expect(cancelPendingActionSchedule([schedule], 'schedule-1')).toEqual([{ ...schedule, status: 'cancelled' }]);
    });

    it('finds pending schedules', () => {
        const pendingSchedule = createSchedule('schedule-1');
        const completedSchedule = { ...createSchedule('schedule-2'), status: 'completed' };

        expect(findPendingSchedule([pendingSchedule], 'schedule-1')).toEqual(pendingSchedule);
        expect([...pendingScheduleIds([pendingSchedule, completedSchedule])]).toEqual(['schedule-1']);
    });

    it('rejects unsupported trigger types', () => {
        const schedule = { ...createSchedule(), trigger: { type: 'agentSlot' } };

        expect(() => parseActionScheduleFile({ schedules: [schedule] })).toThrow('unsupported trigger type agentSlot');
    });
});
