const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');

const AGENT_LOG_PATH = path.join(os.tmpdir(), 'md2-agent-debug.log');

let agentLogStream = null;

function formatAgentLogEntry(values, timestamp = new Date()) {
    const content = util.formatWithOptions({ colors: false, depth: null }, ...values);

    return `${timestamp.toISOString()} ${content}`;
}

function handleAgentLogError(error) {
    console.error('[agent:log-error]', error);
}

function getAgentLogStream() {
    if (agentLogStream) return agentLogStream;

    agentLogStream = fs.createWriteStream(AGENT_LOG_PATH, { flags: 'a' });
    agentLogStream.on('error', handleAgentLogError);

    return agentLogStream;
}

/** Writes temporary agent diagnostics to both the console and the OS temporary directory. */
function logAgentEvent(...values) {
    console.log(...values);
    getAgentLogStream().write(`${formatAgentLogEntry(values)}\n`);
}

module.exports = { AGENT_LOG_PATH, formatAgentLogEntry, logAgentEvent };
