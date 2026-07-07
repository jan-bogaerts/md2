const { pendingScheduleIds } = require('./schedule_store')

const MAX_TIMER_DELAY_MS = 2147483647

function combineOutput(result) {
    return `${result.stdout}${result.stderr}`
}

function cancelScheduleTimer(timers, scheduleId, clearTimeout) {
    const timer = timers.get(scheduleId)
    if (timer) clearTimeout(timer)
    timers.delete(scheduleId)
}

function clearScheduleTimers(timers, clearTimeout) {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
}

function registerAtScheduleTimer(schedule, timestamp, dependencies) {
    const fireAt = Date.parse(timestamp)
    if (Number.isNaN(fireAt)) {
        void dependencies.failSchedule(schedule, `Invalid action schedule timestamp: ${timestamp}`)
        return
    }

    const delay = Math.min(Math.max(fireAt - dependencies.now(), 0), MAX_TIMER_DELAY_MS)
    const timer = dependencies.setTimeout(() => {
        void dependencies.fireSchedule(schedule.id)
    }, delay)
    dependencies.timers.set(schedule.id, timer)
}

async function registerAgentSlotScheduleTimer(schedule, dependencies) {
    const command = dependencies.agentSlotCommandProvider()
    if (typeof command !== 'string' || command.length === 0) {
        await dependencies.failSchedule(schedule, 'Missing desktop.agentSlotCommand for agentSlot action schedule')
        return
    }

    const result = await dependencies.commandRunner(command, dependencies.rootPath)
    if (result.exitCode !== 0) {
        await dependencies.failSchedule(schedule, `Agent slot command failed with exit code ${result.exitCode}: ${combineOutput(result)}`)
        return
    }

    const timestamp = result.stdout.trim()
    if (Number.isNaN(Date.parse(timestamp))) {
        await dependencies.failSchedule(schedule, `Agent slot command did not output a valid timestamp: ${timestamp}`)
        return
    }

    registerAtScheduleTimer(schedule, timestamp, dependencies)
}

async function registerPendingScheduleTimer(schedule, dependencies) {
    if (schedule.trigger.type === 'afterAction') return
    if (schedule.trigger.type === 'agentSlot') {
        await registerAgentSlotScheduleTimer(schedule, dependencies)
        return
    }

    if (schedule.trigger.type !== 'at') throw new Error(`Unsupported action schedule trigger: ${schedule.trigger.type}`)

    registerAtScheduleTimer(schedule, schedule.trigger.timestamp, dependencies)
}

async function reconcileScheduleTimers(schedules, dependencies) {
    const activeScheduleIds = pendingScheduleIds(schedules)

    for (const [scheduleId, timer] of dependencies.timers.entries()) {
        if (activeScheduleIds.has(scheduleId)) continue
        dependencies.clearTimeout(timer)
        dependencies.timers.delete(scheduleId)
    }

    for (const schedule of schedules) {
        if (schedule.status !== 'pending') continue
        if (dependencies.timers.has(schedule.id)) continue
        await registerPendingScheduleTimer(schedule, dependencies)
    }
}

module.exports = {
    cancelScheduleTimer,
    clearScheduleTimers,
    reconcileScheduleTimers,
    registerPendingScheduleTimer,
}
