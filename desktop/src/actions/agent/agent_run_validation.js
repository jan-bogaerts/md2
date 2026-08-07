function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing agent ${fieldName}`);

    return value;
}

function requireProjectFolder(value) {
    if (typeof value !== 'string') throw new Error('Missing agent projectFolder');

    return value;
}

function requireCommand(value) {
    if (!Array.isArray(value) || value.length === 0) throw new Error('Missing agent command');
    value.forEach((argument, index) => requireString(argument, `command[${index}]`));

    return value;
}

function readOptionalString(value, fieldName) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing agent ${fieldName}`);

    return value;
}

function requireQueuedMessageSession(run, sessionId) {
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) throw new Error('Invalid queued agent message session');
    if (sessionId !== run.queuedMessageSessionId) throw new Error('Queued agent message session expired');
}

module.exports = {
    readOptionalString,
    requireCommand,
    requireProjectFolder,
    requireQueuedMessageSession,
    requireString,
};
