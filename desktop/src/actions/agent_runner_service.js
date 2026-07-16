const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');

const {
    createConversation,
    createEvent,
    createMessage,
    hasRequiredProviderConversationId,
    updateProviderSession,
} = require('./agent_conversation');
const {
    agentLogFilePath,
    clearIntermediatePersist,
    existingLogFilePath,
    persistConversation,
    queueConversationPersist,
    queueThrottledConversationPersist,
} = require('./agent_conversation_persistence');
const { createAgentProviderProtocolParser } = require('./agent_provider_protocol');
const { assertGitRoot, ensureInsideRoot, requireRootPath } = require('../git/git_commands');
const { normalizePath } = require('../../../shared/path_utils.mjs');

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing agent ${fieldName}`);

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

function emitRunEvent(run, type, content) {
    if (!run.onEvent) return;

    run.onEvent({ content, conversation: { ...run.conversation, path: run.reference }, runId: run.id, type });
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
        turnStarted: run.turnStarted,
    };
}

class AgentRunnerService {
    constructor() {
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

    async start(project, request, onEvent, onComplete, onCompletionError) {
        const rootPath = requireRootPath(project);
        await assertGitRoot(rootPath);
        const command = requireCommand(request?.command);
        readOptionalString(request?.actionId, 'actionId');
        const cardPath = readOptionalString(request?.cardPath, 'cardPath');
        const scopePath = requireString(request?.scopePath ?? cardPath, 'scopePath');
        const prompt = requireString(request?.prompt, 'prompt');
        const agent = requireString(request?.agent ?? 'generic', 'agent');
        if (cardPath) ensureInsideRoot(rootPath, path.join(rootPath, cardPath));

        const id = `agent-turn-${crypto.randomUUID()}`;
        const startedAt = new Date().toISOString();
        const conversation = createConversation(request, `agent-${crypto.randomUUID()}`, startedAt);
        if (this.runningConversationIds.has(conversation.id)) throw new Error(`Agent conversation already has a running turn: ${conversation.id}`);
        const filePath = request.reference
            ? existingLogFilePath(rootPath, request.reference)
            : agentLogFilePath(rootPath, scopePath, conversation.id);
        const reference = request.reference ?? normalizePath(path.relative(rootPath, filePath));
        const lastMessage = conversation.messages.at(-1);
        if (request.reuseLastUserMessage) {
            if (lastMessage?.role !== 'user' || lastMessage.content !== prompt) throw new Error('Missing failed-turn user message for agent retry');
        } else {
            conversation.messages.push(createMessage(`${id}-user`, 'user', prompt, startedAt));
        }
        conversation.events.push(createEvent(`${id}-started`, 'started', command.join(' '), startedAt));
        await persistConversation(filePath, conversation);

        const [executable, ...configuredArguments] = command;
        const argumentsList = [...configuredArguments, JSON.stringify(prompt)]; // normalize
        const child = spawn(executable, argumentsList, {
            cwd: rootPath,
            env: process.env,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        const run = {
            agent,
            cancelled: false,
            child,
            conversation,
            filePath,
            id,
            intermediatePersistTimer: null,
            lastIntermediatePersistAt: 0,
            malformedOutput: false,
            missingSession: false,
            onComplete,
            onCompletionError,
            onEvent,
            providerConversationId: null,
            reference,
            request,
            stderr: '',
            stdout: '',
            turnStarted: false,
            termination: null,
            writeChain: Promise.resolve(),
        };
        run.parser = createAgentProviderProtocolParser(
            agent,
            (event) => this.handleProviderEvent(id, event),
            (line) => this.handleMalformedOutput(id, line),
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
        emitRunEvent(run, 'started', '');

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
        if (channel === 'stdout') run.stdout += content;
        else run.stderr += content;
        const timestamp = new Date().toISOString();
        run.conversation.events.push(createEvent(`${runId}-${channel}-${run.conversation.events.length}`, channel, content, timestamp));
        void queueThrottledConversationPersist(run);
        emitRunEvent(run, channel, content);
    }

    handleProviderEvent(runId, providerEvent) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        run.turnStarted = run.turnStarted || providerEvent.turnStarted;
        run.missingSession = run.missingSession || providerEvent.missingSession;
        if (providerEvent.conversationId) run.providerConversationId = providerEvent.conversationId;
        run.conversation.events.push(createEvent(
            `${runId}-provider-${run.conversation.events.length}`,
            providerEvent.type,
            JSON.stringify(providerEvent.event),
            timestamp,
        ));
        if (providerEvent.assistantText.length > 0) {
            run.stdout += providerEvent.assistantText;
            emitRunEvent(run, 'output', providerEvent.assistantText);
        } else {
            emitRunEvent(run, 'provider', JSON.stringify(providerEvent.event));
        }
        void queueThrottledConversationPersist(run);
    }

    handleMalformedOutput(runId, line) {
        const run = this.processes.get(runId);
        if (!run) return;

        run.malformedOutput = true;
        const timestamp = new Date().toISOString();
        const message = `Malformed ${run.agent} JSONL event: ${line}`;
        run.stderr += message;
        run.conversation.events.push(createEvent(`${runId}-malformed-${run.conversation.events.length}`, 'error', message, timestamp));
        emitRunEvent(run, 'error', message);
        run.termination = terminateProcess(run.child);
    }

    handleError(runId, error) {
        const run = this.processes.get(runId);
        if (!run) return;

        const timestamp = new Date().toISOString();
        const message = error instanceof Error ? error.message : 'Agent process failed';
        run.stderr += message;
        run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', message, timestamp));
        void queueConversationPersist(run);
        emitRunEvent(run, 'error', message);
    }

    async handleClose(runId, exitCode) {
        const run = this.processes.get(runId);
        if (!run) return;

        try {
            if (run.termination) await run.termination;
            run.parser?.finish();
            clearIntermediatePersist(run);
            await run.writeChain;
            const completedAt = new Date().toISOString();
            const providerConversationIdPresent = hasRequiredProviderConversationId(run);
            const succeeded = exitCode === 0
                && !run.malformedOutput
                && !run.missingSession
                && !run.cancelled
                && providerConversationIdPresent;
            if (!providerConversationIdPresent) {
                const message = `Missing ${run.agent} conversation id in structured output`;
                run.stderr += message;
                run.conversation.events.push(createEvent(`${runId}-missing-conversation-id`, 'error', message, completedAt));
                emitRunEvent(run, 'error', message);
            }
            if (run.stdout.length > 0) {
                run.conversation.messages.push(createMessage(`${runId}-assistant`, 'assistant', run.stdout, completedAt, run.agent));
            }
            if (succeeded) {
                const synchronizedMessage = run.conversation.messages.at(-1);
                updateProviderSession(run, synchronizedMessage.id, completedAt);
            }
            run.conversation.completedAt = completedAt;
            run.conversation.status = run.cancelled ? 'cancelled' : succeeded ? 'completed' : 'failed';
            run.conversation.events.push(createEvent(`${runId}-closed`, 'closed', String(exitCode), completedAt));
            await queueConversationPersist(run);
            this.processes.delete(runId);
            this.runningConversationIds.delete(run.conversation.id);
            emitRunEvent(run, 'closed', String(exitCode));
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
