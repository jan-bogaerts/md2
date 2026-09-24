function padDurationPart(value: number) {
    return value.toString().padStart(2, '0')
}

/** Formats an elapsed millisecond span as `m:ss`, or `h:mm:ss` past an hour. */
export function formatDuration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3600)

    if (hours > 0) return `${hours}:${padDurationPart(minutes)}:${padDurationPart(seconds)}`

    return `${minutes}:${padDurationPart(seconds)}`
}
