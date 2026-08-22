const { createEventEntry, createMessageEntry, transitionConversationStatus } = require('./agent_conversation');
const { emitRunEvent, hasPendingInteraction } = require('./agent_run_state');
const { lastMessageEntry, nextRunSequence } = require('./agent_run_transcript');
const { requireString } = require('./agent_run_validation');
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
        throw error;
    }
    const timestamp = new Date().toISOString();
    if (run.conversation.status === 'waitingForInput') run.turnIndex += 1;
    const messageId = `${run.id}-user-${run.conversation.entries.length}`;
    run.conversation.entries.push(createMessageEntry(messageId, 'user', message, timestamp, undefined, nextRunSequence(run)));
    const userMessage = lastMessageEntry(run.conversation);
    const state = hasPendingInteraction(run) ? 'waitingForInput' : 'running';
    transitionConversationStatus(run.conversation, state, timestamp);
    run.turnActive = true;
    await service.persistCheckpoint(run);
    emitRunEvent(run, { type: 'userMessage', userMessage });
    emitRunEvent(run, { state, type: 'state' });
}

function sendMessage(service, run, content) {
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Agent message is required');

    return queueInteractionWrite(run, async () => {
        await sendStreamingMessage(service, run, content);
    });
}

function requirePendingQuestion(run, requestId) {
    if (!run.waitingForQuestion || run.pendingQuestionRequestId !== requestId) {
        throw new Error(`Unknown or stale agent question request id: ${requestId}`);
    }

    return run.pendingQuestions;
}

/** Records the answers as a user message, with secret answers replaced by a placeholder and remembered for redaction. */
function answerQuestion(service, run, requestId, answers) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Missing streaming question answers');

    return queueInteractionWrite(run, async () => {
        const pendingQuestions = requirePendingQuestion(run, requestId);
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
        const questionStillCurrent = run.pendingQuestionRequestId === requestId;
        if (questionStillCurrent) {
            run.waitingForQuestion = false;
            run.pendingQuestionRequestId = null;
            run.pendingQuestions = [];
        }
        const state = hasPendingInteraction(run) ? 'waitingForInput' : 'running';
        transitionConversationStatus(run.conversation, state, timestamp);
        await service.persistCheckpoint(run);
        emitRunEvent(run, { requestId, state, type: 'questionAnswered', userMessage });
        emitRunEvent(run, { state, type: 'state' });
    });
}

function dismissQuestions(service, run, requestId) {
    return queueInteractionWrite(run, async () => {
        requirePendingQuestion(run, requestId);
        await run.streamingAdapter.dismissQuestion(requestId);
        const timestamp = new Date().toISOString();
        const event = {
            ...createEventEntry(
                `${run.id}-questions-dismissed-${run.conversation.entries.length}`,
                'questionsDismissed',
                '',
                timestamp,
                nextRunSequence(run),
            ),
            label: 'Questions dismissed',
            status: 'completed',
        };
        run.conversation.entries.push(event);
        const questionStillCurrent = run.pendingQuestionRequestId === requestId;
        if (questionStillCurrent) {
            run.waitingForQuestion = false;
            run.pendingQuestionRequestId = null;
            run.pendingQuestions = [];
        }
        const state = hasPendingInteraction(run) ? 'waitingForInput' : 'running';
        transitionConversationStatus(run.conversation, state, timestamp);
        let persistenceError = null;
        try {
            await service.persistCheckpoint(run);
        } catch (error) {
            persistenceError = error;
        }
        emitRunEvent(run, { event, requestId, state, type: 'questionDismissed' });
        emitRunEvent(run, { state, type: 'state' });
        if (persistenceError) {
            throw new Error(
                'Questions dismissed, but conversation checkpoint could not be saved',
                { cause: persistenceError },
            );
        }
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
    dismissQuestions,
    queueInteractionWrite,
    sendMessage,
    sendStreamingMessage,
};
