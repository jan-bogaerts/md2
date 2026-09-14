import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const sharedScheduleContract = require('../../../../shared/action_schedules.mjs');
const {
    activeSchedules,
    appendActionSchedule,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    deleteScheduleRecord,
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
        kind: 'action',
        status: 'pending',
        trigger,
    };
}

describe('schedule store', () => {
    it('uses shared parser and serializer directly', () => {
        expect(parseActionScheduleFile).toBe(sharedScheduleContract.parseScheduleFile);
        expect(createActionScheduleFile).toBe(sharedScheduleContract.createScheduleFile);
    });

    it('parses and creates explicit schedule files', () => {
        const schedule = createSchedule();

        expect(parseActionScheduleFile({ schedules: [schedule] })).toEqual({ schedules: [schedule] });
        expect(createActionScheduleFile([schedule])).toEqual({ schedules: [schedule] });
    });

    it('rejects schedules with missing required fields', () => {
        expect(() => parseActionScheduleFile({ schedules: [{ id: 'schedule-1' }] })).toThrow('missing kind');
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

    it('filters active schedules and permanently removes one record', () => {
        const pendingSchedule = createSchedule('schedule-1');
        const runningSchedule = { ...createSchedule('schedule-2'), status: 'running' };
        const completedSchedule = { ...createSchedule('schedule-3'), status: 'completed' };

        expect(activeSchedules([pendingSchedule, runningSchedule, completedSchedule])).toEqual([
            pendingSchedule,
            runningSchedule,
        ]);
        expect(deleteScheduleRecord([pendingSchedule, completedSchedule], pendingSchedule.id)).toEqual([completedSchedule]);
        expect(() => deleteScheduleRecord([pendingSchedule], 'missing')).toThrow('Schedule not found: missing');
    });

    it('rejects unsupported trigger types', () => {
        const schedule = { ...createSchedule(), trigger: { type: 'agentSlot' } };

        expect(() => parseActionScheduleFile({ schedules: [schedule] })).toThrow('unsupported trigger type agentSlot');
    });
});
