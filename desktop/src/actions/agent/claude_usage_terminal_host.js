const CLAUDE_USAGE_SERVICE_NAME = 'claude-usage';
const CLAUDE_USAGE_WORKER_GRACE_MS = 5_000;
// A worker that dies, hangs or is aborted says nothing about Claude itself, so it reports neither usage nor unavailability.
const INCONCLUSIVE_RESULT = Object.freeze({ payload: null, unavailable: false });

/**
 * Runs one pty-backed `/usage` poll in an Electron utility process and resolves with the worker's
 * `{ payload, unavailable }` result, or an inconclusive one when the worker never reports back.
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
        } catch {
            finish(INCONCLUSIVE_RESULT);

            return;
        }
        registerAbort?.(() => finish(INCONCLUSIVE_RESULT));
        worker.on('message', (message) => finish(message?.result ?? INCONCLUSIVE_RESULT));
        // A native ConPTY fault reaches the parent as an exit without a reply, so it costs one poll and nothing more.
        worker.on('exit', () => finish(INCONCLUSIVE_RESULT));
        worker.on('spawn', () => worker.postMessage(request));
        // The worker enforces its own deadline; this one only covers a worker that never reports back.
        timeout = setPollTimeout(() => finish(INCONCLUSIVE_RESULT), request.timeoutMs + CLAUDE_USAGE_WORKER_GRACE_MS);
    });
}

module.exports = { CLAUDE_USAGE_WORKER_GRACE_MS, INCONCLUSIVE_RESULT, createUtilityProcessTerminalPoll };
