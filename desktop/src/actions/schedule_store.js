const ACTION_SCHEDULES_FILE = '.md2-schedules.json'
const ACTION_SCHEDULE_STATUSES = ['cancelled', 'completed', 'failed', 'pending', 'running']
const ACTION_CONTEXT_KINDS = ['card', 'file', 'folder', 'project']

function requireScheduleObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid action schedule file: ${fieldName} must be an object`)

    return value
}

function requireScheduleString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid action schedule file: missing ${fieldName}`)

    return value
}

function parseScheduleStatus(value) {
    const status = requireScheduleString(value, 'status')
    if (!ACTION_SCHEDULE_STATUSES.includes(status)) throw new Error(`Invalid action schedule file: unsupported status ${status}`)

    return status
}

function parseScheduleContext(value) {
    const context = requireScheduleObject(value, 'context')
    const kind = requireScheduleString(context.kind, 'context.kind')
    if (!ACTION_CONTEXT_KINDS.includes(kind)) throw new Error(`Invalid action schedule file: unsupported context kind ${kind}`)

    const parsedContext = { kind }
    for (const [key, contextValue] of Object.entries(context)) {
        if (key === 'kind') continue
        if (typeof contextValue !== 'string') throw new Error(`Invalid action schedule file: context.${key} must be a string`)

        parsedContext[key] = contextValue
    }

    return parsedContext
}

function parseScheduleTrigger(value) {
    const trigger = requireScheduleObject(value, 'trigger')
    const type = requireScheduleString(trigger.type, 'trigger.type')

    if (type === 'at') return { timestamp: requireScheduleString(trigger.timestamp, 'trigger.timestamp'), type }
    if (type === 'agentSlot') return { type }
    if (type === 'afterAction') return { actionId: requireScheduleString(trigger.actionId, 'trigger.actionId'), type }

    throw new Error(`Invalid action schedule file: unsupported trigger type ${type}`)
}

function parseActionSchedule(value) {
    const schedule = requireScheduleObject(value, 'schedule')

    return {
        actionId: requireScheduleString(schedule.actionId, 'actionId'),
        context: parseScheduleContext(schedule.context),
        createdAt: requireScheduleString(schedule.createdAt, 'createdAt'),
        id: requireScheduleString(schedule.id, 'id'),
        status: parseScheduleStatus(schedule.status),
        trigger: parseScheduleTrigger(schedule.trigger),
    }
}

function parseActionScheduleFile(value) {
    const file = requireScheduleObject(value, 'root')
    if (!Array.isArray(file.schedules)) throw new Error('Invalid action schedule file: schedules must be an array')

    return { schedules: file.schedules.map((schedule) => parseActionSchedule(schedule)) }
}

function createActionScheduleFile(schedules) {
    return parseActionScheduleFile({ schedules })
}

function appendActionSchedule(schedules, schedule) {
    return createActionScheduleFile([...schedules, schedule]).schedules
}

function findPendingSchedule(schedules, scheduleId) {
    const schedule = schedules.find((candidate) => candidate.id === scheduleId)
    if (!schedule || schedule.status !== 'pending') return null

    return schedule
}

function pendingScheduleIds(schedules) {
    return new Set(schedules.filter((schedule) => schedule.status === 'pending').map((schedule) => schedule.id))
}

function pendingAfterActionSchedules(schedules, actionId) {
    return schedules.filter((schedule) => (
        schedule.status === 'pending'
        && schedule.trigger.type === 'afterAction'
        && schedule.trigger.actionId === actionId
    ))
}

function updateActionScheduleStatus(schedules, scheduleId, status) {
    parseScheduleStatus(status)

    return createActionScheduleFile(schedules.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule

        return { ...schedule, status }
    })).schedules
}

function cancelPendingActionSchedule(schedules, scheduleId) {
    const schedule = schedules.find((candidate) => candidate.id === scheduleId)
    if (!schedule) throw new Error(`Action schedule not found: ${scheduleId}`)
    if (schedule.status !== 'pending') throw new Error(`Cannot cancel action schedule with status ${schedule.status}`)

    return updateActionScheduleStatus(schedules, scheduleId, 'cancelled')
}

module.exports = {
    ACTION_SCHEDULES_FILE,
    appendActionSchedule,
    cancelPendingActionSchedule,
    createActionScheduleFile,
    findPendingSchedule,
    parseActionScheduleFile,
    pendingAfterActionSchedules,
    pendingScheduleIds,
    updateActionScheduleStatus,
}
