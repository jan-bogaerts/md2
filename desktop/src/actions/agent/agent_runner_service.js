const crypto = require('node:crypto');
const path = require('node:path');
const crossSpawn = require('cross-spawn');

const {
    accumulateUsage,
    createConversation,
    createEventEntry,
    createMessageEntry,
    snapshotConversation,
    transitionConversationStatus,
    updateProviderSession,
} = require('./agent_conversation');
const {
    conversationReference,
    persistConversation,
    persistConversationCheckpoint,
} = require('./agent_conversation_persistence');
const { AgentExecutableResolver, executableFromCommand } = require('./agent_executable_availability');
const { createAgentEnvironment } = require('./agent_environment');
const { ClaudeUsagePoller } = require('./claude_usage_poller');
const { CodexUsagePoller } = require('./codex_usage_poller');
const { diagnoseCodexCacheError, isCodexCacheError } = require('./agent_codex_cache_diagnostic');
const { logAgentEvent } = require('./agent_file_logger');
const { recordProviderEvent } = require('./agent_provider_event');
const agentInteractions = require('./agent_run_interactions');
const {
    attachRunProtocol,
    createRun,
    createRunResult,
    emitRunEvent,
} = require('./agent_run_state');
const {
    appendAssistantOutput,
    completeAssistantOutput,
    lastMessageEntry,
    nextConversationSequence,
    nextRunSequence,
} = require('./agent_run_transcript');
const {
    readOptionalString,
    requireCommand,
    requireProjectFolder,
    requireString,
} = require('./agent_run_validation');
const { redactSecrets } = require('./agent_secret_redaction');
const { filterCompleteStderrLines, isHiddenStderrLine, stripAnsi } = require('./agent_stderr_filter');
const { STREAMING_EVENT_HANDLERS } = require('./agent_streaming_event_handlers');
const { terminateProcessTree } = require('../process_tree');
const { assertGitRoot, ensureInsideRoot, requireRootPath } = require('../../git/git_commands');

const AGENT_FINISH_GRACE_MS = 5_000;
const AGENT_USAGE_POLL_TICK_MS = 120_000;

class AgentRunnerService {
    constructor(dependencies = {}) {
        this.claudeRuntimeService = dependencies.claudeRuntimeService ?? null;
        this.codexRuntimeService = dependencies.codexRuntimeService ?? null;
        this.usageMetricsService = dependencies.usageMetricsService ?? null;
        this.persistConversation = dependencies.persistConversation
            ?? dependencies.persistTerminalConversation
            ?? persistConversation;
        this.persistConversationCheckpoint = dependencies.persistConversationCheckpoint
            ?? persistConversationCheckpoint;
        this.persistSuccessfulConversationTurn = dependencies.persistSuccessfulConversationTurn
            ?? dependencies.persistConversation
            ?? dependencies.persistConversationCheckpoint
            ?? persistConversation;
        this.spawn = dependencies.spawn ?? crossSpawn;
        this.executableResolver = dependencies.executableResolver ?? new AgentExecutableResolver();
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        this.terminateProcessTree = dependencies.terminateProcessTree ?? terminateProcessTree;
        this.claudeUsagePoller = dependencies.claudeUsagePoller
            ?? new ClaudeUsagePoller({onRuntimeEvent: (event) => this.handleClaudeRuntimeEvent(event)});
        this.codexUsagePoller = dependencies.codexUsagePoller
            ?? new CodexUsagePoller({
                onRuntimeEvent: (event) => this.handleAccountCodexRuntimeEvent(event),
                terminateProcessTree: this.terminateProcessTree,
            });
        this.diagnoseCodexCacheError = dependencies.diagnoseCodexCacheError ?? diagnoseCodexCacheError;
        this.now = dependencies.now ?? Date.now;
        this.handleFinishTimeout = this.handleFinishTimeout.bind(this);
        this.handleAccountClaudeRuntimeEvent = this.handleAccountClaudeRuntimeEvent.bind(this);
        this.processes = new Map();
        this.runningConversationIds = new Set();
        this.usageRefreshStopped = false;
        this.usageRefreshGeneration = 0;
        this.claudeUsagePollContext = null;
        this.usagePollTimer = null;
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
        const conversationId = request.conversation?.id ?? request.conversationId ?? `agent-${crypto.randomUUID()}`;
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
        const [configuredExecutable, ...configuredArguments] = command;
        const environment = createAgentEnvironment(process.env, agent);
        const executable = await this.executableResolver.find(configuredExecutable, { cwd: rootPath, env: environment });
        if (!executable) throw new Error(`Executable not found for ${agent}: ${configuredExecutable}`);
        const argumentsList = streaming ? configuredArguments : [...configuredArguments, prompt];
        const initialConversation = snapshotConversation(conversation);
        await this.persistConversationCheckpoint({ conversation: initialConversation, request });
        this.requestUsagePoll({ agent, environment, executable, rootPath });
        const child = this.spawn(executable, argumentsList, {
            cwd: rootPath,
            detached: process.platform !== 'win32',
            env: environment,
            stdio: ['pipe', 'pipe', 'pipe'],
            // windowsHide: true,
        });
        logAgentEvent('[agent:start]', {
            arguments: configuredArguments,
            cwd: rootPath,
            actionRunId: request.actionRunId ?? null,
            executable,
            pid: child.pid,
            runId: id,
            startedAt,
        });
        const run = createRun({
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
            rootPath,
            startedAt,
            streaming,
        });
        attachRunProtocol(run, {
            onCodexRuntimeEvent: (event) => this.handleCodexRuntimeEvent(event),
            onMalformedOutput: (line) => this.handleMalformedOutput(id, line),
            onProviderEvent: (event) => this.handleProviderEvent(id, event),
            onStreamingEvent: (event) => this.handleStreamingEvent(id, event),
            onStreamingLine: (line) => this.handleStreamingLine(id, line),
            providerConversationId: request.providerConversationId,
            rootPath,
        });
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
            conversation: initialConversation,
            type: 'started',
        });

        return { conversation: initialConversation, reference, runId: id };
    }

    stop(runId) {
        const run = this.requireRun(runId);
        run.cancelled = true;
        transitionConversationStatus(run.conversation, 'cancelled', new Date().toISOString());
        this.clearFinishTimeout(run);

        return this.ensureTermination(run);
    }

    suspend(runId) {
        const run = this.requireRun(runId);
        run.suspended = true;
        this.clearFinishTimeout(run);

        return this.ensureTermination(run);
    }

    sendMessage(runId, content) {
        return agentInteractions.sendMessage(this, this.requireStreamingRun(runId), content);
    }

    sendStreamingMessage(run, content) {
        return agentInteractions.sendStreamingMessage(this, run, content);
    }

    answerQuestion(runId, requestId, answers) {
        return agentInteractions.answerQuestion(this, this.requireStreamingRun(runId), requestId, answers);
    }

    dismissQuestions(runId, requestId) {
        return agentInteractions.dismissQuestions(this, this.requireStreamingRun(runId), requestId);
    }

    answerApproval(runId, requestId, decision) {
        return agentInteractions.answerApproval(this, this.requireStreamingRun(runId), requestId, decision);
    }

    finish(runId) {
        const run = this.requireStreamingRun(runId);
        run.finishing = true;
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
        this.usageRefreshStopped = true;
        this.stopUsagePollTicks();
        this.claudeUsagePoller.stop();
        const completions = [this.codexUsagePoller.stop()];
        for (const run of this.processes.values()) {
            run.cancelled = true;
            transitionConversationStatus(run.conversation, 'cancelled', new Date().toISOString());
            this.clearFinishTimeout(run);
            completions.push(Promise.all([this.ensureTermination(run), run.closed]));
        }

        return Promise.all(completions);
    }

    /**
     * Starts one account-wide usage refresh for each configured built-in provider in the active
     * project's folder, and keeps the Claude one repeating from there.
     *
     * The folder matters: Claude asks whether the files in a folder are trusted the first time it
     * runs there, and that question blocks the poll. Polling the project folder means the answer
     * covers the folder agents are about to run in anyway.
     */
    requestProjectUsageRefresh(project, profiles) {
        if (!Array.isArray(profiles)) throw new Error('Project usage refresh requires agent profiles');
        const cwd = requireRootPath(project);
        if (this.usageRefreshStopped) return;
        // A refresh for the previous project stops driving the interval the moment a new one starts.
        this.stopUsagePollTicks();
        this.claudeUsagePollContext = null;
        this.usageRefreshGeneration += 1;
        const generation = this.usageRefreshGeneration;
        const observedAt = this.now();
        const refreshProfiles = ['claude', 'codex']
            .map((provider) => profiles.find(({ name }) => name === provider))
            .filter((profile) => profile !== undefined);
        // Usage polling runs a reporting command rather than a conversation, so it stays on the plain
        // inherited environment shared by every provider.
        const environment = createAgentEnvironment(process.env);
        for (const profile of refreshProfiles) {
            void this.startProviderUsageRefresh(profile, { cwd, environment, generation, observedAt });
        }
    }

    async startProviderUsageRefresh(profile, { cwd, environment, generation, observedAt }) {
        const [configuredExecutable, ...configuredArguments] = profile.command;
        executableFromCommand(profile.command);
        const executable = await this.executableResolver.find(configuredExecutable, { cwd, env: environment });
        // Resolution outlives a project switch, and its result belongs to the folder it started in.
        if (this.usageRefreshStopped || this.usageRefreshGeneration !== generation) return;
        if (!executable) {
            const unavailable = { kind: 'unavailable', observedAt };
            if (profile.name === 'claude') await this.handleAccountClaudeRuntimeEvent(unavailable);
            else await this.handleAccountCodexRuntimeEvent(unavailable);
            return;
        }
        if (profile.name === 'claude') {
            this.claudeUsagePollContext = { cwd, env: environment, executable };
            this.claudeUsagePoller.requestPoll({
                cwd,
                env: environment,
                executable,
                observedAt,
                onRuntimeEvent: this.handleAccountClaudeRuntimeEvent,
            });
            this.syncUsagePollTicks();
            return;
        }
        this.codexUsagePoller.requestPoll({
            argumentsList: configuredArguments,
            cwd,
            env: environment,
            executable,
            observedAt,
        });
    }

    async handleAccountCodexRuntimeEvent(event) {
        if (!this.codexRuntimeService || this.usageRefreshStopped) return;
        if (event.kind === 'unavailable') {
            this.codexRuntimeService.publishUnavailable(event.observedAt);
            return;
        }
        const accepted = this.codexRuntimeService.publishRateLimits(event.payload, event.observedAt, false);
        if (!accepted) this.codexRuntimeService.publishUnavailable(event.observedAt);
    }

    async handleAccountClaudeRuntimeEvent(event) {
        if (!this.claudeRuntimeService || this.usageRefreshStopped) return;
        if (event.kind === 'unavailable') {
            this.claudeRuntimeService.publishUnavailable(event.observedAt);
            return;
        }
        const accepted = this.claudeRuntimeService.publishRateLimits(event.payload, event.observedAt);
        if (!accepted) this.claudeRuntimeService.publishUnavailable(event.observedAt);
    }

    ensureTermination(run) {
        run.termination ??= this.terminateProcessTree(run.child);

        return run.termination;
    }

    async handleCodexRuntimeEvent(event) {
        if (!this.codexRuntimeService) return;
        if (event.kind === 'unavailable') {
            this.codexRuntimeService.publishUnavailable(event.observedAt);
            return;
        }
        const accepted = this.codexRuntimeService.publishRateLimits(event.payload, event.observedAt, event.kind === 'update');
        if (!accepted || !this.usageMetricsService) return;
        await this.usageMetricsService.recordAccountUsage('codex', this.codexRuntimeService.getSnapshot());
    }

    async handleClaudeRuntimeEvent(event) {
        if (!this.claudeRuntimeService) return;
        if (event.kind === 'unavailable') {
            this.claudeRuntimeService.publishUnavailable(event.observedAt);
            return;
        }
        const accepted = this.claudeRuntimeService.publishRateLimits(event.payload, event.observedAt);
        if (!accepted || !this.usageMetricsService) return;
        const snapshot = this.claudeRuntimeService.getSnapshot();
        await this.usageMetricsService.recordAccountUsage('claude', snapshot);
    }

    /** Refreshes account usage for agents that report it out of band; Codex reports it inside its own protocol. */
    requestUsagePoll(run) {
        if (run.agent !== 'claude') return;
        this.claudeUsagePoller.requestPoll({ cwd: run.rootPath, env: run.environment, executable: run.executable });
    }

    /**
     * Keeps the account usage poll repeating for the active project, whatever the previous one
     * returned. Success, failure and an inconclusive result all schedule the next poll the same
     * way: a single failed poll used to leave the display empty until the user started a run.
     *
     * The poller's own cooldown stays the floor between poll starts, so an interval poll and a
     * run-triggered poll can never put two Claude processes side by side.
     */
    syncUsagePollTicks() {
        if (this.usageRefreshStopped || !this.claudeUsagePollContext || this.usagePollTimer) return;
        this.usagePollTimer = this.setTimeout(() => {
            this.usagePollTimer = null;
            const context = this.claudeUsagePollContext;
            if (this.usageRefreshStopped || !context) return;
            this.claudeUsagePoller.requestPoll({ ...context });
            this.syncUsagePollTicks();
        }, AGENT_USAGE_POLL_TICK_MS);
    }

    stopUsagePollTicks() {
        if (!this.usagePollTimer) return;
        this.clearTimeout(this.usagePollTimer);
        this.usagePollTimer = null;
    }

    recordTokenUsage(run, usage, recordedAt) {
        if (!this.usageMetricsService) return false;

        return this.usageMetricsService.recordTokenUsage(
            run.agent,
            usage,
            Date.parse(recordedAt),
        );
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
            const line = stripAnsi(parts[index]);
            const delimiter = parts[index + 1] ?? '';
            if (line.length === 0 && delimiter.length === 0) continue;
            if (run.agent !== 'codex' || !isCodexCacheError(line)) {
                this.recordOutput(run.id, 'stderr', `${line}${delimiter}`);
                continue;
            }
            if (run.codexCacheErrorReported) continue;
            run.codexCacheErrorReported = true;
            const diagnostic = run.stderrHandling.then(async () => {
                const result = await this.diagnoseCodexCacheError(line, run.executable, run.environment);
                this.recordOutput(run.id, 'stderr', `${result.message}\n`);
                if (result.updateRequired) {
                    this.codexRuntimeService?.publishUpdateRequired(result.runningVersion, result.cacheVersion);
                }
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
        if (run.streaming) {
            emitRunEvent(run, { content: safeContent, type: 'error' });
            return;
        }
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
        if (providerEvent.conversationId) run.providerConversationId = providerEvent.conversationId;
        if (providerEvent.usage) run.turnUsage = providerEvent.usage;
        for (const event of providerEvent.providerEvents) recordProviderEvent(run, event, timestamp);
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

        const handler = STREAMING_EVENT_HANDLERS[event.type];
        if (!handler) return;

        await handler(this, run, event, new Date().toISOString());
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
        transitionConversationStatus(run.conversation, 'failed', timestamp);
        run.waitingForQuestion = false;
        run.pendingQuestionRequestId = null;
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
                if (!run.streaming && run.turnUsage) await this.recordTokenUsage(run, run.turnUsage, completedAt);
            }
            const preserveWaitingState = run.suspended && run.conversation.status === 'waitingForInput';
            run.conversation.completedAt = preserveWaitingState ? null : completedAt;
            const status = preserveWaitingState
                ? 'waitingForInput'
                : run.cancelled ? 'cancelled' : succeeded ? 'completed' : 'failed';
            transitionConversationStatus(run.conversation, status, completedAt);
            const continuedTurnFailedBeforeStart = !!run.request.conversation
                && !run.turnStarted
                && !succeeded
                && !run.cancelled
                && !run.suspended;
            logAgentEvent('[agent:complete]', {
                completedAt,
                durationMs: Date.parse(completedAt) - Date.parse(run.startedAt),
                actionRunId: run.request.actionRunId ?? null,
                exitCode,
                pid: run.child.pid,
                runId,
            });
            await run.persistence;
            let persistenceError = null;
            if (!continuedTurnFailedBeforeStart) {
                try {
                    await this.persistConversation(run);
                } catch (error) {
                    persistenceError = error;
                }
            }
            this.processes.delete(runId);
            this.runningConversationIds.delete(run.conversation.id);
            emitRunEvent(run, { conversation: run.conversation, type: 'closed' });
            this.requestUsagePoll(run);
            if (persistenceError) {
                if (run.onCompletionError) run.onCompletionError(persistenceError);
                return;
            }
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
        const snapshot = { ...run, conversation: snapshotConversation(run.conversation) };
        const write = run.persistence.then(() => this.persistConversationCheckpoint(snapshot));
        run.persistence = write.catch(() => undefined);

        return write;
    }

    persistSuccessfulTurn(run) {
        const snapshot = { ...run, conversation: snapshotConversation(run.conversation) };
        const write = run.persistence.then(() => this.persistSuccessfulConversationTurn(snapshot));
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
