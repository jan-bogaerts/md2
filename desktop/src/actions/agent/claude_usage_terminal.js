const nodePty = require('node-pty');
const { Terminal } = require('@xterm/headless');
const { parseClaudeUsageOutput } = require('./claude_usage_parsing');

const CLAUDE_USAGE_TERMINAL_COLUMNS = 140;
const CLAUDE_USAGE_TERMINAL_ROWS = 45;

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

function createHeadlessTerminal() {
    return new Terminal({
        allowProposedApi: true,
        cols: CLAUDE_USAGE_TERMINAL_COLUMNS,
        rows: CLAUDE_USAGE_TERMINAL_ROWS,
    });
}

/**
 * Drives one `/usage` poll through a real pty. Only the usage worker may call this: node-pty's
 * ConPTY layer can fault natively, which would end whichever process hosts it.
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
        registerAbort,
        setTimeout: setPollTimeout,
        timeoutMs: request.timeoutMs,
    });
}

module.exports = {
    CLAUDE_USAGE_TERMINAL_COLUMNS,
    CLAUDE_USAGE_TERMINAL_ROWS,
    runTerminalUsagePoll,
};
