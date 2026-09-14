const {
    ACTION_SCHEDULES_FILE,
    createScheduleFile: createActionScheduleFile,
    parseScheduleFile: parseActionScheduleFile,
} = require('../../../../shared/action_schedules.mjs');

function appendActionSchedule(schedules, schedule) {
    return createActionScheduleFile([...schedules, schedule]).schedules;
}

function findPendingSchedule(schedules, scheduleId) {
    const schedule = schedules.find((candidate) => candidate.id === scheduleId);
    if (!schedule || schedule.status !== 'pending') return null;

    return schedule;
}

function pendingScheduleIds(schedules) {
    return new Set(schedules
        .filter((schedule) => schedule.status === 'pending' && schedule.trigger.type === 'at')
        .map((schedule) => schedule.id));
}

function activeSchedules(schedules) {
    return schedules.filter(({ status }) => status === 'pending' || status === 'running');
}

function deleteScheduleRecord(schedules, scheduleId) {
    const schedule = schedules.find(({ id }) => id === scheduleId);
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`);

    return createActionScheduleFile(schedules.filter(({ id }) => id !== scheduleId)).schedules;
}

function updateActionScheduleStatus(schedules, scheduleId, status) {
    return createActionScheduleFile(schedules.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;

        return { ...schedule, status };
    })).schedules;
}

function cancelPendingActionSchedule(schedules, scheduleId) {
    const schedule = schedules.find((candidate) => candidate.id === scheduleId);
    if (!schedule) throw new Error(`Action schedule not found: ${scheduleId}`);
    if (schedule.status !== 'pending') throw new Error(`Cannot cancel action schedule with status ${schedule.status}`);

    return updateActionScheduleStatus(schedules, scheduleId, 'cancelled');
}

module.exports = {
    ACTION_SCHEDULES_FILE,
    activeSchedules,
    appendActionSchedule,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    deleteScheduleRecord,
    findPendingSchedule,
    parseActionScheduleFile,
    pendingScheduleIds,
    updateActionScheduleStatus,
};
