const { pendingTimedScheduleIds } = require('./schedule_store');

const MAX_TIMER_DELAY_MS = 2147483647;

function cancelScheduleTimer(timers, scheduleId, clearTimeout) {
    const timer = timers.get(scheduleId);
    if (timer) clearTimeout(timer);
    timers.delete(scheduleId);
}

function clearScheduleTimers(timers, clearTimeout) {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
}

function createScheduleTimerCallback(schedule, fireAt, dependencies) {
    return () => {
        if (fireAt > dependencies.now()) {
            registerAtScheduleTimer(schedule, new Date(fireAt).toISOString(), dependencies);
            return;
        }

        void dependencies.fireSchedule(schedule.id);
    };
}

function registerAtScheduleTimer(schedule, timestamp, dependencies) {
    const fireAt = Date.parse(timestamp);
    if (Number.isNaN(fireAt)) {
        void dependencies.failSchedule(schedule, `Invalid action schedule timestamp: ${timestamp}`);
        return;
    }
    const delay = Math.min(Math.max(fireAt - dependencies.now(), 0), MAX_TIMER_DELAY_MS);
    const callback = createScheduleTimerCallback(schedule, fireAt, dependencies);
    const timer = dependencies.setTimeout(callback, delay);
    dependencies.timers.set(schedule.id, timer);
}

function registerPendingScheduleTimer(schedule, dependencies) {
    if (schedule.trigger.type === 'at') {
        registerAtScheduleTimer(schedule, schedule.trigger.timestamp, dependencies);
        return;
    }
    if (schedule.trigger.type === 'account-reset') {
        registerAtScheduleTimer(schedule, schedule.trigger.expectedResetAt, dependencies);
        return;
    }

    throw new Error(`Unsupported timed action schedule trigger: ${schedule.trigger.type}`);
}

function reconcileScheduleTimers(schedules, dependencies) {
    const activeScheduleIds = pendingTimedScheduleIds(schedules);

    for (const [scheduleId, timer] of dependencies.timers.entries()) {
        if (activeScheduleIds.has(scheduleId)) continue;
        dependencies.clearTimeout(timer);
        dependencies.timers.delete(scheduleId);
    }

    for (const schedule of schedules) {
        if (schedule.status !== 'pending') continue;
        if (schedule.trigger.type !== 'at' && schedule.trigger.type !== 'account-reset') continue;
        if (dependencies.timers.has(schedule.id)) continue;
        registerPendingScheduleTimer(schedule, dependencies);
    }
}

module.exports = {
    cancelScheduleTimer,
    clearScheduleTimers,
    reconcileScheduleTimers,
    registerPendingScheduleTimer,
};
