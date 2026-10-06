const { isToolCallEvent } = require('../../../../shared/agent_event_categories.mjs');

const RUNNING_TOOL_STATUSES = new Set(['inProgress', 'running', 'started']);

/** Cancel unfinished tools when their owning process no longer exists. */
function cancelUnfinishedTools(conversation) {
    const entries = conversation.entries.map((entry) => (
        isToolCallEvent(entry) && RUNNING_TOOL_STATUSES.has(entry.status)
            ? { ...entry, status: 'cancelled', ...(entry.runningSubThreads !== undefined ? { runningSubThreads: 0 } : {}) }
            : entry
    ));

    return { ...conversation, entries };
}

module.exports = { cancelUnfinishedTools };
