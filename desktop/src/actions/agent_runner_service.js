const crypto = require('node:crypto');
const path = require('node:path');
const crossSpawn = require('cross-spawn');

const {
    accumulateUsage,
    createConversation,
    createEvent,
    createMessage,
    updateProviderSession,
} = require('./agent_conversation');
const {
    conversationReference,
    persistConversation,
} = require('./agent_conversation_persistence');
const { JsonLineBuffer } = require('./agent_event_utils');
const { createAgentProviderProtocolParser } = require('./agent_provider_protocol');
const { createAgentStreamingAdapter } = require('./agent_streaming_adapter');
const { AgentExecutableResolver } = require('./agent_executable_availability');
const { terminateDescendantProcesses, terminateProcessTree } = require('./process_tree');
const { assertGitRoot, ensureInsideRoot, requireRootPath } = require('../git/git_commands');

const HIDDEN_STDERR_LINES = [
    /^completed$/i,
    /^Debugger listening on ws:\/\//,
    /^For help, see: https:\/\/nodejs\.org\/en\/docs\/inspector\/?$/,
    /^Debugger attached\.$/,
    /^Reading additional input from stdin\.\.\.$/,
    /^Waiting for the debugger to disconnect\.\.\.$/,
];

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

function assistantMessageId(run) {
    return run.streaming ? `${run.id}-turn-${run.turnIndex}-assistant` : `${run.id}-assistant`;
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
function appendAssistantOutput(run, content, timestamp) {
    const segment = chunkSegment(run.stdout, content, run.streaming);
    run.stdout += segment;
    const messageId = assistantMessageId(run);
    const currentIndex = run.conversation.messages.findIndex(({ id }) => id === messageId);
    if (currentIndex < 0) {
        const initialContent = run.streaming ? content : content.replace(/^\n+|\n+$/g, '');
        run.conversation.messages.push(createMessage(messageId, 'assistant', initialContent, timestamp, run.agent));
        return segment;
    }

    const current = run.conversation.messages[currentIndex];
    run.conversation.messages[currentIndex] = { ...current, content: joinChunk(current.content, content, run.streaming), timestamp };

    return segment;
}

function completeAssistantOutput(run, completedAt) {
    const messageId = assistantMessageId(run);
    const currentIndex = run.conversation.messages.findIndex(({ id }) => id === messageId);
    if (currentIndex < 0) return;

    run.conversation.messages[currentIndex] = { ...run.conversation.messages[currentIndex], timestamp: completedAt };
}

function createRunResult(request, exitCode, run) {
    return {
        command: request.command,
        conversation: { ...run.conversation, path: run.reference },
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
        this.persistConversation = dependencies.persistConversation
            ?? dependencies.persistTerminalConversation
            ?? persistConversation;
        this.executableResolver = dependencies.executableResolver ?? new AgentExecutableResolver();
        this.terminateDescendantProcesses = dependencies.terminateDescendantProcesses ?? terminateDescendantProcesses;
        this.terminateProcessTree = dependencies.terminateProcessTree ?? terminateProcessTree;
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
        const conversation = createConversation(request, `agent-${crypto.randomUUID()}`, startedAt);
        if (this.runningConversationIds.has(conversation.id)) throw new Error(`Agent conversation already has a running turn: ${conversation.id}`);
        const reference = request.reference ?? conversationReference(request, conversation.id);
        const lastMessage = conversation.messages.at(-1);
        if (request.reuseLastUserMessage) {
            if (lastMessage?.role !== 'user' || lastMessage.content !== prompt) throw new Error('Missing failed-turn user message for agent retry');
        } else {
            conversation.messages.push(createMessage(`${id}-user`, 'user', prompt, startedAt));
        }
        conversation.events.push(createEvent(`${id}-started`, 'started', command.join(' '), startedAt));
        const [configuredExecutable, ...configuredArguments] = command;
        const resolvedExecutable = await this.executableResolver.find(configuredExecutable, { cwd: rootPath, env: process.env });
        const executable = resolvedExecutable ?? configuredExecutable;
        const argumentsList = streaming ? configuredArguments : [...configuredArguments, prompt];
        const child = crossSpawn(executable, argumentsList, {
            cwd: rootPath,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            // windowsHide: true,
        });
        console.log('[agent:start]', {
            arguments: configuredArguments,
            cwd: rootPath,
            executionId: request.executionId ?? null,
            executable,
            pid: child.pid,
            runId: id,
            startedAt,
        });
        const run = {
            agent,
            cancelled: false,
            child,
            changedPaths: new Set(),
            conversation,
            id,
            missingSession: false,
            onComplete,
            onCompletionError,
            onEvent,
            interactionWrites: Promise.resolve(),
            pendingQuestions: [],
            providerConversationId: null,
            protocolLines: null,
            protocolHandling: Promise.resolve(),
            reference,
            reportedProviderErrors: new Set(),
            queuedMessage: null,
            queuedMessageRevision: -1,
            sentQueuedMessageRevision: -1,
            secretValues: new Set(),
            request,
            stderr: '',
            stderrBuffer: '',
            finishing: false,
            stdout: '',
            startedAt,
            streaming,
            streamingFailure: null,
            turnStarted: false,
            turnIndex: 1,
            turnActive: streaming,
            termination: null,
            turnUsage: null,
            waitingForQuestion: false,
            persistence: Promise.resolve(),
        };
        const writeLine = (message) => writeJsonLine(child.stdin, message);
        run.streamingAdapter = streaming
            ? createAgentStreamingAdapter(
                agent,
                writeLine,
                (event) => this.handleStreamingEvent(id, event),
                rootPath,
                request.providerConversationId,
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
            void this.handleClose(id, exitCode ?? 1);
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
            this.queuePersistence(run);
        } else {
            if (typeof request.contextInput === 'string' && request.contextInput.length > 0) child.stdin.write(request.contextInput);
            child.stdin.end();
        }
        const userMessage = conversation.messages.at(-1);
        if (!userMessage || userMessage.role !== 'user') throw new Error('Missing current agent user message');
        emitRunEvent(run, {
            continued: !!request.conversation,
            conversationId: conversation.id,
            reference,
            startedAt,
            title: conversation.title,
            type: 'started',
            userMessage,
        });

        return { conversation: { ...conversation, path: reference }, reference, runId: id };
    }

    stop(runId) {
        const run = this.requireRun(runId);
        run.cancelled = true;
        run.queuedMessage = null;

        return this.ensureTermination(run);
    }

    sendMessage(runId, content) {
        const run = this.requireStreamingRun(runId);
        if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Agent message is required');

        return queueInteractionWrite(run, async () => {
            await this.sendStreamingMessage(run, content);
            run.queuedMessage = null;
        });
    }

    sendQueuedMessage(runId, revision) {
        const run = this.requireRun(runId);
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent message revision');

        return queueInteractionWrite(run, async () => {
            if (revision <= run.sentQueuedMessageRevision) return;
            if (!run.queuedMessage || run.queuedMessage.revision > revision) return;
            if (!run.streaming) return;

            const { content, revision: queuedRevision } = run.queuedMessage;
            await this.sendStreamingMessage(run, content);
            run.queuedMessage = null;
            run.sentQueuedMessageRevision = queuedRevision;
        });
    }

    async sendStreamingMessage(run, content) {
        const message = requireString(content, 'message');
        try {
            await run.streamingAdapter.sendMessage(message);
        } catch (error) {
            this.failStreamingRun(run, error);
            run.conversation.status = 'failed';
            this.queuePersistence(run);
            throw error;
        }
        const timestamp = new Date().toISOString();
        if (run.conversation.status === 'waitingForInput') run.turnIndex += 1;
        const messageId = `${run.id}-user-${run.conversation.messages.length}`;
        run.conversation.messages.push(createMessage(messageId, 'user', message, timestamp));
        const userMessage = run.conversation.messages.at(-1);
        run.conversation.status = 'running';
        run.turnActive = true;
        this.queuePersistence(run);
        emitRunEvent(run, { type: 'userMessage', userMessage });
        emitRunEvent(run, { state: 'running', type: 'state' });
    }

    setQueuedMessage(runId, content, revision) {
        const run = this.requireRun(runId);
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent message revision');
        if (revision < run.queuedMessageRevision) return;
        if (typeof content !== 'string') throw new Error('Invalid queued agent message');
        run.queuedMessageRevision = revision;
        run.queuedMessage = content.trim().length > 0 ? { content, revision } : null;
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
            try {
                await run.streamingAdapter.answerQuestion(requestId, answers);
            } catch (error) {
                this.failStreamingRun(run, error);
                run.conversation.status = 'failed';
                this.queuePersistence(run);
                throw error;
            }
            const timestamp = new Date().toISOString();
            run.secretValues ??= new Set();
            secretAnswerValues(pendingQuestions, answers).forEach((answer) => run.secretValues.add(answer));
            run.conversation.messages.push(createMessage(`${run.id}-answer-${run.conversation.messages.length}`, 'user', content, timestamp));
            const userMessage = run.conversation.messages.at(-1);
            run.conversation.status = 'running';
            run.waitingForQuestion = false;
            run.pendingQuestions = [];
            this.queuePersistence(run);
            emitRunEvent(run, { type: 'questionAnswered', userMessage });
            emitRunEvent(run, { state: 'running', type: 'state' });
        });
    }

    finish(runId) {
        const run = this.requireStreamingRun(runId);
        run.finishing = true;
        run.queuedMessage = null;
        if (!run.turnActive || run.waitingForQuestion) run.child.stdin.end();
    }

    stopAll() {
        const terminations = [];
        for (const run of this.processes.values()) {
            run.cancelled = true;
            terminations.push(this.ensureTermination(run));
        }

        return Promise.all(terminations);
    }

    ensureTermination(run) {
        run.termination ??= this.terminateProcessTree(run.child);

        return run.termination;
    }

    queuePersistence(run) {
        run.persistence = run.persistence
            .then(() => this.persistConversation(run))
            .catch((error) => {
                this.failStreamingRun(run, error instanceof Error ? error : new Error('Agent conversation persistence failed'));
            });

        return run.persistence;
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
            this.recordOutput(runId, channel, filtered.content);
            return;
        }
        this.recordOutput(runId, channel, content);
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
                this.queuePersistence(run);
            });
    }

    recordOutput(runId, channel, content) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        const safeContent = redactSecrets(content, run.secretValues);
        if (channel === 'stdout') {
            const segment = appendAssistantOutput(run, safeContent, timestamp);
            if (segment.length === 0) return;
            emitRunEvent(run, { content: segment, type: 'output' });
            return;
        }
        run.stderr += safeContent;
        run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', safeContent, timestamp));
        emitRunEvent(run, { content: safeContent, type: 'error' });
    }

    flushStderr(runId) {
        const run = this.processes.get(runId);
        if (!run || run.stderrBuffer.length === 0) return;

        const content = run.stderrBuffer;
        run.stderrBuffer = '';
        if (!isHiddenStderrLine(content)) this.recordOutput(runId, 'stderr', content);
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
            run.conversation.events.push(createEvent(
                `${runId}-provider-${run.conversation.events.length}`,
                transcriptEvent.toolType,
                transcriptEvent.content,
                timestamp,
            ));
        }
        if (providerEvent.assistantText.length > 0) {
            const segment = appendAssistantOutput(run, providerEvent.assistantText, timestamp);
            if (segment.length > 0) emitRunEvent(run, { content: segment, type: 'output' });
        } else if (providerEvent.errorText.length > 0 && !run.reportedProviderErrors.has(providerEvent.errorText)) {
            const separator = run.stderr.length > 0 && !run.stderr.endsWith('\n') ? '\n' : '';
            run.reportedProviderErrors.add(providerEvent.errorText);
            run.stderr += `${separator}${providerEvent.errorText}`;
            run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', providerEvent.errorText, timestamp));
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
            run.turnStarted = true;
            return;
        }
        if (event.type === 'assistant') {
            const safeContent = redactSecrets(event.content, run.secretValues);
            const segment = appendAssistantOutput(run, safeContent, timestamp);
            if (segment.length > 0) emitRunEvent(run, { content: segment, type: 'output' });
            return;
        }
        if (event.type === 'changedPaths') {
            event.paths.forEach((filePath) => run.changedPaths.add(filePath));
            return;
        }
        if (event.type === 'transcript') {
            const safeContent = redactSecrets(event.content, run.secretValues);
            run.conversation.events.push(createEvent(
                `${runId}-provider-${run.conversation.events.length}`,
                event.toolType,
                safeContent,
                timestamp,
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
            emitRunEvent(run, { questions: event.questions, requestId: event.requestId, state: 'waitingForInput', type: 'question' });
            this.queuePersistence(run);
            return;
        }
        if (event.type !== 'turnCompleted') return;

        completeAssistantOutput(run, timestamp);
        run.turnActive = false;
        run.waitingForQuestion = false;
        run.missingSession = run.missingSession || event.missingSession;
        if (event.missingSession) run.finishing = true;
        if (event.usage) run.conversation.usage = accumulateUsage(run.conversation.usage, event.usage);
        if (event.error) {
            this.failStreamingRun(run, new Error(event.error));
            return;
        }
        if (run.finishing) {
            run.child.stdin.end();
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
        const synchronizedMessage = run.conversation.messages.at(-1);
        if (synchronizedMessage) updateProviderSession(run, synchronizedMessage.id, timestamp);
        run.conversation.status = 'waitingForInput';
        run.conversation.completedAt = null;
        run.conversation.events.push(createEvent(`${runId}-turn-${run.turnIndex}-completed`, 'turnCompleted', '', timestamp));
        emitRunEvent(run, { state: 'waitingForInput', type: 'state' });
        this.queuePersistence(run);
    }

    handleMalformedOutput(runId, line) {
        const run = this.processes.get(runId);
        if (!run) return;

        if (!run.streaming) {
            const timestamp = new Date().toISOString();
            const message = `Malformed ${run.agent} JSONL event: ${line}`;
            run.conversation.events.push(createEvent(`${runId}-malformed-${run.conversation.events.length}`, 'diagnostic', message, timestamp));
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
        run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', message, timestamp));
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
        run.conversation.events.push(createEvent(`${run.id}-error-${run.conversation.events.length}`, 'error', message, timestamp));
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

        try {
            if (run.termination) await run.termination;
            else await this.terminateDescendantProcesses(run.child.pid);
            run.parser?.finish();
            run.protocolLines?.finish();
            await run.protocolHandling;
            this.flushStderr(runId);
            await run.persistence;
            const completedAt = new Date().toISOString();
            if (run.streaming && !run.finishing && !run.cancelled && !run.streamingFailure) {
                run.streamingFailure = new Error('Streaming agent process exited before Finish');
                const separator = run.stderr.length > 0 && !run.stderr.endsWith('\n') ? '\n' : '';
                run.stderr += `${separator}${run.streamingFailure.message}`;
            }
            const succeeded = exitCode === 0
                && !run.missingSession
                && !run.cancelled
                && !run.streamingFailure
                && (!run.streaming || run.finishing);
            completeAssistantOutput(run, completedAt);
            if (succeeded) {
                const synchronizedMessage = run.conversation.messages.at(-1);
                updateProviderSession(run, synchronizedMessage.id, completedAt);
                if (run.turnUsage) run.conversation.usage = accumulateUsage(run.conversation.usage, run.turnUsage);
            }
            run.conversation.completedAt = completedAt;
            run.conversation.status = run.cancelled ? 'cancelled' : succeeded ? 'completed' : 'failed';
            run.conversation.events.push(createEvent(`${runId}-closed`, 'closed', String(exitCode), completedAt));
            console.log('[agent:complete]', {
                completedAt,
                durationMs: Date.parse(completedAt) - Date.parse(run.startedAt),
                executionId: run.request.executionId ?? null,
                exitCode,
                pid: run.child.pid,
                runId,
            });
            await this.persistConversation(run);
            this.processes.delete(runId);
            this.runningConversationIds.delete(run.conversation.id);
            emitRunEvent(run, { reference: run.reference, status: run.conversation.status, type: 'closed' });
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

    requireStreamingRun(runId) {
        const run = this.requireRun(runId);
        if (!run.streaming) throw new Error(`Agent run is not streaming: ${runId}`);

        return run;
    }
}

module.exports = { AgentRunnerService };
