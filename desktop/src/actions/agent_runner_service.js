const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
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
    persistTerminalConversation,
} = require('./agent_conversation_persistence');
const { createAgentProviderProtocolParser } = require('./agent_provider_protocol');
const { AgentExecutableResolver } = require('./agent_executable_availability');
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

function terminateProcess(child) {
    if (process.platform !== 'win32' || !child.pid) {
        child.kill();
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const terminator = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
        terminator.on('error', () => {
            child.kill();
            resolve();
        });
        terminator.on('close', resolve);
    });
}

function emitRunEvent(run, event) {
    if (!run.onEvent) return;

    run.onEvent({ ...event, runId: run.id });
}

function assistantMessageId(runId) {
    return `${runId}-assistant`;
}

function joinChunk(existing, chunk) {
    const trimmed = chunk.replace(/^\n+|\n+$/g, '');
    if (existing.length === 0) return trimmed;
    if (trimmed.length === 0) return existing;

    return `${existing}\n\n${trimmed}`;
}

function appendAssistantOutput(run, content, timestamp) {
    run.stdout = joinChunk(run.stdout, content);
    const messageId = assistantMessageId(run.id);
    const currentIndex = run.conversation.messages.findIndex(({ id }) => id === messageId);
    if (currentIndex < 0) {
        run.conversation.messages.push(createMessage(messageId, 'assistant', content.replace(/^\n+|\n+$/g, ''), timestamp, run.agent));
        return;
    }

    const current = run.conversation.messages[currentIndex];
    run.conversation.messages[currentIndex] = { ...current, content: joinChunk(current.content, content), timestamp };
}

function completeAssistantOutput(run, completedAt) {
    const messageId = assistantMessageId(run.id);
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
        this.persistTerminalConversation = dependencies.persistTerminalConversation ?? persistTerminalConversation;
        this.executableResolver = dependencies.executableResolver ?? new AgentExecutableResolver();
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
        const argumentsList = [...configuredArguments, prompt];
        const child = crossSpawn(executable, argumentsList, {
            cwd: rootPath,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            // windowsHide: true,
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
            providerConversationId: null,
            reference,
            reportedProviderErrors: new Set(),
            request,
            stderr: '',
            stderrBuffer: '',
            stdout: '',
            turnStarted: false,
            termination: null,
            turnUsage: null,
        };
        run.parser = createAgentProviderProtocolParser(
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
        if (typeof request.contextInput === 'string' && request.contextInput.length > 0) child.stdin.write(request.contextInput);
        child.stdin.end();
        const userMessage = conversation.messages.at(-1);
        if (!userMessage || userMessage.role !== 'user') throw new Error('Missing current agent user message');
        emitRunEvent(run, {
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
        run.termination = terminateProcess(run.child);
    }

    stopAll() {
        for (const run of this.processes.values()) {
            run.cancelled = true;
            run.termination = terminateProcess(run.child);
        }
    }

    handleOutput(runId, channel, chunk) {
        const run = this.processes.get(runId);
        if (!run) return;

        const content = chunk.toString();
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

    recordOutput(runId, channel, content) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        if (channel === 'stdout') appendAssistantOutput(run, content, timestamp);
        else {
            run.stderr += content;
            run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', content, timestamp));
        }
        emitRunEvent(run, { content, type: channel === 'stdout' ? 'output' : 'error' });
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
            appendAssistantOutput(run, providerEvent.assistantText, timestamp);
            emitRunEvent(run, { content: providerEvent.assistantText, type: 'output' });
        } else if (providerEvent.errorText.length > 0 && !run.reportedProviderErrors.has(providerEvent.errorText)) {
            const separator = run.stderr.length > 0 && !run.stderr.endsWith('\n') ? '\n' : '';
            run.reportedProviderErrors.add(providerEvent.errorText);
            run.stderr += `${separator}${providerEvent.errorText}`;
            run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', providerEvent.errorText, timestamp));
            emitRunEvent(run, { content: providerEvent.errorText, type: 'error' });
        }
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
            run.parser?.finish();
            this.flushStderr(runId);
            const completedAt = new Date().toISOString();
            const succeeded = exitCode === 0
                && !run.missingSession
                && !run.cancelled;
            completeAssistantOutput(run, completedAt);
            if (succeeded) {
                const synchronizedMessage = run.conversation.messages.at(-1);
                updateProviderSession(run, synchronizedMessage.id, completedAt);
                if (run.turnUsage) run.conversation.usage = accumulateUsage(run.conversation.usage, run.turnUsage);
            }
            run.conversation.completedAt = completedAt;
            run.conversation.status = run.cancelled ? 'cancelled' : succeeded ? 'completed' : 'failed';
            run.conversation.events.push(createEvent(`${runId}-closed`, 'closed', String(exitCode), completedAt));
            await this.persistTerminalConversation(run);
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
}

module.exports = { AgentRunnerService };
