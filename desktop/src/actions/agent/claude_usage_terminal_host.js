const { CLAUDE_USAGE_POLL_REASONS } = require('./claude_usage_diagnostics');

const CLAUDE_USAGE_SERVICE_NAME = 'claude-usage';
const CLAUDE_USAGE_WORKER_GRACE_MS = 5_000;

/**
 * A worker that dies, hangs or is aborted says nothing about Claude itself, so it reports neither
 * usage nor unavailability. The reason still separates those cases: without it, a fork failure, a
 * native ConPTY fault and a shutdown abort all look identical downstream.
 */
function inconclusiveResult(reason, error = null) {
    return {
        error: error instanceof Error ? error.message : undefined,
        payload: null,
        reason,
        screenExcerpt: '',
        unavailable: false,
    };
}

/**
 * Runs one pty-backed `/usage` poll in an Electron utility process and resolves with the worker's
 * `{ payload, reason, screenExcerpt, unavailable }` result, or an inconclusive one carrying the
 * reason the worker never reported back.
 *
 * The pty is hosted out of process because node-pty's ConPTY layer faults natively on teardown
 * races: a native fault cannot be caught in JavaScript, so in the main process it would take
 * Electron down. Here the worst case is a lost poll, and the next one starts from a clean process.
 */
function createUtilityProcessTerminalPoll(dependencies = {}) {
    const clearPollTimeout = dependencies.clearTimeout ?? clearTimeout;
    const loadUtilityProcess = dependencies.loadUtilityProcess ?? (() => require('electron').utilityProcess);
    const setPollTimeout = dependencies.setTimeout ?? setTimeout;
    const workerPath = dependencies.workerPath ?? require.resolve('./claude_usage_terminal_worker');

    return (request, { registerAbort } = {}) => new Promise((resolve) => {
        let worker = null;
        let settled = false;
        let timeout = null;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearPollTimeout(timeout);
            registerAbort?.(null);
            try {
                worker?.kill();
            } catch {
                // The worker is already gone.
            }
            resolve(result);
        };
        try {
            // Claude's own output travels over the pty, so inherited stdio carries only worker faults worth seeing.
            worker = loadUtilityProcess().fork(workerPath, [], { serviceName: CLAUDE_USAGE_SERVICE_NAME, stdio: 'inherit' });
        } catch (error) {
            finish(inconclusiveResult(CLAUDE_USAGE_POLL_REASONS.workerForkFailed, error));

            return;
        }
        registerAbort?.(() => finish(inconclusiveResult(CLAUDE_USAGE_POLL_REASONS.pollAborted)));
        worker.on('message', (message) => finish(message?.result
            ?? inconclusiveResult(CLAUDE_USAGE_POLL_REASONS.workerExitedWithoutReply)));
        // A native ConPTY fault reaches the parent as an exit without a reply, so it costs one poll and nothing more.
        worker.on('exit', () => finish(inconclusiveResult(CLAUDE_USAGE_POLL_REASONS.workerExitedWithoutReply)));
        worker.on('spawn', () => worker.postMessage(request));
        // The worker enforces its own deadlines; this one only covers a worker that never reports back.
        timeout = setPollTimeout(
            () => finish(inconclusiveResult(CLAUDE_USAGE_POLL_REASONS.hostDeadline)),
            request.timeoutMs + CLAUDE_USAGE_WORKER_GRACE_MS,
        );
    });
}

module.exports = { CLAUDE_USAGE_WORKER_GRACE_MS, createUtilityProcessTerminalPoll, inconclusiveResult };
