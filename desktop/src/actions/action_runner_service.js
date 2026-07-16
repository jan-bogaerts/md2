const crypto = require('node:crypto');
const { ActionAgentExecutor } = require('./action_agent_executor');
const { runCommand } = require('./action_command_executor');
const { resolveActionDefinition } = require('./action_definition_resolver');
const { ActionExecution } = require('./action_execution');
const { validateStartRequest } = require('./action_run_request');

const COMPLETED_EXECUTION_LIMIT = 100;

function createExecutionId() {
    return `action-${crypto.randomUUID()}`;
}

class ActionRunnerService {
    constructor(dependencies) {
        this.actionWorktreeExecutionService = dependencies?.actionWorktreeExecutionService;
        this.agentConfigProvider = dependencies?.agentConfigProvider;
        this.agentRunnerService = dependencies?.agentRunnerService;
        this.commandRunner = dependencies?.commandRunner ?? runCommand;
        this.errorReporter = dependencies?.errorReporter ?? (() => undefined);
        this.localGitService = dependencies?.localGitService;
        this.agentExecutor = new ActionAgentExecutor({
            agentConfigProvider: this.agentConfigProvider,
            agentRunnerService: this.agentRunnerService,
            localGitService: this.localGitService,
        });
        this.actionsFolder = null;
        this.completedResults = new Map();
        this.executions = new Map();
        this.listeners = new Set();
        this.project = null;
    }

    startProject(project, actionsFolder) {
        this.project = project;
        this.actionsFolder = actionsFolder;
    }

    stop() {
        for (const execution of this.executions.values()) execution.cancel();
        this.project = null;
        this.actionsFolder = null;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') throw new Error('Missing action execution listener');
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    async start(request) {
        const startRequest = validateStartRequest(request);
        this.requireReady();
        const project = { ...this.project };
        const actionsFolder = this.actionsFolder;
        const rootAction = await this.loadRootAction(startRequest.actionId, project, actionsFolder);
        const executionId = createExecutionId();
        const execution = new ActionExecution({
            actionsFolder,
            context: startRequest.context,
            executionId,
            project,
            rootAction,
            runInput: startRequest.runInput,
        }, {
            actionWorktreeExecutionService: this.actionWorktreeExecutionService,
            agentExecutor: this.agentExecutor,
            agentRunnerService: this.agentRunnerService,
            commandRunner: this.commandRunner,
            localGitService: this.localGitService,
            publisher: this.publish.bind(this),
        });
        this.executions.set(executionId, execution);
        execution.start(this.finalizeExecution.bind(this, execution));

        return executionId;
    }

    async wait(executionId) {
        const execution = this.executions.get(executionId);
        if (execution) return execution.completion;

        const result = this.completedResults.get(executionId);
        if (!result) throw new Error(`Unknown action execution: ${executionId}`);
        this.completedResults.delete(executionId);

        return result;
    }

    cancel(executionId) {
        this.requireExecution(executionId).cancel();
    }

    requireActionsFolder() {
        if (!this.actionsFolder) throw new Error('Action runner has no actions folder');

        return this.actionsFolder;
    }

    async loadRootAction(actionId, project, actionsFolder) {
        const config = this.agentConfigProvider();

        return resolveActionDefinition(this.localGitService, project, actionsFolder, config.agentProfiles, actionId);
    }

    async finalizeExecution(execution, runCompletion) {
        const result = await runCompletion;
        this.executions.delete(execution.executionId);
        this.completedResults.set(execution.executionId, result);
        if (this.completedResults.size > COMPLETED_EXECUTION_LIMIT) {
            this.completedResults.delete(this.completedResults.keys().next().value);
        }
        return result;
    }

    publish(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                this.reportError(error);
            }
        }
    }

    reportError(error) {
        try {
            this.errorReporter(error);
        } catch {
            // Error reporting must not affect action execution.
        }
    }

    requireExecution(executionId) {
        const execution = this.executions.get(executionId);
        if (!execution) throw new Error(`Unknown action execution: ${executionId}`);

        return execution;
    }

    requireReady() {
        if (!this.project) throw new Error('Action runner has no project');
        if (!this.actionsFolder) throw new Error('Action runner has no actions folder');
        if (!this.localGitService) throw new Error('Action runner has no local Git service');
        if (!this.actionWorktreeExecutionService) throw new Error('Action runner has no worktree execution service');
        if (!this.agentRunnerService) throw new Error('Action runner has no agent runner service');
        if (!this.agentConfigProvider) throw new Error('Action runner has no agent config provider');
    }
}

module.exports = { ActionRunnerService };
