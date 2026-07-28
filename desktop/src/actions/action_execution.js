const { ActionCancellationError } = require('./action_cancellation_error');
const { executeCommandAction } = require('./action_command_executor');
const { ActionPhaseError } = require('./action_phase_error');
const { runWithGitOperationContext } = require('../git/git_operation_context');
const {
    captureCommitReferences,
    combineOutput,
    createAgentHistoryEntry,
    createCommandHistoryEntry,
} = require('./action_run_history');

function errorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}

class ActionExecution {
    constructor(snapshot, dependencies) {
        this.actionsFolder = snapshot.actionsFolder;
        this.activityOrigin = snapshot.activityOrigin;
        this.context = snapshot.context;
        this.executionId = snapshot.executionId;
        this.project = snapshot.project;
        this.projectFolder = snapshot.projectFolder;
        this.rootAction = snapshot.rootAction;
        this.runInput = snapshot.runInput;
        this.startedAt = snapshot.startedAt;
        this.actionWorktreeExecutionService = dependencies.actionWorktreeExecutionService;
        this.agentExecutor = dependencies.agentExecutor;
        this.agentRunnerService = dependencies.agentRunnerService;
        this.commandRunner = dependencies.commandRunner;
        this.localGitService = dependencies.localGitService;
        this.publisher = dependencies.publisher;
        this.activeAction = null;
        this.activeAgentRunId = null;
        this.activeAgentQuestion = false;
        this.autoFinishPending = false;
        this.commitReferenceKeys = new Set();
        this.commitReferences = [];
        this.conversationIds = [];
        this.completion = null;
        this.controller = new AbortController();
        this.rootHistoryEntry = null;
        this.nextEventSequence = 1;
    }

    start(finalize) {
        const runCompletion = this.run();
        this.completion = finalize(runCompletion);
    }

    cancel() {
        this.controller.abort();
        if (this.activeAgentRunId) this.agentRunnerService.stop(this.activeAgentRunId);
    }

    sendAgentMessage(content) {
        if (!this.activeAgentRunId) throw new Error(`Action execution has no active streaming agent: ${this.executionId}`);
        if (this.activeAgentQuestion) throw new Error('Answer pending structured question before sending queued prompt');
        return this.agentRunnerService.sendMessage(this.activeAgentRunId, content);
    }

    setAgentQueuedMessage(content, revision) {
        if (!this.activeAgentRunId) throw new Error(`Action execution has no active agent: ${this.executionId}`);
        this.agentRunnerService.setQueuedMessage(this.activeAgentRunId, content, revision);
    }

    sendQueuedAgentMessage(revision) {
        if (!this.activeAgentRunId) throw new Error(`Action execution has no active agent: ${this.executionId}`);
        if (this.activeAgentQuestion) throw new Error('Answer pending structured question before sending queued prompt');
        return this.agentRunnerService.sendQueuedMessage(this.activeAgentRunId, revision);
    }

    async answerAgentQuestion(requestId, answers) {
        if (!this.activeAgentRunId) throw new Error(`Action execution has no active streaming agent: ${this.executionId}`);
        await this.agentRunnerService.answerQuestion(this.activeAgentRunId, requestId, answers);
        this.activeAgentQuestion = false;
    }

    finishAgent() {
        if (!this.activeAgentRunId) throw new Error(`Action execution has no active streaming agent: ${this.executionId}`);
        this.agentRunnerService.finish(this.activeAgentRunId);
    }

    handleCardStateChange(cardInternalId, state) {
        if (this.context.cardInternalId !== cardInternalId) return;
        if (
            this.activeAction?.type !== 'agent'
            || !this.activeAction.streaming
            || this.activeAction.autoFinish?.state !== state
        ) return;
        if (this.activeAgentRunId) {
            this.agentRunnerService.finish(this.activeAgentRunId);
            return;
        }

        this.autoFinishPending = true;
    }

    async run() {
        return runWithGitOperationContext({ executionId: this.executionId }, () => this.runWithContext());
    }

    async runWithContext() {
        this.publish(this.rootAction, 'main', 'running', { type: 'execution' });
        let status = 'completed';
        let failure = null;
        try {
            const onQueued = () => this.publish(this.rootAction, 'main', 'queued', { type: 'action' });
            const lockOptions = { onQueued, signal: this.controller.signal };
            await this.actionWorktreeExecutionService.runWithCardLock(
                this.project,
                this.context,
                () => this.runAction(this.rootAction, 'main', true),
                lockOptions,
            );
        } catch (error) {
            failure = error;
            if (error instanceof ActionCancellationError || this.controller.signal.aborted) status = 'cancelled';
            else status = error instanceof ActionPhaseError && error.rootPhase === 'after' ? 'okButNotAfter' : 'failed';
        }

        try {
            await this.persistRootActivity(status, failure);
        } catch (error) {
            failure = error;
            status = 'failed';
            const message = errorMessage(error, `${this.rootAction.label} history recording failed`);
            this.publish(this.rootAction, 'main', 'failed', { message, type: 'action' });
        }

        const result = {
            executionId: this.executionId,
            failure: failure ? errorMessage(failure, 'Action failed') : null,
            status,
        };
        this.publish(this.rootAction, 'main', status, { message: result.failure, type: 'execution' });

        return result;
    }

    async runAction(action, phase, isRoot = false, rootPhase = phase) {
        this.throwIfCancelled();
        for (const beforeAction of action.onBefore) {
            await this.runAction(beforeAction, 'before', false, isRoot ? 'before' : rootPhase);
        }

        const output = await this.runMain(action, phase, isRoot, rootPhase);
        const matches = action.on.filter((rule) => new RegExp(rule.condition, 'u').test(output));
        for (const rule of matches) await this.runAction(rule.action, 'on', false, isRoot ? 'on' : rootPhase);

        for (const afterAction of action.onAfter) {
            await this.runAction(afterAction, 'after', false, isRoot ? 'after' : rootPhase);
        }

        return output;
    }

    async runMain(action, phase, isRoot, rootPhase) {
        this.throwIfCancelled();
        this.activeAction = action;
        this.autoFinishPending = false;

        try {
            const result = await this.executeAction(action, phase, isRoot);
            if (this.controller.signal.aborted) {
                this.publish(action, phase, 'cancelled', {
                    command: Array.isArray(result.command) ? result.command.join(' ') : result.command,
                    executionWorktree: result.executionWorktree,
                    message: 'Action cancelled',
                    reference: result.reference,
                    runId: result.conversationId,
                    thinkingLevel: result.thinkingLevel,
                    type: 'action',
                });
                const cancellationError = new ActionCancellationError('Action cancelled');
                cancellationError.terminalEventEmitted = true;
                throw cancellationError;
            }

            const status = result.exitCode === 0 ? 'completed' : 'failed';
            const output = combineOutput(result);
            this.publish(action, phase, status, {
                command: Array.isArray(result.command) ? result.command.join(' ') : result.command,
                executionWorktree: result.executionWorktree,
                message: status === 'completed' ? `${action.label} completed` : `${action.label} failed with exit code ${result.exitCode}`,
                reference: result.reference,
                runId: result.conversationId,
                thinkingLevel: result.thinkingLevel,
                type: 'action',
            });
            this.clearActiveAction(action);
            if (result.exitCode !== 0) throw new ActionPhaseError(`${action.label} failed with exit code ${result.exitCode}`, phase, rootPhase);

            return output;
        } catch (error) {
            this.clearActiveAction(action);
            if (error instanceof ActionCancellationError || this.controller.signal.aborted) {
                if (!error?.terminalEventEmitted) this.publish(action, phase, 'cancelled', { message: 'Action cancelled', type: 'action' });
                throw new ActionCancellationError('Action cancelled');
            }
            if (error instanceof ActionPhaseError) throw error;

            const message = errorMessage(error, `${action.label} failed`);
            this.publish(action, phase, 'failed', { message, type: 'action' });
            throw new ActionPhaseError(message, phase, rootPhase, error);
        }
    }

    clearActiveAction(action) {
        if (this.activeAction !== action) return;
        this.activeAction = null;
        this.autoFinishPending = false;
    }

    async executeAction(action, phase, isRoot) {
        if (action.type === 'command' && isRoot && this.runInput.continueFrom) {
            throw new Error('Conversation continuation requires an agent action');
        }
        if (action.autoFinish && (
            this.context.kind !== 'card'
            || typeof this.context.cardInternalId !== 'string'
            || this.context.cardInternalId.length === 0
        )) {
            throw new Error(`Action "${action.label}" requires card context for autoFinish`);
        }

        return this.actionWorktreeExecutionService.execute(this.project, action, this.context, async (project) => {
            this.publish(action, phase, 'running', { type: 'action' });
            const result = action.type === 'agent'
                ? await this.executeAgentAction(action, phase, isRoot, project)
                : await this.executeCommandAction(action, phase, isRoot, project);
            const committedResult = await this.commitTrackedAgentChanges(project, action, result);
            const executionProject = {
                ...project,
                branch: committedResult.branch ?? project.branch,
                rootPath: committedResult.repositoryRoot ?? project.rootPath,
            };
            const historyInput = {
                action,
                context: this.context,
                project: executionProject,
                projectFolder: this.projectFolder,
                result: committedResult,
            };
            const entry = action.type === 'agent'
                ? createAgentHistoryEntry(historyInput)
                : createCommandHistoryEntry(historyInput);
            const commitReferences = await captureCommitReferences(this.localGitService, historyInput);
            this.collectCommitReferences(commitReferences);
            if (isRoot) this.rootHistoryEntry = entry;
            if (action.type === 'agent' && typeof committedResult.conversationId === 'string') {
                this.conversationIds.push(committedResult.conversationId);
            }

            return committedResult;
        });
    }

    collectCommitReferences(references) {
        for (const reference of references) {
            const key = `${reference.repositoryRoot}\0${reference.commit}`;
            if (this.commitReferenceKeys.has(key)) continue;
            this.commitReferenceKeys.add(key);
            this.commitReferences.push(reference);
        }
    }

    async persistRootActivity(status, failure) {
        const completedAt = new Date().toISOString();
        const commits = this.commitReferences.map((reference) => {
            const persisted = Object.fromEntries(Object.entries(reference).filter(([fieldName]) => fieldName !== 'repositoryRoot'));
            if (reference.actionId === this.rootAction.id) {
                delete persisted.actionId;
                delete persisted.actionName;
            }

            return persisted;
        });
        const history = this.rootHistoryEntry
            ?? { completedAt, output: failure ? errorMessage(failure, 'Action failed') : '', prompt: '', status: 'failed' };
        const record = {
            commits,
            completedAt,
            conversationIds: [...new Set(this.conversationIds)],
            executionId: this.executionId,
            history,
            origin: this.activityOrigin,
            rootActionId: this.rootAction.id,
            rootActionLabel: this.rootAction.label,
            startedAt: this.startedAt,
            status,
        };
        await this.localGitService.appendAndCommitActionActivity(
            this.project,
            this.projectFolder,
            this.activityOrigin,
            record,
            `Record ${this.rootAction.label} activity`,
        );
    }

    async commitTrackedAgentChanges(project, action, result) {
        if (action.type !== 'agent' || !action.trackFileChanges) return result;
        if (result.exitCode !== 0 || this.controller.signal.aborted) return result;
        const changedPaths = result.changedPaths ?? [];
        if (changedPaths.length === 0) return result;
        const trackedCommit = await this.localGitService.commitTrackedPaths(
            project.rootPath,
            changedPaths,
            action.label,
            this.controller.signal,
        );

        return { ...result, trackedCommit };
    }

    executeCommandAction(action, phase, isRoot, project) {
        const onOutput = ({ command, stderr, stdout }) => {
            if (stdout.length > 0) this.publish(action, phase, 'running', { type: 'update', update: { command, content: stdout, kind: 'output' } });
            if (stderr.length > 0) this.publish(action, phase, 'running', { type: 'update', update: { command, content: stderr, kind: 'error' } });
        };

        return executeCommandAction({
            action,
            commandRunner: this.commandRunner,
            context: this.context,
            extraPrompt: isRoot ? this.runInput.extraPrompt : '',
            onOutput,
            project,
            signal: this.controller.signal,
        });
    }

    async executeAgentAction(action, phase, isRoot, project) {
        const onActiveRunChange = (runId) => {
            this.activeAgentRunId = runId;
            if (runId) {
                this.publish(action, phase, 'running', { interactionReady: true, type: 'agentState' });
                if (this.autoFinishPending) {
                    this.autoFinishPending = false;
                    this.agentRunnerService.finish(runId);
                }
            }
            else {
                this.activeAgentQuestion = false;
                this.publish(action, phase, 'running', { interactionReady: false, type: 'agentState' });
            }
        };
        const onEvent = (agentEvent) => {
            if (agentEvent.type === 'started') {
                const { continued, conversationId, reference, startedAt, title, userMessage } = agentEvent;
                const update = { continued, conversationId, kind: 'agentStarted', reference, startedAt, title, userMessage };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'closed') return;
            if (agentEvent.type === 'state') {
                this.publish(action, phase, agentEvent.state, { interactionReady: true, type: 'agentState' });
                return;
            }
            if (agentEvent.type === 'question') {
                this.activeAgentQuestion = true;
                const update = {
                    kind: 'agentQuestion',
                    questions: agentEvent.questions,
                    requestId: agentEvent.requestId,
                };
                this.publish(action, phase, 'waitingForInput', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'userMessage') {
                this.activeAgentQuestion = false;
                const update = { kind: 'agentUserMessage', userMessage: agentEvent.userMessage };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'questionAnswered') {
                this.activeAgentQuestion = false;
                const update = { kind: 'agentQuestionAnswer', userMessage: agentEvent.userMessage };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'agentActivity') {
                const update = { activity: agentEvent.activity, kind: 'agentActivity' };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }

            const update = { content: agentEvent.content, kind: agentEvent.type };
            this.publish(action, phase, 'running', { type: 'update', update });
        };
        const runInput = isRoot ? this.runInput : { extraPrompt: '' };

        const input = {
            action,
            activityOrigin: this.activityOrigin,
            context: this.context,
            executionId: this.executionId,
            onActiveRunChange,
            onEvent,
            project,
            projectFolder: this.projectFolder,
            primaryProject: this.project,
            runInput,
            signal: this.controller.signal,
        };
        let result = await this.agentExecutor.execute(input);
        const changedPaths = new Set(result.changedPaths ?? []);
        let stderr = result.stderr ?? '';
        let stdout = result.stdout ?? '';
        while (result.exitCode === 0 && result.queuedMessage) {
            const queuedMessage = result.queuedMessage;
            result = await this.agentExecutor.execute({
                ...input,
                runInput: {
                    ...runInput,
                    continueFrom: result.reference,
                    prompt: queuedMessage,
                },
            });
            for (const changedPath of result.changedPaths ?? []) changedPaths.add(changedPath);
            stderr += result.stderr ?? '';
            stdout += result.stdout ?? '';
        }

        return { ...result, changedPaths: [...changedPaths], stderr, stdout };
    }

    publish(action, phase, status, details) {
        const event = {
            actionId: action.id,
            actionType: action.type,
            autoFinish: action.autoFinish ?? null,
            context: this.context,
            executionId: this.executionId,
            interactionReady: details.interactionReady ?? false,
            phase,
            rootActionId: this.rootAction.id,
            status,
            streaming: action.type === 'agent' && action.streaming,
            ...details,
            sequence: this.nextEventSequence,
        };
        this.nextEventSequence += 1;
        this.publisher(event);
    }

    throwIfCancelled() {
        if (this.controller.signal.aborted) throw new ActionCancellationError('Action cancelled');
    }
}

module.exports = { ActionExecution };
