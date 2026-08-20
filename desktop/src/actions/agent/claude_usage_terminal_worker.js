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
        return { payload: await runTerminalUsagePoll(request), unavailable: false };
    } catch {
        // Claude could not be started or ended in failure, which is the parent's cue to mark it unavailable.
        return { payload: null, unavailable: true };
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
