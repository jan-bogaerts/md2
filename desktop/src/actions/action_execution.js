const { ActionCancellationError } = require('./action_cancellation_error');
const { executeCommandAction } = require('./action_command_executor');
const { ActionPhaseError } = require('./action_phase_error');
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
        this.activeAgentRunId = null;
        this.commitReferenceKeys = new Set();
        this.commitReferences = [];
        this.conversationIds = [];
        this.completion = null;
        this.controller = new AbortController();
        this.rootHistoryEntry = null;
    }

    start(finalize) {
        const runCompletion = this.run();
        this.completion = finalize(runCompletion);
    }

    cancel() {
        this.controller.abort();
        if (this.activeAgentRunId) this.agentRunnerService.stop(this.activeAgentRunId);
    }

    async run() {
        this.publish(this.rootAction, 'main', 'running', { type: 'execution' });
        let status = 'completed';
        let failure = null;
        try {
            await this.runAction(this.rootAction, 'main', true);
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
        this.publish(action, phase, 'running', { type: 'action' });

        try {
            const result = await this.executeAction(action, phase, isRoot);
            if (this.controller.signal.aborted) {
                this.publish(action, phase, 'cancelled', {
                    command: Array.isArray(result.command) ? result.command.join(' ') : result.command,
                    executionWorktree: result.executionWorktree,
                    message: 'Action cancelled',
                    reference: result.reference,
                    runId: result.runId,
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
                runId: result.runId,
                thinkingLevel: result.thinkingLevel,
                type: 'action',
            });
            if (result.exitCode !== 0) throw new ActionPhaseError(`${action.label} failed with exit code ${result.exitCode}`, phase, rootPhase);

            return output;
        } catch (error) {
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

    async executeAction(action, phase, isRoot) {
        if (action.type === 'command' && isRoot && this.runInput.continueFrom) {
            throw new Error('Conversation continuation requires an agent action');
        }

        return this.actionWorktreeExecutionService.execute(this.project, action, this.context, async (project) => {
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
            if (action.type === 'agent' && typeof committedResult.runId === 'string') {
                this.conversationIds.push(committedResult.runId);
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

    executeAgentAction(action, phase, isRoot, project) {
        const onActiveRunChange = (runId) => {
            this.activeAgentRunId = runId;
        };
        const onEvent = (agentEvent) => {
            if (agentEvent.type === 'started') {
                const { conversationId, reference, startedAt, title, userMessage } = agentEvent;
                const update = { conversationId, kind: 'agentStarted', reference, startedAt, title, userMessage };
                this.publish(action, phase, 'running', { type: 'update', update });
                return;
            }
            if (agentEvent.type === 'closed') return;

            const update = { content: agentEvent.content, kind: agentEvent.type };
            this.publish(action, phase, 'running', { type: 'update', update });
        };
        const runInput = isRoot ? this.runInput : { extraPrompt: '' };

        return this.agentExecutor.execute({
            action,
            activityOrigin: this.activityOrigin,
            context: this.context,
            onActiveRunChange,
            onEvent,
            project,
            projectFolder: this.projectFolder,
            primaryProject: this.project,
            runInput,
            signal: this.controller.signal,
        });
    }

    publish(action, phase, status, details) {
        this.publisher({
            actionId: action.id,
            context: this.context,
            executionId: this.executionId,
            phase,
            rootActionId: this.rootAction.id,
            status,
            ...details,
        });
    }

    throwIfCancelled() {
        if (this.controller.signal.aborted) throw new ActionCancellationError('Action cancelled');
    }
}

module.exports = { ActionExecution };
