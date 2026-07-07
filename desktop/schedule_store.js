function createScheduleId() {
    return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createRegisteredSchedule(request) {
    const createdAt = new Date().toISOString()

    return { ...request, createdAt, id: createScheduleId(), status: 'pending' }
}

function replaceScheduleStatus(schedules, scheduleId, status) {
    return schedules.map((schedule) => (schedule.id === scheduleId ? { ...schedule, status } : schedule))
}

function cancelPendingSchedule(schedules, scheduleId) {
    const schedule = schedules.find((candidate) => candidate.id === scheduleId)
    if (!schedule) throw new Error(`Action schedule not found: ${scheduleId}`)
    if (schedule.status !== 'pending') throw new Error(`Cannot cancel action schedule with status ${schedule.status}`)

    return replaceScheduleStatus(schedules, scheduleId, 'cancelled')
}

module.exports = { cancelPendingSchedule, createRegisteredSchedule, replaceScheduleStatus }
