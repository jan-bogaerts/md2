const crossSpawn = require('cross-spawn');
const { CLAUDE_USAGE_POLL_REASONS, logUsagePollFailure, usageScreenExcerpt } = require('./claude_usage_diagnostics');
const { parseClaudeUsageOutput } = require('./claude_usage_parsing');
const { createUtilityProcessTerminalPoll } = require('./claude_usage_terminal_host');

const CLAUDE_USAGE_POLL_COOLDOWN_MS = 120_000;
const CLAUDE_USAGE_MAX_OUTPUT_CHARS = 1_000_000;
// Claude with piped, non-TTY stdin does not run a slash command the way an interactive session
// does, so this attempt is a cheap long shot and gets a budget to match. The pty fallback carries
// the poll and must not have to share it: a cold Claude start alone can outlast this whole window.
const CLAUDE_USAGE_PROCESS_TIMEOUT_MS = 5_000;
const CLAUDE_USAGE_READY_TIMEOUT_MS = 30_000;
const CLAUDE_USAGE_REPORT_TIMEOUT_MS = 20_000;

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

/**
 * Runs Claude `/usage` after Claude output, with a two-minute maximum frequency.
 *
 * The plain-stdout attempt runs here; the pty fallback runs in a worker process, because node-pty
 * cannot be hosted in the main process without risking a native crash that ends the application.
 *
 * Every outcome without a usage report is written to the console exactly once, with the reason that
 * separates it from the other failure paths. A poll that says nothing is the outcome the user feels
 * as an account usage display that simply never fills in.
 */
class ClaudeUsagePoller {
    constructor(dependencies = {}) {
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.cooldownMs = dependencies.cooldownMs ?? CLAUDE_USAGE_POLL_COOLDOWN_MS;
        this.logFailure = dependencies.logFailure ?? logUsagePollFailure;
        this.now = dependencies.now ?? Date.now;
        this.onRuntimeEvent = dependencies.onRuntimeEvent;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.spawn = dependencies.spawn ?? crossSpawn;
        this.terminalPoll = dependencies.terminalPoll ?? createUtilityProcessTerminalPoll();
        this.readyTimeoutMs = dependencies.readyTimeoutMs ?? CLAUDE_USAGE_READY_TIMEOUT_MS;
        this.reportTimeoutMs = dependencies.reportTimeoutMs ?? CLAUDE_USAGE_REPORT_TIMEOUT_MS;
        this.processTimeoutMs = dependencies.processTimeoutMs ?? CLAUDE_USAGE_PROCESS_TIMEOUT_MS;
        this.abortTerminalPoll = null;
        this.activePoll = null;
        this.lastPollStartedAt = Number.NEGATIVE_INFINITY;
        this.pendingRequest = null;
        this.pendingTimer = null;
        this.stopped = false;
        if (typeof this.onRuntimeEvent !== 'function') throw new Error('Claude usage poller requires a runtime event listener');
    }

    requestPoll({
        cwd = process.cwd(),
        env = process.env,
        executable,
        observedAt = this.now(),
        onRuntimeEvent = this.onRuntimeEvent,
    } = {}) {
        if (typeof executable !== 'string' || executable.trim().length === 0) {
            throw new Error('Claude usage poll requires an executable');
        }
        if (this.stopped) return;
        if (typeof onRuntimeEvent !== 'function') throw new Error('Claude usage poll requires a runtime event listener');
        this.pendingRequest = { cwd, env, executable, observedAt, onRuntimeEvent };
        this.schedulePendingPoll();
    }

    stop() {
        this.stopped = true;
        this.pendingRequest = null;
        if (this.pendingTimer) this.clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
        // A worker left running past shutdown holds a pty open while Electron is already exiting.
        this.abortTerminalPoll?.();
        this.abortTerminalPoll = null;
    }

    schedulePendingPoll() {
        if (this.stopped || !this.pendingRequest || this.activePoll || this.pendingTimer) return;
        const delay = Math.max(0, this.cooldownMs - (this.now() - this.lastPollStartedAt));
        if (delay === 0) {
            const request = this.pendingRequest;
            this.pendingRequest = null;
            this.activePoll = this.runPendingPoll(request);
            return;
        }
        this.pendingTimer = this.setTimeout(() => {
            this.pendingTimer = null;
            this.schedulePendingPoll();
        }, delay);
    }

    async runPendingPoll(request) {
        try {
            await this.poll(request);
        } catch (error) {
            // A failing poll must never escape as an unhandled rejection; the next one retries.
            this.reportFailure(request, this.now(), {
                attempt: 'poll',
                error,
                reason: CLAUDE_USAGE_POLL_REASONS.runtimeListenerFailed,
            });
        }
        this.activePoll = null;
        this.schedulePendingPoll();
    }

    /** One console record per failed attempt, so a repeating failure cannot flood the console. */
    reportFailure(request, startedAt, { attempt, error, reason, screenExcerpt }) {
        this.logFailure({
            attempt,
            cwd: request.cwd,
            elapsedMs: this.now() - startedAt,
            error,
            executable: request.executable,
            reason,
            screenExcerpt,
        });
    }

    async poll(request) {
        const { observedAt, onRuntimeEvent } = request;
        const startedAt = this.now();
        this.lastPollStartedAt = startedAt;
        const attempt = await this.pollProcess(request, startedAt);
        if (this.stopped) return;
        if (attempt.payload) {
            await onRuntimeEvent({ kind: 'snapshot', observedAt, payload: attempt.payload });
            return;
        }
        if (attempt.unavailable) {
            await onRuntimeEvent({ kind: 'unavailable', observedAt });
            return;
        }
        const fallback = await this.pollTerminal(request, observedAt);
        if (!fallback.payload) {
            this.reportFailure(request, startedAt, {
                attempt: 'pty',
                error: fallback.error,
                // Shutdown cut this poll short, whatever the worker managed to report before it went.
                reason: this.stopped
                    ? CLAUDE_USAGE_POLL_REASONS.pollAborted
                    : (fallback.reason ?? CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker),
                screenExcerpt: fallback.screenExcerpt,
            });
        }
        if (this.stopped) return;
        if (fallback.unavailable) {
            await onRuntimeEvent({ kind: 'unavailable', observedAt });
            return;
        }
        // An inconclusive terminal fallback says nothing about Claude, so it reports neither usage nor unavailability.
        if (!fallback.payload) return;
        await onRuntimeEvent({ kind: 'snapshot', observedAt, payload: fallback.payload });
    }

    /** The plain-stdout attempt: cheap, usually fruitless, and until now completely undocumented when it failed. */
    async pollProcess(request, startedAt) {
        const { cwd, env, executable, observedAt } = request;
        try {
            const child = this.spawn(executable, [], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
            const { stdout } = await collectProcessOutput(child, {
                clearTimeout: this.clearTimeout,
                setTimeout: this.setTimeout,
                timeoutMs: this.processTimeoutMs,
            });
            // A usage report that arrived is worth keeping even when the exit itself failed or timed out.
            const payload = parseClaudeUsageOutput(stdout, observedAt);
            if (payload || this.stopped) return { payload, unavailable: false };
            this.reportFailure(request, startedAt, {
                attempt: 'stdout',
                reason: CLAUDE_USAGE_POLL_REASONS.stdoutUnparsed,
                screenExcerpt: usageScreenExcerpt(stdout),
            });

            return { payload: null, unavailable: false };
        } catch (error) {
            this.reportFailure(request, startedAt, {
                attempt: 'stdout',
                error,
                reason: CLAUDE_USAGE_POLL_REASONS.stdoutSpawnFailed,
            });

            return { payload: null, unavailable: true };
        }
    }

    /** Hands the pty attempt to a worker process, which reports usage, unavailability, or neither. */
    pollTerminal(pollRequest, observedAt) {
        const request = {
            cwd: pollRequest.cwd,
            env: { ...pollRequest.env },
            executable: pollRequest.executable,
            observedAt,
            readyTimeoutMs: this.readyTimeoutMs,
            reportTimeoutMs: this.reportTimeoutMs,
            timeoutMs: this.readyTimeoutMs + this.reportTimeoutMs,
        };

        return this.terminalPoll(request, {
            registerAbort: (abort) => {
                this.abortTerminalPoll = abort;
            },
        });
    }
}

module.exports = {
    CLAUDE_USAGE_POLL_COOLDOWN_MS,
    CLAUDE_USAGE_PROCESS_TIMEOUT_MS,
    CLAUDE_USAGE_READY_TIMEOUT_MS,
    CLAUDE_USAGE_REPORT_TIMEOUT_MS,
    ClaudeUsagePoller,
};
