const MAX_TIMER_DELAY_MS = 2147483647

function delayForTimestamp(timestamp) {
    return Math.max(0, new Date(timestamp).getTime() - Date.now())
}

function canRegisterTimer(trigger) {
    return trigger.type === 'at'
}

function registerScheduleTimer(schedule, onFire) {
    if (!canRegisterTimer(schedule.trigger)) return null

    const delayMs = delayForTimestamp(schedule.trigger.timestamp)
    if (delayMs > MAX_TIMER_DELAY_MS) return null

    return setTimeout(() => onFire(schedule.id), delayMs)
}

module.exports = { canRegisterTimer, delayForTimestamp, registerScheduleTimer }
