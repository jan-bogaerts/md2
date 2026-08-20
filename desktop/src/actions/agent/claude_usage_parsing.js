const RESET_CLOCK_TOLERANCE_MS = 60_000;
const MONTHS = new Map([
    ['jan', 0], ['feb', 1], ['mar', 2], ['apr', 3], ['may', 4], ['jun', 5],
    ['jul', 6], ['aug', 7], ['sep', 8], ['oct', 9], ['nov', 10], ['dec', 11],
]);
const WINDOW_PATTERNS = [
    // Claude omits the minutes on a whole hour ("7pm"), so they are optional here.
    { id: 'five_hour', pattern: /^Current session:\s*(\d{1,3})% used\s*·\s*resets\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{1,2})(?::(\d{2}))?(am|pm)\s+\(([^)]+)\)\s*$/iu },
    { id: 'weekly', pattern: /^Current week \(all models\):\s*(\d{1,3})% used\s*·\s*resets\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{1,2})(?::(\d{2}))?(am|pm)\s+\(([^)]+)\)\s*$/iu },
];
const TERMINAL_WINDOW_DEFINITIONS = [
    { heading: 'Current session', id: 'five_hour' },
    { heading: 'Current week (all models)', id: 'weekly' },
];
const TERMINAL_RESET_PATTERN = /^(?:([A-Za-z]{3})\s+(\d{1,2}),\s+)?(\d{1,2})(?::(\d{2}))?(am|pm)\s+\(([^)]+)\)$/iu;

function datePartsInTimeZone(timestamp, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone,
        year: 'numeric',
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));

    return {
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        month: Number(parts.month) - 1,
        second: Number(parts.second),
        year: Number(parts.year),
    };
}

function matchingDateParts(left, right) {
    return left.day === right.day
        && left.hour === right.hour
        && left.minute === right.minute
        && left.month === right.month
        && left.year === right.year;
}

function localDateTimeToUnixMs(parts, timeZone) {
    const targetAsUtc = Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute);
    let timestamp = targetAsUtc;
    for (let index = 0; index < 3; index += 1) {
        const zoned = datePartsInTimeZone(timestamp, timeZone);
        const representedAsUtc = Date.UTC(zoned.year, zoned.month, zoned.day, zoned.hour, zoned.minute, zoned.second);
        timestamp = targetAsUtc - (representedAsUtc - timestamp);
    }
    if (!matchingDateParts(datePartsInTimeZone(timestamp, timeZone), parts)) throw new Error('Invalid Claude reset time');

    return timestamp;
}

function resetTimestamp(match, observedAt) {
    const [, , monthName, dayText, hourText, minuteText, meridiem, timeZone] = match;
    const month = MONTHS.get(monthName.toLowerCase());
    if (month === undefined) throw new Error('Invalid Claude reset month');
    const observedYear = datePartsInTimeZone(observedAt, timeZone).year;
    const hourValue = Number(hourText);
    if (hourValue < 1 || hourValue > 12) throw new Error('Invalid Claude reset hour');
    const hour = (hourValue % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
    const baseParts = { day: Number(dayText), hour, minute: Number(minuteText ?? 0), month };
    const candidates = [observedYear - 1, observedYear, observedYear + 1].map((year) => (
        localDateTimeToUnixMs({ ...baseParts, year }, timeZone)
    ));

    return candidates.reduce((nearest, candidate) => (
        Math.abs(candidate - observedAt) < Math.abs(nearest - observedAt) ? candidate : nearest
    ));
}

function terminalResetTimestamp(resetText, observedAt) {
    const match = TERMINAL_RESET_PATTERN.exec(resetText);
    if (!match) throw new Error('Invalid Claude reset time');
    const [, monthName, dayText, hourText, minuteText, meridiem, timeZone] = match;
    const observedParts = datePartsInTimeZone(observedAt, timeZone);
    const hourValue = Number(hourText);
    if (hourValue < 1 || hourValue > 12) throw new Error('Invalid Claude reset hour');
    const hour = (hourValue % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
    const minute = Number(minuteText ?? 0);
    if (!monthName) {
        const baseParts = { day: observedParts.day, hour, minute, month: observedParts.month, year: observedParts.year };
        const sameDay = localDateTimeToUnixMs(baseParts, timeZone);
        if (sameDay >= observedAt - RESET_CLOCK_TOLERANCE_MS) return sameDay;
        const nextDate = new Date(Date.UTC(baseParts.year, baseParts.month, baseParts.day + 1));

        return localDateTimeToUnixMs({
            day: nextDate.getUTCDate(),
            hour,
            minute,
            month: nextDate.getUTCMonth(),
            year: nextDate.getUTCFullYear(),
        }, timeZone);
    }
    const month = MONTHS.get(monthName.toLowerCase());
    if (month === undefined) throw new Error('Invalid Claude reset month');
    const baseParts = { day: Number(dayText), hour, minute, month };
    const candidates = [observedParts.year - 1, observedParts.year, observedParts.year + 1].map((year) => (
        localDateTimeToUnixMs({ ...baseParts, year }, timeZone)
    ));

    return candidates.reduce((nearest, candidate) => (
        Math.abs(candidate - observedAt) < Math.abs(nearest - observedAt) ? candidate : nearest
    ));
}

function parseTerminalWindow(lines, definition, observedAt) {
    const headingIndex = lines.findLastIndex((line) => line === definition.heading);
    if (headingIndex < 0) return null;
    const windowLines = lines.slice(headingIndex + 1, headingIndex + 5);
    const percentMatch = windowLines.map((line) => /(\d{1,3})% used\s*$/iu.exec(line)).find((match) => match !== null);
    const resetMatch = windowLines.map((line) => /^Resets\s+(.+)$/iu.exec(line)).find((match) => match !== null);
    if (!percentMatch || !resetMatch) return null;
    const usedPercent = Number(percentMatch[1]);
    if (!Number.isInteger(usedPercent) || usedPercent < 0 || usedPercent > 100) throw new Error('Invalid Claude usage percent');

    return { id: definition.id, resetsAt: terminalResetTimestamp(resetMatch[1], observedAt), usedPercent };
}

function parseTerminalUsageOutput(lines, observedAt) {
    const windows = TERMINAL_WINDOW_DEFINITIONS.map((definition) => parseTerminalWindow(lines, definition, observedAt));
    if (windows.some((window) => window === null)) return null;

    return { windows };
}

function parseClaudeUsageOutput(output, observedAt) {
    if (typeof output !== 'string' || !Number.isFinite(observedAt)) return null;
    const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
    const legacyLines = lines.map((line) => line.replace(/\u00C2\u00B7/gu, '\u00B7'));
    try {
        const windows = WINDOW_PATTERNS.map(({ id, pattern }) => {
            // A redrawn or repeated report restates the same window; the first line reported wins.
            const match = legacyLines.map((line) => pattern.exec(line)).find((candidate) => candidate !== null);
            if (!match) throw new Error('Missing Claude usage window');
            const usedPercent = Number(match[1]);
            if (!Number.isInteger(usedPercent) || usedPercent < 0 || usedPercent > 100) throw new Error('Invalid Claude usage percent');

            return { id, resetsAt: resetTimestamp(match, observedAt), usedPercent };
        });

        return { windows };
    } catch {
        try {
            return parseTerminalUsageOutput(lines, observedAt);
        } catch {
            return null;
        }
    }
}

module.exports = { parseClaudeUsageOutput };
