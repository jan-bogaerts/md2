const { CLAUDE_USAGE_POLL_REASONS } = require('./claude_usage_diagnostics');
const { runTerminalUsagePoll } = require('./claude_usage_terminal');

/**
 * Electron utility-process entry for a single pty-backed `/usage` poll.
 *
 * node-pty drives Claude through a real ConPTY, whose native layer faults on teardown races that
 * no JavaScript guard can intercept. Run in the main process that fault ends the application; run
 * here it ends a disposable worker, and the parent reads the silent exit as a failed poll.
 */
async function pollUsage(request) {
    try {
        const { payload, reason, screenExcerpt } = await runTerminalUsagePoll(request);

        return { payload, reason, screenExcerpt, unavailable: false };
    } catch (error) {
        // Claude could not be started or ended in failure, which is the parent's cue to mark it
        // unavailable. The reason and screen travel with it so the parent can say which it was.
        return {
            error: error?.message,
            payload: null,
            reason: error?.reason ?? CLAUDE_USAGE_POLL_REASONS.ptyFailed,
            screenExcerpt: error?.screenExcerpt ?? '',
            unavailable: true,
        };
    }
}

function listenForPollRequests(parentPort) {
    if (!parentPort) return;
    parentPort.on('message', async ({ data }) => {
        const result = await pollUsage(data);
        try {
            parentPort.postMessage({ result });
        } catch {
            // The parent stopped waiting and tore this worker down.
        }
    });
}

listenForPollRequests(process.parentPort);

module.exports = { listenForPollRequests, pollUsage };
