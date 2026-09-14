const { createProviderEventEntry } = require('./agent_conversation');
const { addTimerBreakdown, foldPhases, recordPhaseEvent } = require('./agent_conversation_phases');
const { emitRunEvent } = require('./agent_run_state');
const { appendDiagnosticContent, nextRunSequence } = require('./agent_run_transcript');
const { redactConversationEvent } = require('./agent_secret_redaction');
const { requireString } = require('./agent_run_validation');

/**
 * Folds a span that just closed into the live timer, so the chat log tooltip reflects finished tools
 * and reasoning blocks without waiting for the run to leave `running`.
 */
function refreshLiveBreakdown(run, timestamp) {
    const timer = run.conversation.timer;
    if (!timer || run.conversation.status !== 'running' || timer.runningStartedAt === null) return;
    const delta = foldPhases(run.phases, Date.parse(timer.runningStartedAt), Date.parse(timestamp));
    run.conversation.timer = addTimerBreakdown(timer, delta);
}

/** Persist one canonical provider event, replacing an earlier lifecycle state with the same provider item id. */
function recordProviderEvent(run, providerEvent, timestamp) {
    const safeEvent = redactConversationEvent(providerEvent, run.secretValues);
    const providerItemId = requireString(safeEvent.providerItemId, 'event providerItemId');
    if (safeEvent.type === 'fileChange' && safeEvent.status === 'completed' && Array.isArray(safeEvent.paths)) {
        safeEvent.paths.forEach((filePath) => run.changedPaths.add(filePath));
    }
    const currentIndex = run.providerEventEntryIndexes.get(providerItemId);
    let eventEntry;
    if (currentIndex !== undefined) {
        const current = run.conversation.entries[currentIndex];
        eventEntry = createProviderEventEntry(safeEvent, current.id, timestamp, current.sequence);
        run.conversation.entries[currentIndex] = eventEntry;
    } else {
        const previousEntry = run.conversation.entries.at(-1);
        if (safeEvent.type === 'diagnostic' && previousEntry?.kind === 'event' && previousEntry.type === 'diagnostic') {
            eventEntry = appendDiagnosticContent(previousEntry, safeEvent.content);
            run.conversation.entries[run.conversation.entries.length - 1] = eventEntry;
        } else {
            const sequence = nextRunSequence(run);
            eventEntry = createProviderEventEntry(safeEvent, `${run.id}-event-${sequence}`, timestamp, sequence);
            run.providerEventEntryIndexes.set(providerItemId, run.conversation.entries.length);
            run.conversation.entries.push(eventEntry);
        }
    }
    if (recordPhaseEvent(run.phases, safeEvent, timestamp)) refreshLiveBreakdown(run, timestamp);
    const entryIndex = currentIndex ?? run.conversation.entries.length - 1;
    emitRunEvent(run, { entryIndex, event: eventEntry, type: 'agentEvent' });
}

module.exports = { recordProviderEvent };
