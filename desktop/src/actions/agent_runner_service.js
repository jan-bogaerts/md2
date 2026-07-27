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

function assistantMessageId(run) {
    return run.streaming ? `${run.id}-turn-${run.turnIndex}-assistant` : `${run.id}-assistant`;
}

/** Exact text appended to `existing` for `chunk`, including the paragraph separator. */
function chunkSegment(existing, chunk) {
    const trimmed = chunk.replace(/^\n+|\n+$/g, '');
    if (trimmed.length === 0) return '';
    if (existing.length === 0) return trimmed;

    return `\n\n${trimmed}`;
}

function joinChunk(existing, chunk) {
    return `${existing}${chunkSegment(existing, chunk)}`;
}

/** Appends a chunk and returns the appended segment, so streamed events carry the same separators. */
function appendAssistantOutput(run, content, timestamp) {
    const segment = chunkSegment(run.stdout, content);
    run.stdout += segment;
    const messageId = assistantMessageId(run);
    const currentIndex = run.conversation.messages.findIndex(({ id }) => id === messageId);
    if (currentIndex < 0) {
        run.conversation.messages.push(createMessage(messageId, 'assistant', content.replace(/^\n+|\n+$/g, ''), timestamp, run.agent));
        return segment;
    }

    const current = run.conversation.messages[currentIndex];
    run.conversation.messages[currentIndex] = { ...current, content: joinChunk(current.content, content), timestamp };

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
            pendingQuestions: [],
            providerConversationId: null,
            protocolBuffer: '',
            reference,
            reportedProviderErrors: new Set(),
            queuedMessage: null,
            queuedMessageRevision: -1,
            sentQueuedMessageRevision: -1,
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
        const writeLine = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
        run.streamingAdapter = streaming
            ? createAgentStreamingAdapter(
                agent,
                writeLine,
                (event) => this.handleStreamingEvent(id, event),
                rootPath,
                request.providerConversationId,
            )
            : null;
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
        child.on('close', (exitCode) => {
            void this.handleClose(id, exitCode ?? 1);
        });
        if (streaming) {
            const initialPrompt = typeof request.contextInput === 'string' && request.contextInput.length > 0
                ? `${request.contextInput}\n\n[User]\n\n${prompt}`
                : prompt;
            run.streamingAdapter.start(initialPrompt);
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
        run.queuedMessage = null;
        this.sendStreamingMessage(run, content);
    }

    sendQueuedMessage(runId, revision) {
        const run = this.requireRun(runId);
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent message revision');
        if (revision <= run.sentQueuedMessageRevision) return;
        if (!run.queuedMessage || run.queuedMessage.revision > revision) return;
        if (!run.streaming) return;

        const { content, revision: queuedRevision } = run.queuedMessage;
        run.queuedMessage = null;
        run.sentQueuedMessageRevision = queuedRevision;
        this.sendStreamingMessage(run, content);
    }

    sendStreamingMessage(run, content) {
        const timestamp = new Date().toISOString();
        if (run.conversation.status === 'waitingForInput') run.turnIndex += 1;
        const messageId = `${run.id}-user-${run.conversation.messages.length}`;
        run.conversation.messages.push(createMessage(messageId, 'user', requireString(content, 'message'), timestamp));
        const userMessage = run.conversation.messages.at(-1);
        run.conversation.status = 'running';
        run.turnActive = true;
        run.streamingAdapter.sendMessage(content);
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
        const timestamp = new Date().toISOString();
        const secretQuestionIds = new Set(run.pendingQuestions.filter(({ isSecret }) => isSecret).map(({ id }) => id));
        const content = Object.entries(answers)
            .map(([questionId, answer]) => (
                `${questionId}: ${secretQuestionIds.has(questionId) ? '[secret]' : Array.isArray(answer) ? answer.join(', ') : answer}`
            ))
            .join('\n');
        run.conversation.messages.push(createMessage(`${run.id}-answer-${run.conversation.messages.length}`, 'user', content, timestamp));
        const userMessage = run.conversation.messages.at(-1);
        run.conversation.status = 'running';
        run.waitingForQuestion = false;
        run.pendingQuestions = [];
        run.streamingAdapter.answerQuestion(requestId, answers);
        this.queuePersistence(run);
        emitRunEvent(run, { type: 'questionAnswered', userMessage });
        emitRunEvent(run, { state: 'running', type: 'state' });
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
                run.streamingFailure = error instanceof Error ? error : new Error('Agent conversation persistence failed');
                this.ensureTermination(run);
            });

        return run.persistence;
    }

    handleOutput(runId, channel, chunk) {
        const run = this.processes.get(runId);
        if (!run) return;

        const content = chunk.toString();
        if (channel === 'stdout' && run.streamingAdapter) {
            run.protocolBuffer += content;
            const lines = run.protocolBuffer.split(/\r?\n/u);
            run.protocolBuffer = lines.pop() ?? '';
            for (const line of lines) this.handleStreamingLine(runId, line);
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
        if (!run || line.trim().length === 0) return;

        try {
            run.streamingAdapter.handleMessage(JSON.parse(line));
        } catch {
            this.handleMalformedOutput(runId, line);
        }
    }

    recordOutput(runId, channel, content) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        if (channel === 'stdout') {
            const segment = appendAssistantOutput(run, content, timestamp);
            if (segment.length === 0) return;
            emitRunEvent(run, { content: segment, type: 'output' });
            return;
        }
        run.stderr += content;
        run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', content, timestamp));
        emitRunEvent(run, { content, type: 'error' });
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
                transcriptEvent.type,
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

    handleStreamingEvent(runId, event) {
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
            const segment = appendAssistantOutput(run, event.content, timestamp);
            if (segment.length > 0) emitRunEvent(run, { content: segment, type: 'output' });
            return;
        }
        if (event.type === 'changedPaths') {
            event.paths.forEach((filePath) => run.changedPaths.add(filePath));
            return;
        }
        if (event.type === 'transcript') {
            run.conversation.events.push(createEvent(
                `${runId}-provider-${run.conversation.events.length}`,
                event.eventType,
                event.content,
                timestamp,
            ));
            return;
        }
        if (event.type === 'error') {
            this.recordOutput(runId, 'stderr', event.content);
            return;
        }
        if (event.type === 'sessionFailed') {
            run.missingSession = event.missingSession;
            this.recordOutput(runId, 'stderr', event.content);
            run.finishing = true;
            run.child.stdin.end();
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
            run.streamingFailure = new Error(event.error);
            this.recordOutput(runId, 'stderr', event.error);
            run.child.stdin.end();
            return;
        }
        if (run.finishing) {
            run.child.stdin.end();
            return;
        }
        if (run.queuedMessage) {
            const { content, revision } = run.queuedMessage;
            run.queuedMessage = null;
            run.sentQueuedMessageRevision = revision;
            run.conversation.status = 'waitingForInput';
            this.sendStreamingMessage(run, content);
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

        const timestamp = new Date().toISOString();
        const message = `Malformed ${run.agent} JSONL event: ${line}`;
        run.conversation.events.push(createEvent(`${runId}-malformed-${run.conversation.events.length}`, 'diagnostic', message, timestamp));
    }

    handleError(runId, error) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        const message = error instanceof Error ? error.message : 'Agent process failed';
        run.stderr += message;
        run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', message, timestamp));
        emitRunEvent(run, { content: message, type: 'error' });
    }

    async handleClose(runId, exitCode) {
        const run = this.processes.get(runId);
        if (!run) return;

        try {
            if (run.termination) await run.termination;
            else await this.terminateDescendantProcesses(run.child.pid);
            run.parser?.finish();
            if (run.streamingAdapter && run.protocolBuffer.length > 0) {
                this.handleStreamingLine(runId, run.protocolBuffer);
                run.protocolBuffer = '';
            }
            this.flushStderr(runId);
            await run.persistence;
            const completedAt = new Date().toISOString();
            const succeeded = exitCode === 0
                && !run.missingSession
                && !run.cancelled
                && !run.streamingFailure
                && (!run.streaming || run.finishing);
            if (run.streaming && !run.finishing && !run.cancelled && !run.streamingFailure) {
                run.streamingFailure = new Error('Streaming agent process exited before Finish');
                const separator = run.stderr.length > 0 && !run.stderr.endsWith('\n') ? '\n' : '';
                run.stderr += `${separator}${run.streamingFailure.message}`;
            }
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
