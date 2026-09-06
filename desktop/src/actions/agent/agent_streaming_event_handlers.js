const {
    accumulateUsage,
    createEventEntry,
    transitionConversationStatus,
    updateProviderSession,
} = require('./agent_conversation');
const { recordProviderEvent } = require('./agent_provider_event');
const { emitRunEvent, hasPendingInteraction } = require('./agent_run_state');
const {
    appendAssistantOutput,
    completeAssistantOutput,
    lastMessageEntry,
    nextRunSequence,
    replaceAssistantOutput,
    startAssistantItem,
} = require('./agent_run_transcript');
const { redactSecrets } = require('./agent_secret_redaction');
const { requireString } = require('./agent_run_validation');

function handleSessionStarted(service, run, event) {
    run.providerConversationId = event.conversationId;
}

function handleTurnStarted(service, run) {
    run.assistantItemIndex = 0;
    run.assistantItems.clear();
    run.currentAssistantEntryIndex = null;
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
    emitRunEvent(run, {content: '', entryIndex: item.entryIndex, messageId: item.messageId, sequence: item.sequence, type: 'output'});
}

function handleAssistant(service, run, event, timestamp) {
    const safeContent = redactSecrets(event.content, run.secretValues);
    const itemId = run.agent === 'codex'
        ? requireString(event.itemId, 'assistant item id')
        : event.itemId;
    const { entryIndex, message, segment } = appendAssistantOutput(run, safeContent, timestamp, itemId);
    if (segment.length > 0) {
        emitRunEvent(run, { content: segment, entryIndex, messageId: message.id, sequence: message.sequence, type: 'output' });
    }
}

function handleAssistantCompleted(service, run, event, timestamp) {
    const safeContent = redactSecrets(event.content, run.secretValues);
    const itemId = requireString(event.itemId, 'assistant item id');
    const { entryIndex, message, previousContent, replaced } = replaceAssistantOutput(run, safeContent, timestamp, itemId);
    if (!replaced) return;

    emitRunEvent(run, {
        content: safeContent,
        entryIndex,
        messageId: message.id,
        previousContent,
        replace: true,
        sequence: message.sequence,
        type: 'output',
    });
}

/** Provider events are keyed by `providerItemId` so a later revision of the same item replaces its entry. */
function handleEvent(service, run, event, timestamp) {
    recordProviderEvent(run, event.event, timestamp);
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

/**
 * Records the pending question in the transcript so a restart can restore the question box: the entry
 * is the last one exactly while the question is unresolved, because answering and dismissing both append after it.
 */
function appendQuestionEntry(run, questions, timestamp) {
    run.conversation.entries.push({
        ...createEventEntry(
            `${run.id}-question-${run.conversation.entries.length}`,
            'agentQuestion',
            '',
            timestamp,
            nextRunSequence(run),
        ),
        questions,
    });
}

async function handleQuestion(service, run, event, timestamp) {
    appendQuestionEntry(run, event.questions, timestamp);
    transitionConversationStatus(run.conversation, 'waitingForInput', timestamp);
    run.waitingForQuestion = true;
    run.pendingQuestionRequestId = event.requestId;
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
    run.pendingQuestionRequestId = null;
    run.pendingQuestions = [];
    run.pendingApprovals.clear();
    run.missingSession = run.missingSession || event.missingSession;
    if (event.missingSession) run.finishing = true;
    if (event.contextWindowUsage !== undefined) {
        if (event.contextWindowUsage) run.conversation.contextWindowUsage = event.contextWindowUsage;
        else delete run.conversation.contextWindowUsage;
    }
    if (!event.usage && event.contextWindowUsage !== undefined) {
        emitRunEvent(run, {
            contextWindowUsage: event.contextWindowUsage,
            type: 'usage',
            usage: run.conversation.usage,
        });
    }
    if (event.error) {
        service.failStreamingRun(run, new Error(event.error));
        return;
    }
    if (!event.missingSession && event.usage) {
        run.liveTurnUsage = event.usage;
        run.conversation.usage = accumulateUsage(run.conversation.usage, run.liveTurnUsage);
        run.liveTurnUsage = null;
        await service.persistSuccessfulTurn(run);
        await service.recordTokenUsage(run, event.usage, timestamp);
        emitRunEvent(run, {
            ...(event.contextWindowUsage !== undefined ? { contextWindowUsage: event.contextWindowUsage } : {}),
            type: 'usage',
            usage: run.conversation.usage,
        });
    }
    if (run.finishing) {
        service.beginFinishShutdown(run);
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
