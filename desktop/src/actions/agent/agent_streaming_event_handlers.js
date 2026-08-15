const {
    accumulateUsage,
    createProviderEventEntry,
    createEventEntry,
    transitionConversationStatus,
    updateProviderSession,
} = require('./agent_conversation');
const { emitRunEvent, hasPendingInteraction } = require('./agent_run_state');
const {
    appendAssistantOutput,
    appendDiagnosticContent,
    completeAssistantOutput,
    lastMessageEntry,
    nextRunSequence,
    replaceAssistantOutput,
    startAssistantItem,
} = require('./agent_run_transcript');
const { redactConversationEvent, redactSecrets } = require('./agent_secret_redaction');
const { requireString } = require('./agent_run_validation');

function handleSessionStarted(service, run, event) {
    run.providerConversationId = event.conversationId;
}

function handleTurnStarted(service, run) {
    run.assistantItemIndex = 0;
    run.assistantItems.clear();
    run.currentAssistantMessageId = null;
    run.liveTurnUsage = null;
    run.turnStarted = true;
}

function handleUsage(service, run, event) {
    run.liveTurnUsage = event.usage;
    const usage = accumulateUsage(run.conversation.usage, event.usage);
    emitRunEvent(run, {
        ...(event.contextWindowUsage !== undefined ? { contextWindowUsage: event.contextWindowUsage } : {}),
        type: 'usage',
        usage,
    });
}

function handleAssistantStarted(service, run, event, timestamp) {
    const item = startAssistantItem(run, requireString(event.itemId, 'assistant item id'), timestamp);
    emitRunEvent(run, { content: '', messageId: item.messageId, sequence: item.sequence, type: 'output' });
}

function handleAssistant(service, run, event, timestamp) {
    const safeContent = redactSecrets(event.content, run.secretValues);
    const itemId = run.agent === 'codex'
        ? requireString(event.itemId, 'assistant item id')
        : event.itemId;
    const { message, segment } = appendAssistantOutput(run, safeContent, timestamp, itemId);
    if (segment.length > 0) {
        emitRunEvent(run, { content: segment, messageId: message.id, sequence: message.sequence, type: 'output' });
    }
}

function handleAssistantCompleted(service, run, event, timestamp) {
    const safeContent = redactSecrets(event.content, run.secretValues);
    const itemId = requireString(event.itemId, 'assistant item id');
    const { message, previousContent, replaced } = replaceAssistantOutput(run, safeContent, timestamp, itemId);
    if (!replaced) return;

    emitRunEvent(run, {
        content: safeContent,
        messageId: message.id,
        previousContent,
        replace: true,
        sequence: message.sequence,
        type: 'output',
    });
}

function handleChangedPaths(service, run, event) {
    event.paths.forEach((filePath) => run.changedPaths.add(filePath));
}

/** Provider events are keyed by `providerItemId` so a later revision of the same item replaces its entry. */
function handleEvent(service, run, event, timestamp) {
    const safeEvent = redactConversationEvent(event.event, run.secretValues);
    const providerItemId = requireString(safeEvent.providerItemId, 'event providerItemId');
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
            eventEntry = createProviderEventEntry(
                safeEvent,
                `${run.id}-event-${sequence}`,
                timestamp,
                sequence,
            );
            run.providerEventEntryIndexes.set(providerItemId, run.conversation.entries.length);
            run.conversation.entries.push(eventEntry);
        }
    }
    emitRunEvent(run, { event: eventEntry, type: 'agentEvent' });
}

function handleTranscript(service, run, event, timestamp) {
    const safeContent = redactSecrets(event.content, run.secretValues);
    run.conversation.entries.push(createEventEntry(
        `${run.id}-provider-${run.conversation.entries.length}`,
        event.toolType,
        safeContent,
        timestamp,
        nextRunSequence(run),
    ));
}

function handleError(service, run, event) {
    service.recordOutput(run.id, 'stderr', event.content);
}

function handleFatal(service, run, event) {
    service.failStreamingRun(run, new Error(event.content));
}

function handleSessionFailed(service, run, event) {
    run.missingSession = event.missingSession;
    service.failStreamingRun(run, new Error(event.content));
}

async function handleQuestion(service, run, event, timestamp) {
    transitionConversationStatus(run.conversation, 'waitingForInput', timestamp);
    run.waitingForQuestion = true;
    run.pendingQuestions = event.questions;
    await service.persistCheckpoint(run);
    emitRunEvent(run, { state: 'waitingForInput', type: 'state' });
    emitRunEvent(run, { questions: event.questions, requestId: event.requestId, state: 'waitingForInput', type: 'question' });
}

async function handleApproval(service, run, event, timestamp) {
    const requestId = event.approval.requestId;
    if (run.pendingApprovals.has(requestId)) throw new Error(`Duplicate agent approval request id: ${requestId}`);
    run.pendingApprovals.set(requestId, { ...event.approval, submitted: false });
    transitionConversationStatus(run.conversation, 'waitingForInput', timestamp);
    await service.persistCheckpoint(run);
    emitRunEvent(run, { state: 'waitingForInput', type: 'state' });
    emitRunEvent(run, { approval: event.approval, state: 'waitingForInput', type: 'approval' });
}

function handleApprovalSubmitted(service, run, event) {
    const approval = run.pendingApprovals.get(event.requestId);
    if (!approval) return;
    approval.submitted = true;
    emitRunEvent(run, { requestId: event.requestId, type: 'approvalSubmitted' });
}

async function handleApprovalResolved(service, run, event, timestamp) {
    if (!run.pendingApprovals.delete(event.requestId)) return;
    const state = hasPendingInteraction(run) ? 'waitingForInput' : 'running';
    transitionConversationStatus(run.conversation, state, timestamp);
    await service.persistCheckpoint(run);
    emitRunEvent(run, { requestId: event.requestId, state, type: 'approvalResolved' });
    emitRunEvent(run, { state, type: 'state' });
}

/**
 * End of a streaming turn: settle the assistant message, then either shut the process down,
 * send the message queued while the turn was running, or park the run waiting for input.
 */
async function handleTurnCompleted(service, run, event, timestamp) {
    completeAssistantOutput(run, timestamp);
    run.turnActive = false;
    run.waitingForQuestion = false;
    run.pendingApprovals.clear();
    run.missingSession = run.missingSession || event.missingSession;
    if (event.missingSession) run.finishing = true;
    if (event.usage) {
        run.liveTurnUsage = event.usage;
        run.conversation.usage = accumulateUsage(run.conversation.usage, run.liveTurnUsage);
        run.liveTurnUsage = null;
    }
    if (event.contextWindowUsage !== undefined) {
        if (event.contextWindowUsage) run.conversation.contextWindowUsage = event.contextWindowUsage;
        else delete run.conversation.contextWindowUsage;
    }
    if (event.usage || event.contextWindowUsage !== undefined) {
        emitRunEvent(run, {
            ...(event.contextWindowUsage !== undefined ? { contextWindowUsage: event.contextWindowUsage } : {}),
            type: 'usage',
            usage: run.conversation.usage,
        });
    }
    if (event.error) {
        service.failStreamingRun(run, new Error(event.error));
        return;
    }
    if (run.finishing) {
        service.beginFinishShutdown(run);
        return;
    }
    if (run.queuedMessage) {
        const { content, revision } = run.queuedMessage;
        transitionConversationStatus(run.conversation, 'waitingForInput', timestamp);
        await service.sendStreamingMessage(run, content);
        run.queuedMessage = null;
        run.sentQueuedMessageRevision = revision;
        return;
    }
    const synchronizedMessage = lastMessageEntry(run.conversation);
    if (synchronizedMessage) updateProviderSession(run, synchronizedMessage.id, timestamp);
    transitionConversationStatus(run.conversation, 'waitingForInput', timestamp);
    run.conversation.completedAt = null;
    await service.persistCheckpoint(run);
    emitRunEvent(run, { state: 'waitingForInput', type: 'state' });
}

/** Keyed by streaming event type; unknown types are ignored. Each handler takes `(service, run, event, timestamp)`. */
const STREAMING_EVENT_HANDLERS = {
    approval: handleApproval,
    approvalResolved: handleApprovalResolved,
    approvalSubmitted: handleApprovalSubmitted,
    assistant: handleAssistant,
    assistantCompleted: handleAssistantCompleted,
    assistantStarted: handleAssistantStarted,
    changedPaths: handleChangedPaths,
    error: handleError,
    event: handleEvent,
    fatal: handleFatal,
    question: handleQuestion,
    sessionFailed: handleSessionFailed,
    sessionStarted: handleSessionStarted,
    transcript: handleTranscript,
    turnCompleted: handleTurnCompleted,
    turnStarted: handleTurnStarted,
    usage: handleUsage,
};

module.exports = { STREAMING_EVENT_HANDLERS };
