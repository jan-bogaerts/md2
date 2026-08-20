const crossSpawn = require('cross-spawn');
const nodePty = require('node-pty');
const { Terminal } = require('@xterm/headless');

const CLAUDE_USAGE_POLL_COOLDOWN_MS = 120_000;
const CLAUDE_USAGE_MAX_OUTPUT_CHARS = 1_000_000;
const CLAUDE_USAGE_TERMINAL_COLUMNS = 140;
const CLAUDE_USAGE_TERMINAL_ROWS = 45;
const CLAUDE_USAGE_TERMINAL_TIMEOUT_MS = 20_000;
const RESET_CLOCK_TOLERANCE_MS = 60_000;
const MONTHS = new Map([
    ['jan', 0], ['feb', 1], ['mar', 2], ['apr', 3], ['may', 4], ['jun', 5],
    ['jul', 6], ['aug', 7], ['sep', 8], ['oct', 9], ['nov', 10], ['dec', 11],
]);
const WINDOW_PATTERNS = [
    { id: 'five_hour', pattern: /^Current session:\s*(\d{1,3})% used\s*·\s*resets\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})(am|pm)\s+\(([^)]+)\)\s*$/iu },
    { id: 'weekly', pattern: /^Current week \(all models\):\s*(\d{1,3})% used\s*·\s*resets\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})(am|pm)\s+\(([^)]+)\)\s*$/iu },
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
    const baseParts = { day: Number(dayText), hour, minute: Number(minuteText), month };
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
            const matchingLines = legacyLines.map((line) => pattern.exec(line)).filter((match) => match !== null);
            if (matchingLines.length !== 1) throw new Error('Missing Claude usage window');
            const match = matchingLines[0];
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

function collectProcessOutput(child, dependencies) {
    const { clearTimeout: clearPollTimeout, setTimeout: setPollTimeout, timeoutMs } = dependencies;

    return new Promise((resolve, reject) => {
        let stdout = '';
        let settled = false;
        let timeout;
        const finish = (result, error = null) => {
            if (settled) return;
            settled = true;
            clearPollTimeout(timeout);
            if (error) reject(error);
            else resolve(result);
        };
        // Pipe errors (EPIPE when Claude exits before reading stdin) reach no listener otherwise,
        // and an unhandled stream error takes the Electron main process down.
        const ignoreStreamError = () => {};
        child.stdin?.on('error', ignoreStreamError);
        child.stdout?.on('error', ignoreStreamError);
        child.stderr?.on('error', ignoreStreamError);
        child.stdout?.on('data', (chunk) => {
            if (stdout.length >= CLAUDE_USAGE_MAX_OUTPUT_CHARS) return;
            stdout += chunk.toString();
        });
        child.stderr?.resume(); // Unread stderr fills its pipe buffer and blocks Claude forever.
        child.on('error', (error) => finish(null, error));
        child.on('close', (exitCode) => finish({ exitCode: exitCode ?? 1, stdout }));
        timeout = setPollTimeout(() => {
            try {
                child.kill();
            } catch {
                // The child is already gone.
            }
            finish({ exitCode: 1, stdout });
        }, timeoutMs);
        child.stdin?.end('/usage\n');
    });
}

/** Reads the visible screen only; scanning the whole scrollback on every redraw stalls the main process. */
function terminalScreenText(terminal) {
    const lines = [];
    const { active } = terminal.buffer;
    const start = Math.max(0, active.baseY);
    const end = Math.min(active.length, start + (terminal.rows ?? CLAUDE_USAGE_TERMINAL_ROWS));
    for (let index = start; index < end; index += 1) {
        const line = active.getLine(index)?.translateToString(true);
        if (line) lines.push(line);
    }

    return lines.join('\n');
}

function terminalReady(output) {
    return output.includes('? for shortcuts') || output.includes('Try "');
}

function collectTerminalUsage(processHandle, terminal, observedAt, dependencies) {
    const { clearTimeout: clearPollTimeout, registerAbort, setTimeout: setPollTimeout, timeoutMs } = dependencies;

    return new Promise((resolve, reject) => {
        let commandSent = false;
        let exited = false;
        let pendingWrites = 0;
        let settled = false;
        let terminalDisposed = false;
        let dataSubscription;
        let exitSubscription;
        let timeout;
        // node-pty exposes no liveness check and its Windows agent faults natively when a pty is
        // killed or written after its process ended, so both go through this guard. `onExit` can
        // still be in flight, hence the try/catch on top of the flag.
        const withLiveProcess = (action) => {
            if (exited) return false;
            try {
                action();

                return true;
            } catch {
                exited = true;

                return false;
            }
        };
        const killProcess = () => {
            withLiveProcess(() => processHandle.kill());
            exited = true;
        };
        // xterm flushes writes in chunks; disposing while chunks are queued runs the rest of the
        // flush against a disposed terminal, so disposal waits for the write buffer to drain.
        const disposeTerminal = () => {
            if (terminalDisposed || pendingWrites > 0) return;
            terminalDisposed = true;
            terminal.dispose();
        };
        const finish = (result, error = null) => {
            if (settled) return;
            settled = true;
            clearPollTimeout(timeout);
            registerAbort?.(null);
            dataSubscription?.dispose();
            exitSubscription?.dispose();
            disposeTerminal();
            if (error) reject(error);
            else resolve(result);
        };
        const inspectScreen = () => {
            if (settled || exited) return;
            const output = terminalScreenText(terminal);
            if (!commandSent && terminalReady(output)) {
                commandSent = true;
                if (!withLiveProcess(() => processHandle.write('/usage\r'))) finish(null);
                return;
            }
            if (!commandSent) return;
            const payload = parseClaudeUsageOutput(output, observedAt);
            if (!payload) return;
            killProcess();
            finish(payload);
        };
        registerAbort?.(() => {
            killProcess();
            finish(null);
        });
        dataSubscription = processHandle.onData((data) => {
            if (settled) return;
            pendingWrites += 1;
            terminal.write(data, () => {
                pendingWrites -= 1;
                inspectScreen();
                if (settled) disposeTerminal();
            });
        });
        exitSubscription = processHandle.onExit(({ exitCode }) => {
            exited = true;
            if (settled) return;
            if (exitCode !== 0) {
                finish(null, new Error('Claude usage terminal failed'));
                return;
            }
            finish(parseClaudeUsageOutput(terminalScreenText(terminal), observedAt));
        });
        timeout = setPollTimeout(() => {
            killProcess();
            finish(null);
        }, timeoutMs);
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
        this.ptySpawn = dependencies.ptySpawn ?? nodePty.spawn;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.spawn = dependencies.spawn ?? crossSpawn;
        this.terminalFactory = dependencies.terminalFactory ?? (() => new Terminal({
            allowProposedApi: true,
            cols: CLAUDE_USAGE_TERMINAL_COLUMNS,
            rows: CLAUDE_USAGE_TERMINAL_ROWS,
        }));
        this.terminalTimeoutMs = dependencies.terminalTimeoutMs ?? CLAUDE_USAGE_TERMINAL_TIMEOUT_MS;
        this.processTimeoutMs = dependencies.processTimeoutMs ?? this.terminalTimeoutMs;
        this.abortTerminalPoll = null;
        this.activePoll = null;
        this.lastPollStartedAt = Number.NEGATIVE_INFINITY;
        this.pending = false;
        this.pendingTimer = null;
        this.stopped = false;
        if (!this.executableResolver) throw new Error('Claude usage poller requires an executable resolver');
        if (typeof this.onRuntimeEvent !== 'function') throw new Error('Claude usage poller requires a runtime event listener');
    }

    requestPoll({ cwd, env } = {}) {
        if (this.stopped) return;
        if (cwd) this.cwd = cwd;
        if (env) this.env = env;
        this.pending = true;
        this.schedulePendingPoll();
    }

    stop() {
        this.stopped = true;
        this.pending = false;
        if (this.pendingTimer) this.clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
        // A pty left running past shutdown tears down natively while Electron is already exiting.
        this.abortTerminalPoll?.();
        this.abortTerminalPoll = null;
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
        try {
            await this.poll();
        } catch {
            // A failing poll must never escape as an unhandled rejection; the next one retries.
        }
        this.activePoll = null;
        this.schedulePendingPoll();
    }

    async poll() {
        this.lastPollStartedAt = this.now();
        const observedAt = this.now();
        let payload = null;
        try {
            const executable = await this.executableResolver.find('claude', { cwd: this.cwd, env: this.env }) ?? 'claude';
            const child = this.spawn(executable, [], { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
            const { exitCode, stdout } = await collectProcessOutput(child, {
                clearTimeout: this.clearTimeout,
                setTimeout: this.setTimeout,
                timeoutMs: this.processTimeoutMs,
            });
            payload = exitCode === 0 ? parseClaudeUsageOutput(stdout, observedAt) : null;
            if (this.stopped) return;
            if (!payload) payload = await this.pollTerminal(executable, observedAt);
        } catch {
            await this.onRuntimeEvent({ kind: 'unavailable', observedAt: this.now() });

            return;
        }
        if (payload) await this.onRuntimeEvent({ kind: 'snapshot', observedAt, payload });
    }

    async pollTerminal(executable, observedAt) {
        const processHandle = this.ptySpawn(executable, [], {
            cols: CLAUDE_USAGE_TERMINAL_COLUMNS,
            cwd: this.cwd,
            env: this.env,
            rows: CLAUDE_USAGE_TERMINAL_ROWS,
        });
        const terminal = this.terminalFactory();

        return collectTerminalUsage(processHandle, terminal, observedAt, {
            clearTimeout: this.clearTimeout,
            registerAbort: (abort) => {
                this.abortTerminalPoll = abort;
            },
            setTimeout: this.setTimeout,
            timeoutMs: this.terminalTimeoutMs,
        });
    }
}

module.exports = { CLAUDE_USAGE_POLL_COOLDOWN_MS, ClaudeUsagePoller, parseClaudeUsageOutput };
