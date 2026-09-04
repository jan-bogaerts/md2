const nodePty = require('node-pty');
const { Terminal } = require('@xterm/headless');
const { CLAUDE_USAGE_POLL_REASONS, usageScreenExcerpt } = require('./claude_usage_diagnostics');
const { parseClaudeUsageOutput } = require('./claude_usage_parsing');

const CLAUDE_USAGE_TERMINAL_COLUMNS = 140;
const CLAUDE_USAGE_TERMINAL_ROWS = 45;
// Verified against Claude Code 2.1.238 by running it under a pty in a folder it had never seen.
// The affirmative option is preselected, so a carriage return answers it; sending the digit instead
// would type a stray character into the prompt on any screen that only looked like this one.
const CLAUDE_USAGE_TRUST_MARKERS = ['Yes, I trust this folder', 'Accessing workspace:'];
const CLAUDE_USAGE_TRUST_ANSWER = '\r';
// Neither of these can be answered by a poller, so they end the poll instead of waiting out the deadline.
const CLAUDE_USAGE_LOGIN_MARKERS = ['Select login method:', 'Paste code here if prompted'];
const CLAUDE_USAGE_ONBOARDING_MARKERS = ['Choose the text style that looks best with your terminal'];

/** Reads the visible screen only; scanning the whole scrollback on every redraw stalls the host process. */
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

/** The line the cursor sits on; that is the only line an input prompt can be drawn on. */
function activeCursorLine(terminal) {
    const { active } = terminal.buffer;

    return active.getLine(active.baseY + active.cursorY)?.translateToString(true) ?? '';
}

// A settled Claude Code 2.1.241 prompt is an otherwise empty `> ` line under the cursor. A prompt
// holding typed text does not qualify: this poll owns a fresh Claude and expects an empty one.
function showsEmptyPrompt(terminal) {
    return activeCursorLine(terminal).trim() === '>';
}

// The phrases are kept as a secondary signal for Claude versions that print their welcome hint
// before the input prompt is drawn.
function terminalReady(terminal, output) {
    return showsEmptyPrompt(terminal) || output.includes('? for shortcuts') || output.includes('Try "');
}

function showsTrustScreen(output) {
    return CLAUDE_USAGE_TRUST_MARKERS.some((marker) => output.includes(marker));
}

/** Reports the reason for a screen that blocks the poll and cannot be answered on the user's behalf. */
function blockedScreenReason(output) {
    if (CLAUDE_USAGE_LOGIN_MARKERS.some((marker) => output.includes(marker))) {
        return CLAUDE_USAGE_POLL_REASONS.ptyLoginRequired;
    }
    if (CLAUDE_USAGE_ONBOARDING_MARKERS.some((marker) => output.includes(marker))) {
        return CLAUDE_USAGE_POLL_REASONS.ptyOnboardingRequired;
    }

    return null;
}

function collectTerminalUsage(processHandle, terminal, observedAt, dependencies) {
    const {
        clearTimeout: clearPollTimeout,
        registerAbort,
        reportTimeoutMs,
        readyTimeoutMs,
        setTimeout: setPollTimeout,
    } = dependencies;

    return new Promise((resolve, reject) => {
        let commandSent = false;
        let exited = false;
        let pendingExitCode = null;
        let pendingWrites = 0;
        let settled = false;
        let terminalDisposed = false;
        let trustAnswered = false;
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
        const finishWithoutUsage = (reason, screen) => finish({
            payload: null,
            reason,
            screenExcerpt: usageScreenExcerpt(screen ?? ''),
        });
        // The two waits have different expected durations, so each gets its own deadline; a single
        // one would leave the record unable to say which of them expired.
        const startReportDeadline = () => {
            clearPollTimeout(timeout);
            timeout = setPollTimeout(() => {
                const screen = terminalScreenText(terminal);
                const payload = parseClaudeUsageOutput(screen, observedAt);
                killProcess();
                if (payload) finish({ payload, reason: null, screenExcerpt: '' });
                else finishWithoutUsage(CLAUDE_USAGE_POLL_REASONS.ptyReportTimeout, screen);
            }, reportTimeoutMs);
        };
        const inspectScreen = () => {
            if (settled || exited) return;
            const output = terminalScreenText(terminal);
            if (!commandSent) {
                const blockedReason = blockedScreenReason(output);
                if (blockedReason) {
                    killProcess();
                    finishWithoutUsage(blockedReason, output);
                    return;
                }
                // Trust is asked once per folder and blocks every keystroke until answered. The poller
                // writes nothing here, and agents are about to run in this same folder anyway.
                if (!trustAnswered && showsTrustScreen(output)) {
                    trustAnswered = true;
                    if (!withLiveProcess(() => processHandle.write(CLAUDE_USAGE_TRUST_ANSWER))) {
                        finishWithoutUsage(CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker, output);
                    }
                    return;
                }
            }
            if (!commandSent && terminalReady(terminal, output)) {
                commandSent = true;
                if (!withLiveProcess(() => processHandle.write('/usage\r'))) {
                    finishWithoutUsage(CLAUDE_USAGE_POLL_REASONS.ptyReportTimeout, output);

                    return;
                }
                startReportDeadline();

                return;
            }
            if (!commandSent) return;
            const payload = parseClaudeUsageOutput(output, observedAt);
            if (!payload) return;
            killProcess();
            finish({ payload, reason: null, screenExcerpt: '' });
        };
        // The exit can arrive while xterm still has queued chunks, so the screen is only judged once they land.
        const settleExit = (exitCode) => {
            if (settled) return;
            if (pendingWrites > 0) {
                pendingExitCode = exitCode;
                return;
            }
            const screen = terminalScreenText(terminal);
            // A failed exit still counts when the screen holds a complete report; only a screen without one is a failure.
            const payload = parseClaudeUsageOutput(screen, observedAt);
            if (!payload && exitCode !== 0) {
                const error = new Error('Claude usage terminal failed');
                error.reason = CLAUDE_USAGE_POLL_REASONS.ptyFailed;
                error.screenExcerpt = usageScreenExcerpt(screen);
                finish(null, error);
                return;
            }
            if (payload) {
                finish({ payload, reason: null, screenExcerpt: '' });
                return;
            }
            // Claude ending on its own is a different fault before and after `/usage` went out.
            finishWithoutUsage(
                commandSent ? CLAUDE_USAGE_POLL_REASONS.ptyExitedWithoutReport : CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker,
                screen,
            );
        };
        registerAbort?.(() => {
            const screen = settled ? '' : terminalScreenText(terminal);
            killProcess();
            finishWithoutUsage(CLAUDE_USAGE_POLL_REASONS.pollAborted, screen);
        });
        dataSubscription = processHandle.onData((data) => {
            if (settled) return;
            pendingWrites += 1;
            terminal.write(data, () => {
                pendingWrites -= 1;
                inspectScreen();
                if (pendingExitCode !== null) settleExit(pendingExitCode);
                if (settled) disposeTerminal();
            });
        });
        exitSubscription = processHandle.onExit(({ exitCode }) => {
            exited = true;
            settleExit(exitCode);
        });
        timeout = setPollTimeout(() => {
            const screen = terminalScreenText(terminal);
            killProcess();
            // Answering trust and still not becoming ready is a different fault from never seeing the
            // screen at all, so it never triggers a second keystroke and never shares a reason.
            const reason = trustAnswered && showsTrustScreen(screen)
                ? CLAUDE_USAGE_POLL_REASONS.ptyTrustScreenUnanswered
                : CLAUDE_USAGE_POLL_REASONS.ptyNoReadyMarker;
            finishWithoutUsage(reason, screen);
        }, readyTimeoutMs);
    });
}

function createHeadlessTerminal() {
    return new Terminal({
        allowProposedApi: true,
        cols: CLAUDE_USAGE_TERMINAL_COLUMNS,
        rows: CLAUDE_USAGE_TERMINAL_ROWS,
    });
}

/**
 * Drives one `/usage` poll through a real pty and resolves with `{ payload, reason, screenExcerpt }`.
 * Only the usage worker may call this: node-pty's ConPTY layer can fault natively, which would end
 * whichever process hosts it.
 */
function runTerminalUsagePoll(request, dependencies = {}) {
    const {
        clearTimeout: clearPollTimeout = clearTimeout,
        ptySpawn = nodePty.spawn,
        registerAbort,
        setTimeout: setPollTimeout = setTimeout,
        terminalFactory = createHeadlessTerminal,
    } = dependencies;
    const processHandle = ptySpawn(request.executable, [], {
        cols: CLAUDE_USAGE_TERMINAL_COLUMNS,
        cwd: request.cwd,
        env: request.env,
        rows: CLAUDE_USAGE_TERMINAL_ROWS,
    });

    return collectTerminalUsage(processHandle, terminalFactory(), request.observedAt, {
        clearTimeout: clearPollTimeout,
        readyTimeoutMs: request.readyTimeoutMs,
        registerAbort,
        reportTimeoutMs: request.reportTimeoutMs,
        setTimeout: setPollTimeout,
    });
}

module.exports = {
    CLAUDE_USAGE_LOGIN_MARKERS,
    CLAUDE_USAGE_ONBOARDING_MARKERS,
    CLAUDE_USAGE_TERMINAL_COLUMNS,
    CLAUDE_USAGE_TERMINAL_ROWS,
    CLAUDE_USAGE_TRUST_ANSWER,
    CLAUDE_USAGE_TRUST_MARKERS,
    runTerminalUsagePoll,
};
