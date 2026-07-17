const { ActionCancellationError } = require('./action_cancellation_error');
const { executeCommandAction } = require('./action_command_executor');
const { ActionPhaseError } = require('./action_phase_error');
const { appendAgentRunHistory, appendCommandRunHistory, combineOutput } = require('./action_run_history');

function errorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}

class ActionExecution {
    constructor(snapshot, dependencies) {
        this.actionsFolder = snapshot.actionsFolder;
        this.context = snapshot.context;
        this.executionId = snapshot.executionId;
        this.project = snapshot.project;
        this.projectFolder = snapshot.projectFolder;
        this.rootAction = snapshot.rootAction;
        this.runInput = snapshot.runInput;
        this.actionWorktreeExecutionService = dependencies.actionWorktreeExecutionService;
        this.agentExecutor = dependencies.agentExecutor;
        this.agentRunnerService = dependencies.agentRunnerService;
        this.commandRunner = dependencies.commandRunner;
        this.localGitService = dependencies.localGitService;
        this.publisher = dependencies.publisher;
        this.activeAgentRunId = null;
        this.completion = null;
        this.controller = new AbortController();
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
                    conversation: result.conversation,
                    executionWorktree: result.executionWorktree,
                    message: 'Action cancelled',
                    reference: result.reference,
                    runId: result.runId,
                    stderr: result.stderr,
                    stdout: result.stdout,
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
                conversation: result.conversation,
                executionWorktree: result.executionWorktree,
                message: status === 'completed' ? `${action.label} completed` : `${action.label} failed with exit code ${result.exitCode}`,
                reference: result.reference,
                runId: result.runId,
                stderr: result.stderr,
                stdout: result.stdout,
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
            this.publish(action, phase, 'failed', { message, stderr: message, stdout: '', type: 'action' });
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
            const executionProject = {
                ...project,
                branch: result.branch ?? project.branch,
                rootPath: result.repositoryRoot ?? project.rootPath,
            };
            const historyInput = { action, context: this.context, project: executionProject, projectFolder: this.projectFolder, result };
            if (action.type === 'agent') await appendAgentRunHistory(this.localGitService, historyInput);
            else await appendCommandRunHistory(this.localGitService, historyInput);

            return result;
        });
    }

    executeCommandAction(action, phase, isRoot, project) {
        const onOutput = ({ command, stderr, stdout }) => this.publish(action, phase, 'running', {
            command,
            stderr,
            stdout,
            type: 'action',
        });

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
        const onEvent = (agentEvent) => this.publish(action, phase, 'running', { agentEvent, type: 'agent' });
        const runInput = isRoot ? this.runInput : { extraPrompt: '' };

        return this.agentExecutor.execute({
            action,
            context: this.context,
            onActiveRunChange,
            onEvent,
            project,
            projectFolder: this.projectFolder,
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
