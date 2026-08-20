const crossSpawn = require('cross-spawn');
const { logAgentEvent } = require('./agent_file_logger');
const { parseClaudeUsageOutput } = require('./claude_usage_parsing');
const { createUtilityProcessTerminalPoll } = require('./claude_usage_terminal_host');

const CLAUDE_USAGE_POLL_COOLDOWN_MS = 120_000;
const CLAUDE_USAGE_MAX_OUTPUT_CHARS = 1_000_000;
const CLAUDE_USAGE_TERMINAL_TIMEOUT_MS = 20_000;

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
 */
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
        this.terminalPoll = dependencies.terminalPoll ?? createUtilityProcessTerminalPoll();
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
        // A worker left running past shutdown holds a pty open while Electron is already exiting.
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
            const { stdout } = await collectProcessOutput(child, {
                clearTimeout: this.clearTimeout,
                setTimeout: this.setTimeout,
                timeoutMs: this.processTimeoutMs,
            });
            // A usage report that arrived is worth keeping even when the exit itself failed or timed out.
            payload = parseClaudeUsageOutput(stdout, observedAt);
            if (this.stopped) return;
            if (!payload) {
                // Unparsed output is the one failure that leaves no trace anywhere else, so it is logged verbatim.
                logAgentEvent('[claude:usage-unparsed]', { observedAt, stdout });
                const fallback = await this.pollTerminal(executable, observedAt);
                if (fallback.unavailable) throw new Error('Claude usage terminal failed');
                payload = fallback.payload;
            }
        } catch {
            await this.onRuntimeEvent({ kind: 'unavailable', observedAt: this.now() });

            return;
        }
        // An inconclusive terminal fallback says nothing about Claude, so it reports neither usage nor unavailability.
        if (!payload) {
            logAgentEvent('[claude:usage-inconclusive]', { observedAt });

            return;
        }
        await this.onRuntimeEvent({ kind: 'snapshot', observedAt, payload });
    }

    /** Hands the pty attempt to a worker process, which reports usage, unavailability, or neither. */
    pollTerminal(executable, observedAt) {
        const request = {
            cwd: this.cwd,
            env: { ...this.env },
            executable,
            observedAt,
            timeoutMs: this.terminalTimeoutMs,
        };

        return this.terminalPoll(request, {
            registerAbort: (abort) => {
                this.abortTerminalPoll = abort;
            },
        });
    }
}

module.exports = { CLAUDE_USAGE_POLL_COOLDOWN_MS, ClaudeUsagePoller };
