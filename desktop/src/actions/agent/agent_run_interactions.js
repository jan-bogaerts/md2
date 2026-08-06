const { createMessageEntry } = require('./agent_conversation');
const { emitRunEvent, hasPendingInteraction } = require('./agent_run_state');
const { lastMessageEntry, nextRunSequence } = require('./agent_run_transcript');
const { requireQueuedMessageSession, requireString } = require('./agent_run_validation');
const { secretAnswerValues } = require('./agent_secret_redaction');

/** Serializes writes to the agent's stdin so a message and an answer can never interleave on the wire. */
function queueInteractionWrite(run, operation) {
    run.interactionWrites ??= Promise.resolve();
    const write = run.interactionWrites.then(operation);
    run.interactionWrites = write.catch(() => undefined);

    return write;
}

async function sendStreamingMessage(service, run, content) {
    const message = requireString(content, 'message');
    try {
        await run.streamingAdapter.sendMessage(message);
    } catch (error) {
        service.failStreamingRun(run, error);
        run.conversation.status = 'failed';
        throw error;
    }
    const timestamp = new Date().toISOString();
    if (run.conversation.status === 'waitingForInput') run.turnIndex += 1;
    const messageId = `${run.id}-user-${run.conversation.entries.length}`;
    run.conversation.entries.push(createMessageEntry(messageId, 'user', message, timestamp, undefined, nextRunSequence(run)));
    const userMessage = lastMessageEntry(run.conversation);
    run.conversation.status = 'running';
    run.turnActive = true;
    await service.persistCheckpoint(run);
    emitRunEvent(run, { type: 'userMessage', userMessage });
    emitRunEvent(run, { state: 'running', type: 'state' });
}

function sendMessage(service, run, content) {
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Agent message is required');

    return queueInteractionWrite(run, async () => {
        await sendStreamingMessage(service, run, content);
        run.queuedMessage = null;
    });
}

/**
 * Opens a queued-message session. The id invalidates drafts from an earlier session, so a stale
 * editor cannot send a message the user has since replaced.
 */
function beginQueuedMessageDraft(run) {
    run.queuedMessageSessionId += 1;
    run.queuedMessage = null;
    run.queuedMessageRevision = -1;
    run.sentQueuedMessageRevision = -1;

    return run.queuedMessageSessionId;
}

function setQueuedMessage(run, sessionId, content, revision) {
    requireQueuedMessageSession(run, sessionId);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent message revision');
    if (revision < run.queuedMessageRevision) return { accepted: false };
    if (typeof content !== 'string') throw new Error('Invalid queued agent message');
    run.queuedMessageRevision = revision;
    run.queuedMessage = content.trim().length > 0 ? { content, revision } : null;

    return { accepted: true };
}

function sendQueuedMessage(service, run, sessionId, revision) {
    requireQueuedMessageSession(run, sessionId);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent message revision');

    return queueInteractionWrite(run, async () => {
        requireQueuedMessageSession(run, sessionId);
        if (revision <= run.sentQueuedMessageRevision) throw new Error('Queued agent message was already sent');
        if (!run.queuedMessage) throw new Error('Queued agent message is empty');
        if (run.queuedMessage.revision !== revision) throw new Error('Queued agent message changed before it was sent');
        if (!run.streaming) throw new Error('Queued agent messaging requires a streaming agent');

        const { content, revision: queuedRevision } = run.queuedMessage;
        await sendStreamingMessage(service, run, content);
        run.queuedMessage = null;
        run.sentQueuedMessageRevision = queuedRevision;

        return { sent: true };
    });
}

/** Records the answers as a user message, with secret answers replaced by a placeholder and remembered for redaction. */
function answerQuestion(service, run, requestId, answers) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Missing streaming question answers');

    return queueInteractionWrite(run, async () => {
        const pendingQuestions = run.pendingQuestions;
        const secretQuestionIds = new Set(pendingQuestions.filter(({ isSecret }) => isSecret).map(({ id }) => id));
        const content = Object.entries(answers)
            .map(([questionId, answer]) => (
                `${questionId}: ${secretQuestionIds.has(questionId) ? '[secret]' : Array.isArray(answer) ? answer.join(', ') : answer}`
            ))
            .join('\n');
        run.secretValues ??= new Set();
        secretAnswerValues(pendingQuestions, answers).forEach((answer) => run.secretValues.add(answer));
        try {
            await run.streamingAdapter.answerQuestion(requestId, answers);
        } catch (error) {
            service.failStreamingRun(run, error);
            run.conversation.status = 'failed';
            throw error;
        }
        const timestamp = new Date().toISOString();
        run.conversation.entries.push(createMessageEntry(
            `${run.id}-answer-${run.conversation.entries.length}`,
            'user',
            content,
            timestamp,
            undefined,
            nextRunSequence(run),
        ));
        const userMessage = lastMessageEntry(run.conversation);
        run.waitingForQuestion = false;
        run.pendingQuestions = [];
        const state = hasPendingInteraction(run) ? 'waitingForInput' : 'running';
        run.conversation.status = state;
        await service.persistCheckpoint(run);
        emitRunEvent(run, { state, type: 'questionAnswered', userMessage });
        emitRunEvent(run, { state, type: 'state' });
    });
}

function answerApproval(service, run, requestId, decision) {
    if (!run.pendingApprovals.has(requestId)) throw new Error(`Unknown or stale agent approval request id: ${requestId}`);

    return queueInteractionWrite(run, async () => {
        await run.streamingAdapter.answerApproval(requestId, decision);
    });
}

module.exports = {
    answerApproval,
    answerQuestion,
    beginQueuedMessageDraft,
    queueInteractionWrite,
    sendMessage,
    sendQueuedMessage,
    sendStreamingMessage,
    setQueuedMessage,
};
