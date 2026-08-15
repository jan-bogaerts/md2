const crossSpawn = require('cross-spawn');

const CLAUDE_USAGE_POLL_COOLDOWN_MS = 120_000;
const MONTHS = new Map([
    ['jan', 0], ['feb', 1], ['mar', 2], ['apr', 3], ['may', 4], ['jun', 5],
    ['jul', 6], ['aug', 7], ['sep', 8], ['oct', 9], ['nov', 10], ['dec', 11],
]);
const WINDOW_PATTERNS = [
    { id: 'five_hour', pattern: /^Current session:\s*(\d{1,3})% used\s*·\s*resets\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})(am|pm)\s+\(([^)]+)\)\s*$/iu },
    { id: 'weekly', pattern: /^Current week \(all models\):\s*(\d{1,3})% used\s*·\s*resets\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})(am|pm)\s+\(([^)]+)\)\s*$/iu },
];

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
    const baseParts = { day: Number(dayText), hour, minute: Number(minuteText), month };
    const candidates = [observedYear - 1, observedYear, observedYear + 1].map((year) => (
        localDateTimeToUnixMs({ ...baseParts, year }, timeZone)
    ));

    return candidates.reduce((nearest, candidate) => (
        Math.abs(candidate - observedAt) < Math.abs(nearest - observedAt) ? candidate : nearest
    ));
}

function parseClaudeUsageOutput(output, observedAt) {
    if (typeof output !== 'string' || !Number.isFinite(observedAt)) return null;
    const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
    try {
        const windows = WINDOW_PATTERNS.map(({ id, pattern }) => {
            const matchingLines = lines.map((line) => pattern.exec(line)).filter((match) => match !== null);
            if (matchingLines.length !== 1) throw new Error('Missing Claude usage window');
            const match = matchingLines[0];
            const usedPercent = Number(match[1]);
            if (!Number.isInteger(usedPercent) || usedPercent < 0 || usedPercent > 100) throw new Error('Invalid Claude usage percent');

            return { id, resetsAt: resetTimestamp(match, observedAt), usedPercent };
        });

        return { windows };
    } catch {
        return null;
    }
}

function collectProcessOutput(child) {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let settled = false;
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        });
        child.on('close', (exitCode) => {
            if (settled) return;
            settled = true;
            resolve({ exitCode: exitCode ?? 1, stdout });
        });
        child.stdin.end('/usage\n');
    });
}

/** Runs Claude `/usage` after Claude output, with a two-minute maximum frequency. */
class ClaudeUsagePoller {
    constructor(dependencies = {}) {
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.cooldownMs = dependencies.cooldownMs ?? CLAUDE_USAGE_POLL_COOLDOWN_MS;
        this.cwd = dependencies.cwd ?? process.cwd();
        this.env = dependencies.env ?? process.env;
        this.executableResolver = dependencies.executableResolver;
        this.now = dependencies.now ?? Date.now;
        this.onRuntimeEvent = dependencies.onRuntimeEvent;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.spawn = dependencies.spawn ?? crossSpawn;
        this.activePoll = null;
        this.lastPollStartedAt = Number.NEGATIVE_INFINITY;
        this.pending = false;
        this.pendingTimer = null;
        this.stopped = false;
        if (!this.executableResolver) throw new Error('Claude usage poller requires an executable resolver');
        if (typeof this.onRuntimeEvent !== 'function') throw new Error('Claude usage poller requires a runtime event listener');
    }

    requestPoll() {
        if (this.stopped) return;
        this.pending = true;
        this.schedulePendingPoll();
    }

    stop() {
        this.stopped = true;
        this.pending = false;
        if (this.pendingTimer) this.clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
    }

    schedulePendingPoll() {
        if (this.stopped || !this.pending || this.activePoll || this.pendingTimer) return;
        const delay = Math.max(0, this.cooldownMs - (this.now() - this.lastPollStartedAt));
        if (delay === 0) {
            this.pending = false;
            this.activePoll = this.runPendingPoll();
            return;
        }
        this.pendingTimer = this.setTimeout(() => {
            this.pendingTimer = null;
            this.schedulePendingPoll();
        }, delay);
    }

    async runPendingPoll() {
        await this.poll();
        this.activePoll = null;
        this.schedulePendingPoll();
    }

    async poll() {
        this.lastPollStartedAt = this.now();
        const observedAt = this.now();
        try {
            const executable = await this.executableResolver.find('claude', { cwd: this.cwd, env: this.env }) ?? 'claude';
            const child = this.spawn(executable, [], { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
            const { exitCode, stdout } = await collectProcessOutput(child);
            if (exitCode !== 0) {
                this.onRuntimeEvent({ kind: 'unavailable', observedAt: this.now() });
                return;
            }
            const payload = parseClaudeUsageOutput(stdout, observedAt);
            if (payload) this.onRuntimeEvent({ kind: 'snapshot', observedAt, payload });
        } catch {
            this.onRuntimeEvent({ kind: 'unavailable', observedAt: this.now() });
        }
    }
}

module.exports = { CLAUDE_USAGE_POLL_COOLDOWN_MS, ClaudeUsagePoller, parseClaudeUsageOutput };
