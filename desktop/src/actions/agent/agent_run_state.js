const { JsonLineBuffer } = require('./agent_event_utils');
const { createAgentProviderProtocolParser } = require('./agent_provider_protocol');
const { createAgentStreamingAdapter } = require('./agent_streaming_adapter');
const { createProviderEventEntryIndexes } = require('./agent_run_transcript');

function emitRunEvent(run, event) {
    if (!run.onEvent) return;

    run.onEvent({ ...event, runId: run.id });
}

function hasPendingInteraction(run) {
    return run.waitingForQuestion || run.pendingApprovals.size > 0;
}

function writeJsonLine(stream, message) {
    return new Promise((resolve, reject) => {
        stream.write(`${JSON.stringify(message)}\n`, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

/**
 * The mutable state for one agent turn. `AgentRunnerService` keeps these in `processes` keyed by run id,
 * and `persistCheckpoint` spreads the whole object into the persistence layer, so the field set is a contract.
 */
function createRun({
    agent,
    child,
    conversation,
    environment,
    executable,
    id,
    nextSequence,
    onComplete,
    onCompletionError,
    onEvent,
    reference,
    request,
    startedAt,
    streaming,
}) {
    const { promise: closed, resolve: resolveClosed } = Promise.withResolvers();

    return {
        providerEventEntryIndexes: createProviderEventEntryIndexes(conversation.entries),
        agent,
        assistantItemIndex: 0,
        assistantItems: new Map(),
        cancelled: false,
        child,
        changedPaths: new Set(),
        closed,
        conversation,
        codexCacheErrorReported: false,
        currentAssistantMessageId: null,
        environment,
        executable,
        finishForced: false,
        finishTimeout: null,
        id,
        missingSession: false,
        nextSequence,
        onComplete,
        onCompletionError,
        onEvent,
        interactionWrites: Promise.resolve(),
        pendingQuestions: [],
        pendingApprovals: new Map(),
        persistence: Promise.resolve(),
        providerConversationId: null,
        protocolLines: null,
        protocolHandling: Promise.resolve(),
        reference,
        reportedProviderErrors: new Set(),
        resolveClosed,
        queuedMessage: null,
        queuedMessageRevision: -1,
        sentQueuedMessageRevision: -1,
        queuedMessageSessionId: 0,
        secretValues: new Set(),
        request,
        stderr: '',
        stderrBuffer: '',
        stderrHandling: Promise.resolve(),
        finishing: false,
        stdout: '',
        startedAt,
        streaming,
        streamingFailure: null,
        turnStarted: false,
        turnIndex: 1,
        turnActive: streaming,
        termination: null,
        suspended: false,
        turnUsage: null,
        waitingForQuestion: false,
    };
}

/**
 * Wires the run to its provider protocol: streaming runs get the adapter plus a JSONL line buffer,
 * batch runs get the one-shot protocol parser.
 */
function attachRunProtocol(run, {
    onCodexRuntimeEvent,
    onMalformedOutput,
    onProviderEvent,
    onStreamingEvent,
    onStreamingLine,
    providerConversationId,
    rootPath,
}) {
    const writeLine = (message) => writeJsonLine(run.child.stdin, message);
    run.streamingAdapter = run.streaming
        ? createAgentStreamingAdapter(
            run.agent,
            writeLine,
            onStreamingEvent,
            rootPath,
            providerConversationId,
            onCodexRuntimeEvent,
        )
        : null;
    run.protocolLines = run.streaming ? new JsonLineBuffer(run.id, onStreamingLine) : null;
    run.parser = run.streaming
        ? null
        : createAgentProviderProtocolParser(run.agent, onProviderEvent, onMalformedOutput, rootPath);

    return run;
}

function createRunResult(request, exitCode, run) {
    return {
        command: request.command,
        conversation: structuredClone(run.conversation),
        exitCode,
        missingSession: run.missingSession,
        prompt: request.prompt,
        reference: run.reference,
        runId: run.id,
        stderr: run.stderr,
        stdout: run.stdout,
        changedPaths: [...run.changedPaths],
        turnStarted: run.turnStarted,
    };
}

module.exports = {
    attachRunProtocol,
    createRun,
    createRunResult,
    emitRunEvent,
    hasPendingInteraction,
    writeJsonLine,
};
