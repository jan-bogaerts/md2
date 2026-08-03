const crypto = require('node:crypto');
const path = require('node:path');
const crossSpawn = require('cross-spawn');

const {
    accumulateUsage,
    createProviderEventEntry,
    createConversation,
    createEventEntry,
    createMessageEntry,
    updateProviderSession,
} = require('./agent_conversation');
const {
    conversationReference,
    persistConversation,
    persistConversationCheckpoint,
} = require('./agent_conversation_persistence');
const { JsonLineBuffer } = require('./agent_event_utils');
const { createAgentProviderProtocolParser } = require('./agent_provider_protocol');
const { createAgentStreamingAdapter } = require('./agent_streaming_adapter');
const { AgentExecutableResolver } = require('./agent_executable_availability');
const { createAgentEnvironment } = require('./agent_environment');
const { diagnoseCodexCacheError, isCodexCacheError } = require('./agent_codex_cache_diagnostic');
const { terminateProcessTree } = require('../process_tree');
const { assertGitRoot, ensureInsideRoot, requireRootPath } = require('../../git/git_commands');

const HIDDEN_STDERR_LINES = [
    /^completed$/i,
    /^Debugger listening on ws:\/\//,
    /^For help, see: https:\/\/nodejs\.org\/en\/docs\/inspector\/?$/,
    /^Debugger attached\.$/,
    /^Reading additional input from stdin\.\.\.$/,
    /^Waiting for the debugger to disconnect\.\.\.$/,
];
const AGENT_FINISH_GRACE_MS = 5_000;

function isHiddenStderrLine(line) {
    return HIDDEN_STDERR_LINES.some((pattern) => pattern.test(line.trim()));
}

function filterCompleteStderrLines(content) {
    const parts = content.split(/(\r\n|\r|\n)/);
    const remainder = parts.pop();
    const visibleParts = [];
    for (let index = 0; index < parts.length; index += 2) {
        const line = parts[index];
        const delimiter = parts[index + 1];
        if (!isHiddenStderrLine(line)) visibleParts.push(`${line}${delimiter}`);
    }

    return { content: visibleParts.join(''), remainder };
}

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

function emitRunEvent(run, event) {
    if (!run.onEvent) return;

    run.onEvent({ ...event, runId: run.id });
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

function queueInteractionWrite(run, operation) {
    run.interactionWrites ??= Promise.resolve();
    const write = run.interactionWrites.then(operation);
    run.interactionWrites = write.catch(() => undefined);

    return write;
}

function hasPendingInteraction(run) {
    return run.waitingForQuestion || run.pendingApprovals.size > 0;
}

function secretAnswerValues(questions, answers) {
    const secretQuestionIds = new Set(questions.filter(({ isSecret }) => isSecret).map(({ id }) => id));

    return Object.entries(answers)
        .filter(([questionId]) => secretQuestionIds.has(questionId))
        .flatMap(([, answer]) => Array.isArray(answer) ? answer : [answer])
        .filter((answer) => typeof answer === 'string' && answer.length > 0);
}

function redactSecrets(content, secretValues) {
    if (typeof content !== 'string' || !secretValues || secretValues.size === 0) return content;

    return [...secretValues]
        .sort((first, second) => second.length - first.length)
        .reduce((redacted, secret) => redacted.split(secret).join('[secret]'), content);
}

function redactTextArray(values, secretValues) {
    return values.map((value) => redactSecrets(value, secretValues));
}

function redactConversationEvent(event, secretValues) {
    return {
        ...event,
        command: redactSecrets(event.command, secretValues),
        content: redactSecrets(event.content, secretValues),
        details: Array.isArray(event.details) ? redactTextArray(event.details, secretValues) : event.details,
        label: redactSecrets(event.label, secretValues),
        output: redactSecrets(event.output, secretValues),
        summary: Array.isArray(event.summary) ? redactTextArray(event.summary, secretValues) : event.summary,
        workingDirectory: redactSecrets(event.workingDirectory, secretValues),
    };
}

function requireQueuedMessageSession(run, sessionId) {
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) throw new Error('Invalid queued agent message session');
    if (sessionId !== run.queuedMessageSessionId) throw new Error('Queued agent message session expired');
}

function nextConversationSequence(conversation) {
    const highestSequence = conversation.entries.reduce((highest, entry) => (
        Number.isSafeInteger(entry.sequence) ? Math.max(highest, entry.sequence) : highest
    ), 0);

    return Math.max(highestSequence, conversation.entries.length) + 1;
}

function nextRunSequence(run) {
    const sequence = run.nextSequence;
    run.nextSequence += 1;

    return sequence;
}

function createProviderEventEntryIndexes(entries) {
    const providerEventEntryIndexes = new Map();
    for (const [index, entry] of entries.entries()) {
        if (entry.kind === 'event' && typeof entry.providerItemId === 'string' && !providerEventEntryIndexes.has(entry.providerItemId)) {
            providerEventEntryIndexes.set(entry.providerItemId, index);
        }
    }

    return providerEventEntryIndexes;
}

function appendDiagnosticContent(eventEntry, content) {
    return { ...eventEntry, content: `${eventEntry.content}\n${content}` };
}

function lastMessageEntry(conversation) {
    return conversation.entries.findLast(({ kind }) => kind === 'message');
}

function assistantMessageId(run) {
    return run.streaming ? `${run.id}-turn-${run.turnIndex}-assistant` : `${run.id}-assistant`;
}

function startAssistantItem(run, itemId, timestamp) {
    if (run.assistantItems.has(itemId)) throw new Error(`Duplicate assistant item ${itemId}`);
    run.assistantItemIndex += 1;
    const item = {
        messageId: `${run.id}-turn-${run.turnIndex}-assistant-${run.assistantItemIndex}`,
        sequence: nextRunSequence(run),
    };
    run.assistantItems.set(itemId, item);
    run.currentAssistantMessageId = item.messageId;
    run.conversation.entries.push(createMessageEntry(
        item.messageId,
        'assistant',
        '',
        timestamp,
        run.agent,
        item.sequence,
    ));

    return item;
}

function assistantItem(run, itemId) {
    if (!itemId) return null;
    const item = run.assistantItems.get(itemId);
    if (!item) throw new Error(`Missing assistant item ${itemId}`);

    return item;
}

/**
 * Exact text appended to `existing` for `chunk`, including the paragraph separator.
 * Streaming chunks are provider deltas that must concatenate verbatim; the adapter owns their separators.
 */
function chunkSegment(existing, chunk, streaming) {
    if (streaming) return chunk;

    const trimmed = chunk.replace(/^\n+|\n+$/g, '');
    if (trimmed.length === 0) return '';
    if (existing.length === 0) return trimmed;

    return `\n\n${trimmed}`;
}

function joinChunk(existing, chunk, streaming) {
    return `${existing}${chunkSegment(existing, chunk, streaming)}`;
}

/** Appends a chunk and returns the appended segment, so streamed events carry the same separators. */
function appendAssistantOutput(run, content, timestamp, itemId = null) {
    const segment = chunkSegment(run.stdout, content, run.streaming);
    run.stdout += segment;
    const item = assistantItem(run, itemId);
    const messageId = item?.messageId ?? assistantMessageId(run);
    const currentIndex = run.conversation.entries.findIndex((entry) => entry.kind === 'message' && entry.id === messageId);
    if (currentIndex < 0) {
        const initialContent = run.streaming ? content : content.replace(/^\n+|\n+$/g, '');
        const message = createMessageEntry(
            messageId,
            'assistant',
            initialContent,
            timestamp,
            run.agent,
            item?.sequence ?? nextRunSequence(run),
        );
        run.conversation.entries.push(message);

        return { message, segment };
    }

    const current = run.conversation.entries[currentIndex];
    const message = { ...current, content: joinChunk(current.content, content, run.streaming), timestamp };
    run.conversation.entries[currentIndex] = message;

    return { message, segment };
}

function completeAssistantOutput(run, completedAt) {
    const messageId = run.currentAssistantMessageId ?? assistantMessageId(run);
    const currentIndex = run.conversation.entries.findIndex((entry) => entry.kind === 'message' && entry.id === messageId);
    if (currentIndex < 0) return;

    run.conversation.entries[currentIndex] = { ...run.conversation.entries[currentIndex], timestamp: completedAt };
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

class AgentRunnerService {
    constructor(dependencies = {}) {
        this.codexRuntimeService = dependencies.codexRuntimeService ?? null;
        this.persistConversation = dependencies.persistConversation
            ?? dependencies.persistTerminalConversation
            ?? persistConversation;
        this.persistConversationCheckpoint = dependencies.persistConversationCheckpoint
            ?? persistConversationCheckpoint;
        this.executableResolver = dependencies.executableResolver ?? new AgentExecutableResolver();
        this.diagnoseCodexCacheError = dependencies.diagnoseCodexCacheError ?? diagnoseCodexCacheError;
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.terminateProcessTree = dependencies.terminateProcessTree ?? terminateProcessTree;
        this.handleFinishTimeout = this.handleFinishTimeout.bind(this);
        this.processes = new Map();
        this.runningConversationIds = new Set();
    }

    async run(project, request, onEvent) {
        let resolveCompletion;
        let rejectCompletion;
        const completion = new Promise((resolve, reject) => {
            resolveCompletion = resolve;
            rejectCompletion = reject;
        });
        const onComplete = (exitCode, run) => resolveCompletion(createRunResult(request, exitCode, run));
        const onCompletionError = (error) => rejectCompletion(error);

        await this.start(project, request, onEvent, onComplete, onCompletionError);

        return completion;
    }

    async start(project, requestValue, onEvent, onComplete, onCompletionError) {
        const request = {
            activityOrigin: { kind: 'project' },
            activityProject: project,
            ...requestValue,
        };
        const rootPath = requireRootPath(project);
        await assertGitRoot(rootPath);
        const command = requireCommand(request?.command);
        readOptionalString(request?.actionId, 'actionId');
        const cardPath = readOptionalString(request?.cardPath, 'cardPath');
        const prompt = requireString(request?.prompt, 'prompt');
        const agent = requireString(request?.agent ?? 'generic', 'agent');
        const streaming = request.streaming === true;
        requireProjectFolder(request?.projectFolder);
        if (cardPath) ensureInsideRoot(rootPath, path.join(rootPath, cardPath));

        const id = `agent-turn-${crypto.randomUUID()}`;
        const startedAt = new Date().toISOString();
        const conversationId = request.conversation?.id ?? `agent-${crypto.randomUUID()}`;
        const reference = request.reference ?? conversationReference(request, conversationId);
        const conversation = createConversation(request, conversationId, startedAt, reference);
        let nextSequence = nextConversationSequence(conversation);
        if (this.runningConversationIds.has(conversation.id)) throw new Error(`Agent conversation already has a running turn: ${conversation.id}`);
        const lastMessage = lastMessageEntry(conversation);
        if (request.reuseLastUserMessage) {
            if (lastMessage?.role !== 'user' || lastMessage.content !== prompt) throw new Error('Missing failed-turn user message for agent retry');
        } else {
            conversation.entries.push(createMessageEntry(`${id}-user`, 'user', prompt, startedAt, undefined, nextSequence));
            nextSequence += 1;
        }
        conversation.entries.push(createEventEntry(`${id}-started`, 'started', command.join(' '), startedAt, nextSequence));
        nextSequence += 1;
        const [configuredExecutable, ...configuredArguments] = command;
        const environment = createAgentEnvironment(process.env);
        const resolvedExecutable = await this.executableResolver.find(configuredExecutable, { cwd: rootPath, env: environment });
        const executable = resolvedExecutable ?? configuredExecutable;
        const argumentsList = streaming ? configuredArguments : [...configuredArguments, prompt];
        const child = crossSpawn(executable, argumentsList, {
            cwd: rootPath,
            detached: process.platform !== 'win32',
            env: environment,
            stdio: ['pipe', 'pipe', 'pipe'],
            // windowsHide: true,
        });
        console.log('[agent:start]', {
            arguments: configuredArguments,
            cwd: rootPath,
            actionRunId: request.actionRunId ?? null,
            executable,
            pid: child.pid,
            runId: id,
            startedAt,
        });
        const { promise: closed, resolve: resolveClosed } = Promise.withResolvers();
        const run = {
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
        const writeLine = (message) => writeJsonLine(child.stdin, message);
        run.streamingAdapter = streaming
            ? createAgentStreamingAdapter(
                agent,
                writeLine,
                (event) => this.handleStreamingEvent(id, event),
                rootPath,
                request.providerConversationId,
                (event) => this.handleCodexRuntimeEvent(event),
            )
            : null;
        run.protocolLines = streaming ? new JsonLineBuffer(id, (line) => this.handleStreamingLine(id, line)) : null;
        run.parser = streaming
            ? null
            : createAgentProviderProtocolParser(
                agent,
                (event) => this.handleProviderEvent(id, event),
                (line) => this.handleMalformedOutput(id, line),
                rootPath,
            );
        this.processes.set(id, run);
        this.runningConversationIds.add(conversation.id);

        child.stdout.on('data', (chunk) => this.handleOutput(id, 'stdout', chunk));
        child.stderr.on('data', (chunk) => this.handleOutput(id, 'stderr', chunk));
        child.on('error', (error) => this.handleError(id, error));
        child.stdin.on('error', (error) => this.handleError(id, error));
        child.on('close', (exitCode) => {
            void this.handleClose(id, exitCode ?? 1).finally(run.resolveClosed);
        });
        if (streaming) {
            const initialPrompt = typeof request.contextInput === 'string' && request.contextInput.length > 0
                ? `${request.contextInput}\n\n[User]\n\n${prompt}`
                : prompt;
            try {
                await run.streamingAdapter.start(initialPrompt);
            } catch (error) {
                this.failStreamingRun(run, error);
            }
        } else {
            if (typeof request.contextInput === 'string' && request.contextInput.length > 0) child.stdin.write(request.contextInput);
            child.stdin.end();
        }
        const userMessage = lastMessageEntry(conversation);
        if (!userMessage || userMessage.role !== 'user') throw new Error('Missing current agent user message');
        emitRunEvent(run, {
            continued: !!request.conversation,
            conversation: structuredClone(conversation),
            type: 'started',
        });

        return { conversation: structuredClone(conversation), reference, runId: id };
    }

    stop(runId) {
        const run = this.requireRun(runId);
        run.cancelled = true;
        run.queuedMessage = null;
        this.clearFinishTimeout(run);

        return this.ensureTermination(run);
    }

    suspend(runId) {
        const run = this.requireRun(runId);
        run.suspended = true;
        run.queuedMessage = null;
        this.clearFinishTimeout(run);

        return this.ensureTermination(run);
    }

    beginQueuedMessageDraft(runId) {
        const run = this.requireRun(runId);
        run.queuedMessageSessionId += 1;
        run.queuedMessage = null;
        run.queuedMessageRevision = -1;
        run.sentQueuedMessageRevision = -1;

        return run.queuedMessageSessionId;
    }

    sendMessage(runId, content) {
        const run = this.requireStreamingRun(runId);
        if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Agent message is required');

        return queueInteractionWrite(run, async () => {
            await this.sendStreamingMessage(run, content);
            run.queuedMessage = null;
        });
    }

    sendQueuedMessage(runId, sessionId, revision) {
        const run = this.requireRun(runId);
        requireQueuedMessageSession(run, sessionId);
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent message revision');

        return queueInteractionWrite(run, async () => {
            requireQueuedMessageSession(run, sessionId);
            if (revision <= run.sentQueuedMessageRevision) throw new Error('Queued agent message was already sent');
            if (!run.queuedMessage) throw new Error('Queued agent message is empty');
            if (run.queuedMessage.revision !== revision) throw new Error('Queued agent message changed before it was sent');
            if (!run.streaming) throw new Error('Queued agent messaging requires a streaming agent');

            const { content, revision: queuedRevision } = run.queuedMessage;
            await this.sendStreamingMessage(run, content);
            run.queuedMessage = null;
            run.sentQueuedMessageRevision = queuedRevision;

            return { sent: true };
        });
    }

    async sendStreamingMessage(run, content) {
        const message = requireString(content, 'message');
        try {
            await run.streamingAdapter.sendMessage(message);
        } catch (error) {
            this.failStreamingRun(run, error);
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
        await this.persistCheckpoint(run);
        emitRunEvent(run, { type: 'userMessage', userMessage });
        emitRunEvent(run, { state: 'running', type: 'state' });
    }

    setQueuedMessage(runId, sessionId, content, revision) {
        const run = this.requireRun(runId);
        requireQueuedMessageSession(run, sessionId);
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent message revision');
        if (revision < run.queuedMessageRevision) return { accepted: false };
        if (typeof content !== 'string') throw new Error('Invalid queued agent message');
        run.queuedMessageRevision = revision;
        run.queuedMessage = content.trim().length > 0 ? { content, revision } : null;

        return { accepted: true };
    }

    answerQuestion(runId, requestId, answers) {
        const run = this.requireStreamingRun(runId);
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
                this.failStreamingRun(run, error);
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
            await this.persistCheckpoint(run);
            emitRunEvent(run, { state, type: 'questionAnswered', userMessage });
            emitRunEvent(run, { state, type: 'state' });
        });
    }

    answerApproval(runId, requestId, decision) {
        const run = this.requireStreamingRun(runId);
        if (!run.pendingApprovals.has(requestId)) throw new Error(`Unknown or stale agent approval request id: ${requestId}`);

        return queueInteractionWrite(run, async () => {
            await run.streamingAdapter.answerApproval(requestId, decision);
        });
    }

    finish(runId) {
        const run = this.requireStreamingRun(runId);
        run.finishing = true;
        run.queuedMessage = null;
        if (!run.turnActive || run.waitingForQuestion) this.beginFinishShutdown(run);
    }

    beginFinishShutdown(run) {
        if (run.finishTimeout !== null && run.finishTimeout !== undefined) return;
        run.finishTimeout = this.setTimeout(this.handleFinishTimeout, AGENT_FINISH_GRACE_MS, run.id);
        run.child.stdin.end();
    }

    clearFinishTimeout(run) {
        if (run.finishTimeout === null || run.finishTimeout === undefined) return;
        this.clearTimeout(run.finishTimeout);
        run.finishTimeout = null;
    }

    async handleFinishTimeout(runId) {
        const run = this.processes.get(runId);
        if (!run) return;
        run.finishTimeout = null;
        console.warn('[agent:finish-timeout]', {
            graceMs: AGENT_FINISH_GRACE_MS,
            pid: run.child.pid,
            runId,
            timestamp: new Date().toISOString(),
        });
        try {
            run.finishForced = await this.ensureTermination(run);
        } catch (error) {
            this.handleError(runId, error);
        }
    }

    stopAll() {
        const completions = [];
        for (const run of this.processes.values()) {
            run.cancelled = true;
            this.clearFinishTimeout(run);
            completions.push(Promise.all([this.ensureTermination(run), run.closed]));
        }

        return Promise.all(completions);
    }

    ensureTermination(run) {
        run.termination ??= this.terminateProcessTree(run.child);

        return run.termination;
    }

    handleCodexRuntimeEvent(event) {
        if (!this.codexRuntimeService) return;
        if (event.kind === 'unavailable') {
            this.codexRuntimeService.publishUnavailable(event.observedAt);
            return;
        }
        this.codexRuntimeService.publishRateLimits(event.payload, event.observedAt, event.kind === 'update');
    }

    handleOutput(runId, channel, chunk) {
        const run = this.processes.get(runId);
        if (!run) return;

        const content = chunk.toString();
        if (channel === 'stdout' && run.protocolLines) {
            run.protocolLines.push(chunk);
            return;
        }
        if (channel === 'stdout' && run.parser) {
            run.parser.push(chunk);
            return;
        }
        if (channel === 'stderr') {
            run.stderrBuffer += content;
            const filtered = filterCompleteStderrLines(run.stderrBuffer);
            run.stderrBuffer = filtered.remainder;
            if (filtered.content.length === 0) return;
            this.recordStderr(run, filtered.content);
            return;
        }
        this.recordOutput(runId, channel, content);
    }

    recordStderr(run, content) {
        const parts = content.split(/(\r\n|\r|\n)/u);
        for (let index = 0; index < parts.length; index += 2) {
            const line = parts[index];
            const delimiter = parts[index + 1] ?? '';
            if (line.length === 0 && delimiter.length === 0) continue;
            if (run.agent !== 'codex' || !isCodexCacheError(line)) {
                this.recordOutput(run.id, 'stderr', `${line}${delimiter}`);
                continue;
            }
            if (run.codexCacheErrorReported) continue;
            run.codexCacheErrorReported = true;
            const diagnostic = run.stderrHandling.then(async () => {
                const message = await this.diagnoseCodexCacheError(line, run.executable, run.environment);
                this.recordOutput(run.id, 'stderr', `${message}\n`);
            });
            run.stderrHandling = diagnostic.catch(() => {
                this.recordOutput(run.id, 'stderr', `${line}${delimiter}`);
            });
        }
    }

    handleStreamingLine(runId, line) {
        const run = this.processes.get(runId);
        if (!run) return;

        let message;
        try {
            message = JSON.parse(line);
        } catch {
            this.handleMalformedOutput(runId, line);
            return;
        }
        run.protocolHandling = run.protocolHandling
            .then(() => run.streamingAdapter.handleMessage(message))
            .catch((error) => {
                this.failStreamingRun(run, error);
            });
    }

    recordOutput(runId, channel, content) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        const safeContent = redactSecrets(content, run.secretValues);
        if (channel === 'stdout') {
            const { segment } = appendAssistantOutput(run, safeContent, timestamp);
            if (segment.length === 0) return;
            emitRunEvent(run, { content: segment, type: 'output' });
            return;
        }
        run.stderr += safeContent;
        run.conversation.entries.push(createEventEntry(
            `${runId}-error-${run.conversation.entries.length}`,
            'error',
            safeContent,
            timestamp,
            nextRunSequence(run),
        ));
        emitRunEvent(run, { content: safeContent, type: 'error' });
    }

    flushStderr(runId) {
        const run = this.processes.get(runId);
        if (!run || run.stderrBuffer.length === 0) return;

        const content = run.stderrBuffer;
        run.stderrBuffer = '';
        if (!isHiddenStderrLine(content)) this.recordStderr(run, content);
    }

    handleProviderEvent(runId, providerEvent) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        run.turnStarted = run.turnStarted || providerEvent.turnStarted;
        run.missingSession = run.missingSession || providerEvent.missingSession;
        providerEvent.changedPaths.forEach((filePath) => run.changedPaths.add(filePath));
        if (providerEvent.conversationId) run.providerConversationId = providerEvent.conversationId;
        if (providerEvent.usage) run.turnUsage = providerEvent.usage;
        for (const transcriptEvent of providerEvent.transcriptEvents) {
            run.conversation.entries.push(createEventEntry(
                `${runId}-provider-${run.conversation.entries.length}`,
                transcriptEvent.toolType,
                transcriptEvent.content,
                timestamp,
                nextRunSequence(run),
            ));
        }
        if (providerEvent.assistantText.length > 0) {
            const { segment } = appendAssistantOutput(run, providerEvent.assistantText, timestamp);
            if (segment.length > 0) emitRunEvent(run, { content: segment, type: 'output' });
        } else if (providerEvent.errorText.length > 0 && !run.reportedProviderErrors.has(providerEvent.errorText)) {
            const separator = run.stderr.length > 0 && !run.stderr.endsWith('\n') ? '\n' : '';
            run.reportedProviderErrors.add(providerEvent.errorText);
            run.stderr += `${separator}${providerEvent.errorText}`;
            run.conversation.entries.push(createEventEntry(
                `${runId}-error-${run.conversation.entries.length}`,
                'error',
                providerEvent.errorText,
                timestamp,
                nextRunSequence(run),
            ));
            emitRunEvent(run, { content: providerEvent.errorText, type: 'error' });
        }
    }

    async handleStreamingEvent(runId, event) {
        const run = this.processes.get(runId);
        if (!run) return;
        const timestamp = new Date().toISOString();

        if (event.type === 'sessionStarted') {
            run.providerConversationId = event.conversationId;
            return;
        }
        if (event.type === 'turnStarted') {
            run.assistantItemIndex = 0;
            run.assistantItems.clear();
            run.currentAssistantMessageId = null;
            run.turnStarted = true;
            return;
        }
        if (event.type === 'assistantStarted') {
            const item = startAssistantItem(run, requireString(event.itemId, 'assistant item id'), timestamp);
            emitRunEvent(run, { content: '', messageId: item.messageId, sequence: item.sequence, type: 'output' });
            return;
        }
        if (event.type === 'assistant') {
            const safeContent = redactSecrets(event.content, run.secretValues);
            const itemId = run.agent === 'codex'
                ? requireString(event.itemId, 'assistant item id')
                : event.itemId;
            const { message, segment } = appendAssistantOutput(run, safeContent, timestamp, itemId);
            if (segment.length > 0) {
                emitRunEvent(run, { content: segment, messageId: message.id, sequence: message.sequence, type: 'output' });
            }
            return;
        }
        if (event.type === 'changedPaths') {
            event.paths.forEach((filePath) => run.changedPaths.add(filePath));
            return;
        }
        if (event.type === 'event') {
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
                        `${runId}-event-${sequence}`,
                        timestamp,
                        sequence,
                    );
                    run.providerEventEntryIndexes.set(providerItemId, run.conversation.entries.length);
                    run.conversation.entries.push(eventEntry);
                }
            }
            emitRunEvent(run, { event: eventEntry, type: 'agentEvent' });
            return;
        }
        if (event.type === 'transcript') {
            const safeContent = redactSecrets(event.content, run.secretValues);
            run.conversation.entries.push(createEventEntry(
                `${runId}-provider-${run.conversation.entries.length}`,
                event.toolType,
                safeContent,
                timestamp,
                nextRunSequence(run),
            ));
            return;
        }
        if (event.type === 'error') {
            this.recordOutput(runId, 'stderr', event.content);
            return;
        }
        if (event.type === 'fatal') {
            this.failStreamingRun(run, new Error(event.content));
            return;
        }
        if (event.type === 'sessionFailed') {
            run.missingSession = event.missingSession;
            this.failStreamingRun(run, new Error(event.content));
            return;
        }
        if (event.type === 'question') {
            run.conversation.status = 'waitingForInput';
            run.waitingForQuestion = true;
            run.pendingQuestions = event.questions;
            await this.persistCheckpoint(run);
            emitRunEvent(run, { questions: event.questions, requestId: event.requestId, state: 'waitingForInput', type: 'question' });
            return;
        }
        if (event.type === 'approval') {
            const requestId = event.approval.requestId;
            if (run.pendingApprovals.has(requestId)) throw new Error(`Duplicate agent approval request id: ${requestId}`);
            run.pendingApprovals.set(requestId, { ...event.approval, submitted: false });
            run.conversation.status = 'waitingForInput';
            emitRunEvent(run, { approval: event.approval, state: 'waitingForInput', type: 'approval' });
            return;
        }
        if (event.type === 'approvalSubmitted') {
            const approval = run.pendingApprovals.get(event.requestId);
            if (!approval) return;
            approval.submitted = true;
            emitRunEvent(run, { requestId: event.requestId, type: 'approvalSubmitted' });
            return;
        }
        if (event.type === 'approvalResolved') {
            if (!run.pendingApprovals.delete(event.requestId)) return;
            const state = hasPendingInteraction(run) ? 'waitingForInput' : 'running';
            run.conversation.status = state;
            emitRunEvent(run, { requestId: event.requestId, state, type: 'approvalResolved' });
            emitRunEvent(run, { state, type: 'state' });
            return;
        }
        if (event.type !== 'turnCompleted') return;

        completeAssistantOutput(run, timestamp);
        run.turnActive = false;
        run.waitingForQuestion = false;
        run.pendingApprovals.clear();
        run.missingSession = run.missingSession || event.missingSession;
        if (event.missingSession) run.finishing = true;
        if (event.usage) run.conversation.usage = accumulateUsage(run.conversation.usage, event.usage);
        if (event.error) {
            this.failStreamingRun(run, new Error(event.error));
            return;
        }
        if (run.finishing) {
            this.beginFinishShutdown(run);
            return;
        }
        if (run.queuedMessage) {
            const { content, revision } = run.queuedMessage;
            run.conversation.status = 'waitingForInput';
            await this.sendStreamingMessage(run, content);
            run.queuedMessage = null;
            run.sentQueuedMessageRevision = revision;
            return;
        }
        const synchronizedMessage = lastMessageEntry(run.conversation);
        if (synchronizedMessage) updateProviderSession(run, synchronizedMessage.id, timestamp);
        run.conversation.status = 'waitingForInput';
        run.conversation.completedAt = null;
        run.conversation.entries.push(createEventEntry(
            `${runId}-turn-${run.turnIndex}-completed`,
            'turnCompleted',
            '',
            timestamp,
            nextRunSequence(run),
        ));
        await this.persistCheckpoint(run);
        emitRunEvent(run, { state: 'waitingForInput', type: 'state' });
    }

    handleMalformedOutput(runId, line) {
        const run = this.processes.get(runId);
        if (!run) return;

        if (!run.streaming) {
            const timestamp = new Date().toISOString();
            const message = `Malformed ${run.agent} JSONL event: ${line}`;
            run.conversation.entries.push(createEventEntry(
                `${runId}-malformed-${run.conversation.entries.length}`,
                'diagnostic',
                message,
                timestamp,
                nextRunSequence(run),
            ));
            return;
        }
        this.failStreamingRun(run, new Error(`Malformed ${run.agent} JSONL event`));
    }

    handleError(runId, error) {
        const run = this.processes.get(runId);
        if (!run) return;

        if (run.streaming) {
            this.failStreamingRun(run, error);
            return;
        }
        const timestamp = new Date().toISOString();
        const message = error instanceof Error ? error.message : 'Agent process failed';
        run.stderr += message;
        run.conversation.entries.push(createEventEntry(
            `${runId}-error-${run.conversation.entries.length}`,
            'error',
            message,
            timestamp,
            nextRunSequence(run),
        ));
        emitRunEvent(run, { content: message, type: 'error' });
    }

    failStreamingRun(run, errorValue) {
        if (run.streamingFailure) return run.termination;

        const error = errorValue instanceof Error ? errorValue : new Error('Streaming agent failed');
        const message = redactSecrets(error.message, run.secretValues);
        const timestamp = new Date().toISOString();
        run.streamingFailure = new Error(message);
        run.conversation.status = 'failed';
        run.queuedMessage = null;
        run.waitingForQuestion = false;
        run.pendingQuestions = [];
        const separator = run.stderr.length > 0 && !run.stderr.endsWith('\n') ? '\n' : '';
        run.stderr += `${separator}${message}`;
        run.conversation.entries.push(createEventEntry(
            `${run.id}-error-${run.conversation.entries.length}`,
            'error',
            message,
            timestamp,
            nextRunSequence(run),
        ));
        emitRunEvent(run, { content: message, type: 'error' });
        emitRunEvent(run, { state: 'failed', type: 'state' });
        try {
            run.child.stdin.end();
        } catch {
            // Process-tree termination below remains authoritative.
        }

        return this.ensureTermination(run);
    }

    async handleClose(runId, exitCode) {
        const run = this.processes.get(runId);
        if (!run) return;
        this.clearFinishTimeout(run);

        try {
            if (run.termination) await run.termination;
            run.parser?.finish();
            run.protocolLines?.finish();
            await run.protocolHandling;
            this.flushStderr(runId);
            await run.stderrHandling;
            const completedAt = new Date().toISOString();
            if (run.streaming && !run.finishing && !run.cancelled && !run.streamingFailure && !run.suspended) {
                run.streamingFailure = new Error('Streaming agent process exited before Finish');
                const separator = run.stderr.length > 0 && !run.stderr.endsWith('\n') ? '\n' : '';
                run.stderr += `${separator}${run.streamingFailure.message}`;
            }
            const succeeded = (exitCode === 0 || (run.finishing && run.finishForced))
                && !run.missingSession
                && !run.cancelled
                && !run.streamingFailure
                && (!run.streaming || run.finishing);
            completeAssistantOutput(run, completedAt);
            if (succeeded) {
                const synchronizedMessage = lastMessageEntry(run.conversation);
                updateProviderSession(run, synchronizedMessage.id, completedAt);
                if (run.turnUsage) run.conversation.usage = accumulateUsage(run.conversation.usage, run.turnUsage);
            }
            const preserveWaitingState = run.suspended && run.conversation.status === 'waitingForInput';
            run.conversation.completedAt = preserveWaitingState ? null : completedAt;
            run.conversation.status = preserveWaitingState
                ? 'waitingForInput'
                : run.cancelled ? 'cancelled' : succeeded ? 'completed' : 'failed';
            run.conversation.entries.push(createEventEntry(
                `${runId}-closed`,
                'closed',
                String(exitCode),
                completedAt,
                nextRunSequence(run),
            ));
            console.log('[agent:complete]', {
                completedAt,
                durationMs: Date.parse(completedAt) - Date.parse(run.startedAt),
                actionRunId: run.request.actionRunId ?? null,
                exitCode,
                pid: run.child.pid,
                runId,
            });
            await run.persistence;
            await this.persistConversation(run);
            this.processes.delete(runId);
            this.runningConversationIds.delete(run.conversation.id);
            emitRunEvent(run, { conversation: structuredClone(run.conversation), type: 'closed' });
            if (run.onComplete) run.onComplete(succeeded ? 0 : exitCode || 1, run);
        } catch (error) {
            if (run.onCompletionError) run.onCompletionError(error);
        } finally {
            this.processes.delete(runId);
            this.runningConversationIds.delete(run.conversation.id);
        }
    }

    requireRun(runId) {
        const run = this.processes.get(runId);
        if (!run) throw new Error(`Agent run is not active: ${runId}`);

        return run;
    }

    persistCheckpoint(run) {
        const snapshot = { ...run, conversation: structuredClone(run.conversation) };
        const write = run.persistence.then(() => this.persistConversationCheckpoint(snapshot));
        run.persistence = write.catch(() => undefined);

        return write;
    }

    requireStreamingRun(runId) {
        const run = this.requireRun(runId);
        if (!run.streaming) throw new Error(`Agent run is not streaming: ${runId}`);

        return run;
    }
}

module.exports = { AGENT_FINISH_GRACE_MS, AgentRunnerService };
