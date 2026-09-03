const crypto = require('node:crypto');
const { ActionCancellationError } = require('./action_cancellation_error');
const { executeCommandAction } = require('./action_command_executor');
const { ActionPhaseError } = require('./action_phase_error');
const { runWithGitOperationContext } = require('../../git/git_operation_context');
const { resolveDiagramFile } = require('./action_diagram_output');
const { ActionDiagramOutputWatcher } = require('./action_diagram_output_watcher');
const { resolvePopupPrompt } = require('./action_text');
const {
    captureCommitReferences,
    combineOutput,
    createAgentDetails,
    createCommandDetails,
} = require('./action_run_history');

function errorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}

class ActionRun {
    constructor(snapshot, dependencies) {
        this.actionsFolder = snapshot.actionsFolder;
        this.activeCardsFolder = snapshot.activeCardsFolder;
        this.activityOrigin = snapshot.activityOrigin;
        this.context = snapshot.context;
        this.conversationReservation = snapshot.conversationReservation;
        this.diagramFooter = snapshot.diagramFooter;
        this.diagramsFolder = snapshot.diagramsFolder;
        this.diagramPath = snapshot.diagramPath;
        this.runId = snapshot.runId;
        this.project = snapshot.project;
        this.projectFolder = snapshot.projectFolder;
        this.releasesFolder = snapshot.releasesFolder;
        this.rootAction = snapshot.rootAction;
        this.runInput = snapshot.runInput;
        this.startedAt = snapshot.startedAt;
        this.actionWorktreeRunService = dependencies.actionWorktreeRunService;
        this.agentExecutor = dependencies.agentExecutor;
        this.agentRunnerService = dependencies.agentRunnerService;
        this.commandRunner = dependencies.commandRunner;
        this.commandWindowRunner = dependencies.commandWindowRunner ?? dependencies.commandRunner;
        this.diagramOutputWatcherFactory = dependencies.diagramOutputWatcherFactory
            ?? ((input) => new ActionDiagramOutputWatcher(input));
        this.localGitService = dependencies.localGitService;
        this.publisher = dependencies.publisher;
        this.activeAction = null;
        this.activeActionPhase = null;
        this.activeAgentProject = null;
        this.activeAgentRunId = null;
        this.activeAgentQuestion = false;
        this.activeAgentQuestionRequestId = null;
        this.activeAgentApprovals = new Map();
        this.autoFinishPending = false;
        this.diagramWatcherFailure = null;
        this.commitReferenceKeys = new Set();
        this.commitReferences = [];
        this.changedPaths = new Set();
        this.conversationIds = [];
        this.completion = null;
        this.controller = new AbortController();
        this.rootDetails = null;
        this.rootConversationId = null;
        this.nextEventSequence = 1;
        this.promptQueue = [];
        this.promptQueueClosed = false;
        this.promptQueueOperations = Promise.resolve();
    }

    start(finalize) {
        const runCompletion = this.run();
        this.completion = finalize(runCompletion);
    }

    cancel() {
        this.discardQueuedPrompts();
        this.controller.abort();
        if (this.activeAgentRunId) this.agentRunnerService.stop(this.activeAgentRunId);
    }

    suspend() {
        this.discardQueuedPrompts();
        this.controller.abort();
        if (this.activeAgentRunId) this.agentRunnerService.suspend(this.activeAgentRunId);
    }

    sendAgentMessage(content) {
        if (!this.activeAgentRunId) throw new Error(`Action run has no active streaming agent: ${this.runId}`);
        if (this.activeAgentQuestion) throw new Error('Answer pending structured question before sending queued prompt');
        if (this.activeAgentApprovals.size > 0) throw new Error('Answer pending approval before sending queued prompt');
        const prompt = this.resolveActiveAgentPrompt(content);

        return this.agentRunnerService.sendMessage(this.activeAgentRunId, prompt);
    }

    enqueueAgentPrompt(content) {
        if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Queued agent prompt is empty');

        const operation = this.queuePromptOperation(() => {
            this.requirePromptQueueOpen();
            this.resolveActiveAgentPrompt(content);
            const entry = {
                content,
                dispatchState: 'queued',
                id: `prompt-${crypto.randomUUID()}`,
                revision: 0,
            };
            this.promptQueue.push(entry);
            this.publishPromptQueueUpdate('agentPromptQueued', { entry: { ...entry } });

            return { ...entry };
        });
        void operation.then(() => this.dispatchStreamingPrompt()).catch(() => undefined);

        return operation;
    }

    editQueuedAgentPrompt(id, revision, content) {
        if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Queued agent prompt cannot be empty');

        return this.queuePromptOperation(() => {
            this.requirePromptQueueOpen();
            const entry = this.requireQueuedPrompt(id, revision);
            this.resolveActiveAgentPrompt(content);
            entry.content = content;
            entry.revision += 1;
            this.publishPromptQueueUpdate('agentPromptEdited', { entry: { ...entry } });

            return { ...entry };
        });
    }

    deleteQueuedAgentPrompt(id, revision) {
        return this.queuePromptOperation(() => {
            this.requirePromptQueueOpen();
            const entry = this.requireQueuedPrompt(id, revision);
            this.promptQueue = this.promptQueue.filter(({ id: entryId }) => entryId !== id);
            this.publishPromptQueueUpdate('agentPromptRemoved', { promptId: entry.id, revision: entry.revision });

            return { deleted: true };
        });
    }

    async answerAgentQuestion(requestId, answers) {
        if (!this.activeAgentRunId) throw new Error(`Action run has no active streaming agent: ${this.runId}`);
        await this.agentRunnerService.answerQuestion(this.activeAgentRunId, requestId, answers);
        if (this.activeAgentQuestionRequestId === requestId) {
            this.activeAgentQuestion = false;
            this.activeAgentQuestionRequestId = null;
        }
    }

    async dismissAgentQuestions(requestId) {
        if (!this.activeAgentRunId) throw new Error(`Action run has no active streaming agent: ${this.runId}`);
        await this.agentRunnerService.dismissQuestions(this.activeAgentRunId, requestId);
        if (this.activeAgentQuestionRequestId === requestId) {
            this.activeAgentQuestion = false;
            this.activeAgentQuestionRequestId = null;
        }
    }

    answerAgentApproval(requestId, decision) {
        if (!this.activeAgentRunId) throw new Error(`Action run has no active streaming agent: ${this.runId}`);
        if (!this.activeAgentApprovals.has(requestId)) throw new Error(`Unknown or stale action approval request id: ${requestId}`);

        return this.agentRunnerService.answerApproval(this.activeAgentRunId, requestId, decision);
    }

    finishAgent() {
        if (!this.activeAgentRunId) throw new Error(`Action run has no active streaming agent: ${this.runId}`);
        this.discardQueuedPrompts();
        this.agentRunnerService.finish(this.activeAgentRunId);
    }

    queuePromptOperation(operation) {
        const queuedOperation = this.promptQueueOperations.then(operation);
        this.promptQueueOperations = queuedOperation.catch(() => undefined);

        return queuedOperation;
    }

    requirePromptQueueOpen() {
        if (this.promptQueueClosed || this.controller.signal.aborted) {
            throw new Error(`Action run no longer accepts queued prompts: ${this.runId}`);
        }
        if (this.activeAction?.type !== 'agent') throw new Error(`Action run has no active agent: ${this.runId}`);
    }

    requireQueuedPrompt(id, revision) {
        if (typeof id !== 'string' || id.length === 0) throw new Error('Missing queued agent prompt id');
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid queued agent prompt revision');
        const entry = this.promptQueue.find(({ id: entryId }) => entryId === id);
        if (!entry || entry.dispatchState !== 'queued') throw new Error(`Queued agent prompt was already sent or removed: ${id}`);
        if (entry.revision !== revision) throw new Error(`Queued agent prompt changed before operation: ${id}`);

        return entry;
    }

    publishPromptQueueUpdate(kind, details) {
        if (!this.activeAction || !this.activeActionPhase) return;
        this.publish(this.activeAction, this.activeActionPhase, 'running', {
            type: 'update',
            update: { kind, ...details },
        });
    }

    discardQueuedPrompts() {
        this.promptQueueClosed = true;
        const entries = this.promptQueue.filter(({ dispatchState }) => dispatchState === 'queued');
        this.promptQueue = [];
        for (const entry of entries) {
            this.publishPromptQueueUpdate('agentPromptRemoved', { promptId: entry.id, revision: entry.revision });
        }
    }

    dispatchStreamingPrompt() {
        const operation = this.queuePromptOperation(async () => {
            if (
                !this.activeAgentRunId
                || !this.activeAction?.streaming
                || this.activeAgentQuestion
                || this.activeAgentApprovals.size > 0
            ) return false;
            const entry = this.promptQueue.find(({ dispatchState }) => dispatchState === 'queued');
            if (!entry) return false;

            entry.dispatchState = 'dispatching';
            this.promptQueue = this.promptQueue.filter(({ id }) => id !== entry.id);
            this.publishPromptQueueUpdate('agentPromptRemoved', { promptId: entry.id, revision: entry.revision });
            const prompt = this.resolveActiveAgentPrompt(entry.content);
            await this.agentRunnerService.sendMessage(this.activeAgentRunId, prompt);

            return !!this.activeAgentRunId
                && !!this.activeAction?.streaming
                && !this.activeAgentQuestion
                && this.activeAgentApprovals.size === 0
                && this.promptQueue.some(({ dispatchState }) => dispatchState === 'queued');
        });
        void operation.then((dispatchNext) => {
            if (dispatchNext) void this.dispatchStreamingPrompt().catch(() => undefined);
        }).catch(() => undefined);

        return operation;
    }

    claimNextQueuedPromptOrCloseQueue() {
        return this.queuePromptOperation(() => {
            const entry = this.promptQueue.find(({ dispatchState }) => dispatchState === 'queued');
            if (!entry) {
                this.promptQueueClosed = true;

                return null;
            }

            entry.dispatchState = 'dispatching';
            this.promptQueue = this.promptQueue.filter(({ id }) => id !== entry.id);
            this.publishPromptQueueUpdate('agentPromptRemoved', { promptId: entry.id, revision: entry.revision });

            return entry.content;
        });
    }

    handleCardStateChange(cardInternalId, state) {
        if (this.context.cardInternalId !== cardInternalId) return;
        if (
            this.activeAction?.type !== 'agent'
            || !this.activeAction.streaming
            || this.activeAction.autoFinish?.when !== 'card-state'
            || this.activeAction.autoFinish?.state !== state
        ) return;
        this.requestAutoFinish();
    }

    requestAutoFinish() {
        if (!this.activeAgentRunId) {
            this.autoFinishPending = true;
            return;
        }
        this.discardQueuedPrompts();
        this.agentRunnerService.finish(this.activeAgentRunId);
    }

    async run() {
        return runWithGitOperationContext({ runId: this.runId }, () => this.runWithContext());
    }

    async runWithContext() {
        this.publish(this.rootAction, 'main', 'running', { type: 'run' });
        let status = 'completed';
        let failure = null;
        try {
            const onQueued = () => this.publish(this.rootAction, 'main', 'queued', { type: 'action' });
            const lockOptions = { onQueued, signal: this.controller.signal };
            await this.actionWorktreeRunService.runWithCardLock(
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

        this.discardQueuedPrompts();

        let changedPaths = [];
        try {
            const activityPersisted = await this.persistRootActivity(status, failure);
            if (activityPersisted) changedPaths = [...this.changedPaths];
        } catch (error) {
            failure = error;
            status = 'failed';
            const message = errorMessage(error, `${this.rootAction.label} history recording failed`);
            this.publish(this.rootAction, 'main', 'failed', { message, type: 'action' });
        }

        const result = {
            changedPaths,
            ...(this.rootAction.output?.kind === 'diagram' && this.diagramPath ? { diagramPath: this.diagramPath } : {}),
            runId: this.runId,
            failure: failure ? errorMessage(failure, 'Action failed') : null,
            status,
        };
        this.publish(this.rootAction, 'main', status, {
            changedPaths: result.changedPaths,
            ...(this.rootAction.output?.kind === 'diagram' && this.diagramPath ? { diagramPath: this.diagramPath } : {}),
            message: result.failure,
            type: 'run',
        });

        return result;
    }

    async runAction(action, phase, isRoot = false, rootPhase = phase) {
        this.throwIfCancelled();
        const command = action.type === 'command' && isRoot ? this.runInput.command ?? action.command : action.command;
        if (action.type === 'command' && command.trim().length === 0) {
            throw new Error(`Command text is required for action "${action.label}"`);
        }
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
        this.activeActionPhase = phase;
        this.autoFinishPending = false;
        this.diagramWatcherFailure = null;

        try {
            const result = await this.executeAction(action, phase, isRoot);
            if (this.controller.signal.aborted) {
                this.publish(action, phase, 'cancelled', {
                    command: Array.isArray(result.command) ? result.command.join(' ') : result.command,
                    runWorktree: result.runWorktree,
                    message: 'Action cancelled',
                    permissionMode: result.permissionMode,
                    reference: result.reference,
                    conversationId: result.conversationId,
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
                runWorktree: result.runWorktree,
                message: status === 'completed' ? `${action.label} completed` : `${action.label} failed with exit code ${result.exitCode}`,
                permissionMode: result.permissionMode,
                reference: result.reference,
                conversationId: result.conversationId,
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
        if (action.type === 'agent') this.discardQueuedPrompts();
        this.activeAction = null;
        this.activeActionPhase = null;
        this.activeAgentProject = null;
        this.autoFinishPending = false;
    }

    async executeAction(action, phase, isRoot) {
        if (action.type === 'command' && isRoot && this.runInput.continueFrom) {
            throw new Error('Conversation continuation requires an agent action');
        }
        if (action.autoFinish?.when === 'card-state' && (
            this.context.kind !== 'card'
            || typeof this.context.cardInternalId !== 'string'
            || this.context.cardInternalId.length === 0
        )) {
            throw new Error(`Action "${action.label}" requires card context for autoFinish`);
        }

        return this.actionWorktreeRunService.execute(this.project, action, this.context, async (project) => {
            this.publish(action, phase, 'running', { type: 'action' });
            const result = action.type === 'agent'
                ? await this.executeAgentAction(action, phase, isRoot, project)
                : await this.executeCommandAction(action, phase, isRoot, project);
            if (action.type === 'agent') {
                for (const changedPath of result.changedPaths ?? []) this.changedPaths.add(changedPath);
            }
            const committedResult = await this.commitTrackedAgentChanges(project, action, result);
            const runProject = {
                ...project,
                branch: committedResult.branch ?? project.branch,
                rootPath: committedResult.repositoryRoot ?? project.rootPath,
            };
            const historyInput = {
                action,
                context: this.context,
                project: runProject,
                projectFolder: this.projectFolder,
                result: committedResult,
            };
            const details = action.type === 'agent'
                ? createAgentDetails(historyInput)
                : createCommandDetails(historyInput);
            const commitReferences = await captureCommitReferences(this.localGitService, historyInput);
            this.collectCommitReferences(commitReferences);
            if (isRoot) {
                this.rootDetails = details;
                if (action.type === 'agent') this.rootConversationId = committedResult.conversationId;
            }
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
        if (this.rootAction.type === 'agent' && typeof this.rootConversationId !== 'string') {
            return false;
        }
        const details = this.rootDetails ?? {
            command: this.rootAction.command,
            output: failure ? errorMessage(failure, 'Action failed') : '',
            type: 'command',
        };
        const record = {
            commits,
            completedAt,
            conversationIds: [...new Set(this.conversationIds)],
            details,
            runId: this.runId,
            origin: this.activityOrigin,
            rootActionId: this.rootAction.id,
            rootActionLabel: this.rootAction.label,
            ...(this.rootConversationId ? { rootConversationId: this.rootConversationId } : {}),
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

        return true;
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
            activeCardsFolder: this.activeCardsFolder,
            command: isRoot ? this.runInput.command ?? action.command : action.command,
            commandRunner: this.commandRunner,
            commandWindowRunner: this.commandWindowRunner,
            context: this.context,
            diagramFile: action.output?.kind === 'diagram' && this.diagramPath
                ? resolveDiagramFile(project, this.diagramsFolder, this.diagramPath)
                : null,
            onOutput,
            primaryProject: this.project,
            project,
            projectFolder: this.projectFolder,
            releasesFolder: this.releasesFolder,
            signal: this.controller.signal,
        });
    }

    async executeAgentAction(action, phase, isRoot, project) {
        this.activeAgentProject = project;
        this.promptQueueClosed = false;
        const onActiveRunChange = (runId) => {
            this.activeAgentRunId = runId;
            if (runId) {
                this.publish(action, phase, 'running', { interactionReady: true, type: 'agentState' });
                void this.dispatchStreamingPrompt().catch(() => undefined);
                if (this.autoFinishPending) {
                    this.autoFinishPending = false;
                    this.discardQueuedPrompts();
                    this.agentRunnerService.finish(runId);
                }
                if (this.diagramWatcherFailure) this.agentRunnerService.stop(runId);
            }
            else {
                this.activeAgentQuestion = false;
                this.activeAgentQuestionRequestId = null;
                this.activeAgentApprovals.clear();
                this.publish(action, phase, 'running', { interactionReady: false, type: 'agentState' });
            }
        };
        const onEvent = (agentEvent) => {
            if (agentEvent.type === 'started') {
                const { continued, conversation } = agentEvent;
                const update = { continued, conversation, kind: 'agentStarted' };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'closed') {
                const update = { conversation: agentEvent.conversation, kind: 'agentClosed' };
                this.publish(action, phase, agentEvent.conversation.status, { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'state') {
                this.publish(action, phase, agentEvent.state, {
                    interactionReady: true,
                    ...(agentEvent.timer ? { timer: agentEvent.timer } : {}),
                    type: 'agentState',
                });
                if (agentEvent.state === 'waitingForInput') void this.dispatchStreamingPrompt().catch(() => undefined);
                return;
            }
            if (agentEvent.type === 'question') {
                this.activeAgentQuestion = true;
                this.activeAgentQuestionRequestId = agentEvent.requestId;
                const update = {
                    kind: 'agentQuestion',
                    questions: agentEvent.questions,
                    requestId: agentEvent.requestId,
                };
                this.publish(action, phase, 'waitingForInput', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'userMessage') {
                const update = { kind: 'agentUserMessage', userMessage: agentEvent.userMessage };
                const state = this.activeAgentQuestion || this.activeAgentApprovals.size > 0 ? 'waitingForInput' : 'running';
                this.publish(action, phase, state, { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'questionAnswered') {
                let questionCleared = false;
                if (this.activeAgentQuestionRequestId === agentEvent.requestId) {
                    this.activeAgentQuestion = false;
                    this.activeAgentQuestionRequestId = null;
                    questionCleared = true;
                }
                const update = {
                    kind: 'agentQuestionAnswer',
                    requestId: agentEvent.requestId,
                    userMessage: agentEvent.userMessage,
                };
                this.publish(action, phase, agentEvent.state, { type: 'update', update });
                if (questionCleared) void this.dispatchStreamingPrompt().catch(() => undefined);
                return;
            }
            if (agentEvent.type === 'questionDismissed') {
                if (this.activeAgentQuestionRequestId === agentEvent.requestId) {
                    this.activeAgentQuestion = false;
                    this.activeAgentQuestionRequestId = null;
                }
                const update = {
                    event: agentEvent.event,
                    kind: 'agentQuestionDismissed',
                    requestId: agentEvent.requestId,
                };
                this.publish(action, phase, agentEvent.state, { type: 'update', update });
                void this.dispatchStreamingPrompt().catch(() => undefined);
                return;
            }
            if (agentEvent.type === 'approval') {
                this.activeAgentApprovals.set(agentEvent.approval.requestId, { ...agentEvent.approval, submitted: false });
                const update = { approval: agentEvent.approval, kind: 'agentApproval' };
                this.publish(action, phase, 'waitingForInput', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'approvalSubmitted') {
                const approval = this.activeAgentApprovals.get(agentEvent.requestId);
                if (!approval) return;
                approval.submitted = true;
                const update = { kind: 'agentApprovalSubmitted', requestId: agentEvent.requestId };
                this.publish(action, phase, 'waitingForInput', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'approvalResolved') {
                if (!this.activeAgentApprovals.delete(agentEvent.requestId)) return;
                const update = { kind: 'agentApprovalResolved', requestId: agentEvent.requestId };
                this.publish(action, phase, agentEvent.state, { type: 'update', update });
                void this.dispatchStreamingPrompt().catch(() => undefined);
                return;
            }
            if (agentEvent.type === 'agentEvent') {
                const update = { entryIndex: agentEvent.entryIndex, event: agentEvent.event, kind: 'agentEvent' };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'usage') {
                const update = {
                    ...(agentEvent.contextWindowUsage !== undefined
                        ? { contextWindowUsage: agentEvent.contextWindowUsage }
                        : {}),
                    kind: 'agentUsage',
                    usage: agentEvent.usage,
                };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }

            const update = agentEvent.type === 'output'
                ? {
                    content: agentEvent.content,
                    entryIndex: agentEvent.entryIndex,
                    kind: 'agentOutput',
                    messageId: agentEvent.messageId,
                    ...(agentEvent.previousContent !== undefined ? { previousContent: agentEvent.previousContent } : {}),
                    ...(agentEvent.replace !== undefined ? { replace: agentEvent.replace } : {}),
                    sequence: agentEvent.sequence,
                }
                : { content: agentEvent.content, kind: 'error' };
            this.publish(action, phase, 'running', { type: 'update', update });
        };
        const runInput = isRoot ? this.runInput : { extraPrompt: '' };
        const diagramFile = action.output?.kind === 'diagram' && this.diagramPath
            ? resolveDiagramFile(project, this.diagramsFolder, this.diagramPath)
            : null;

        const input = {
            action,
            activeCardsFolder: this.activeCardsFolder,
            activityOrigin: this.activityOrigin,
            context: this.context,
            conversationReservation: isRoot ? this.conversationReservation : null,
            diagramFile,
            diagramFooter: this.diagramFooter,
            runId: this.runId,
            onActiveRunChange,
            onEvent,
            project,
            projectFolder: this.projectFolder,
            primaryProject: this.project,
            releasesFolder: this.releasesFolder,
            runInput,
            signal: this.controller.signal,
        };
        const watcher = action.autoFinish?.when === 'diagram-created'
            ? this.diagramOutputWatcherFactory({
                diagramFile,
                handleError: (error) => this.handleDiagramWatcherFailure(error),
                handleReady: () => this.requestAutoFinish(),
                projectRoot: project.rootPath,
            })
            : null;
        try {
            if (watcher) await watcher.start();
            this.throwDiagramWatcherFailure();
            let result = await this.agentExecutor.execute(input);
            this.throwDiagramWatcherFailure();
            const changedPaths = new Set(result.changedPaths ?? []);
            let stderr = result.stderr ?? '';
            let stdout = result.stdout ?? '';
            let queuedPrompt = result.exitCode === 0
                ? await this.claimNextQueuedPromptOrCloseQueue()
                : null;
            while (result.exitCode === 0 && queuedPrompt) {
                result = await this.agentExecutor.execute({
                    ...input,
                    runInput: {
                        ...runInput,
                        continueFrom: result.reference,
                        prompt: queuedPrompt,
                    },
                });
                this.throwDiagramWatcherFailure();
                for (const changedPath of result.changedPaths ?? []) changedPaths.add(changedPath);
                stderr += result.stderr ?? '';
                stdout += result.stdout ?? '';
                queuedPrompt = result.exitCode === 0 ? await this.claimNextQueuedPromptOrCloseQueue() : null;
            }

            return { ...result, changedPaths: [...changedPaths], stderr, stdout };
        } finally {
            if (watcher) await watcher.close();
        }
    }

    handleDiagramWatcherFailure(error) {
        this.diagramWatcherFailure = error instanceof Error ? error : new Error('Diagram output watcher failed');
        if (this.activeAgentRunId) this.agentRunnerService.stop(this.activeAgentRunId);
    }

    throwDiagramWatcherFailure() {
        if (this.diagramWatcherFailure) throw this.diagramWatcherFailure;
    }

    resolveActiveAgentPrompt(content) {
        if (!this.activeAgentProject) throw new Error(`Action run has no active agent project: ${this.runId}`);

        return resolvePopupPrompt(
            content,
            this.context,
            this.activeAgentProject,
            this.project,
            this.projectFolder,
            this.releasesFolder,
            this.activeCardsFolder,
            this.diagramPath ? resolveDiagramFile(this.activeAgentProject, this.diagramsFolder, this.diagramPath) : null,
        );
    }

    publish(action, phase, status, details) {
        const event = {
            actionId: action.id,
            actionType: action.type,
            autoFinish: action.autoFinish ?? null,
            context: this.context,
            runId: this.runId,
            interactionReady: details.interactionReady ?? false,
            phase,
            output: action.output ?? null,
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

module.exports = { ActionRun };
