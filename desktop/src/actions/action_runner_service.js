const crypto = require('node:crypto');
const { ActionAgentExecutor } = require('./action_agent_executor');
const { runCommand } = require('./action_command_executor');
const { ActionDefinitionCache } = require('./action_definition_cache');
const { resolveActionDefinition } = require('./action_definition_resolver');
const { ActionExecution } = require('./action_execution');
const { prepareAgentPrompt } = require('./action_text');
const { validatePreparePromptRequest, validateStartRequest } = require('./action_run_request');

const COMPLETED_EXECUTION_LIMIT = 100;

function createExecutionId() {
    return `action-${crypto.randomUUID()}`;
}

function activityOrigin(context) {
    if (context.kind === 'card' || context.kind === 'file') {
        if (typeof context.cardInternalId !== 'string' || context.cardInternalId.length === 0) {
            throw new Error('Card-origin action requires cardInternalId');
        }

        return { cardInternalId: context.cardInternalId, kind: 'card' };
    }

    return { kind: 'project' };
}

class ActionRunnerService {
    constructor(dependencies) {
        this.actionWorktreeExecutionService = dependencies?.actionWorktreeExecutionService;
        this.agentConfigProvider = dependencies?.agentConfigProvider;
        this.agentRunnerService = dependencies?.agentRunnerService;
        this.commandRunner = dependencies?.commandRunner ?? runCommand;
        this.errorReporter = dependencies?.errorReporter ?? (() => undefined);
        this.localGitService = dependencies?.localGitService;
        this.actionDefinitionCache = dependencies?.actionDefinitionCache
            ?? (this.localGitService ? new ActionDefinitionCache({ localGitService: this.localGitService }) : null);
        this.agentExecutor = new ActionAgentExecutor({
            agentConfigProvider: this.agentConfigProvider,
            agentRunnerService: this.agentRunnerService,
            localGitService: this.localGitService,
        });
        this.actionsFolder = null;
        this.actionCacheReady = null;
        this.completedResults = new Map();
        this.executions = new Map();
        this.listeners = new Set();
        this.project = null;
        this.projectFolder = null;
    }

    startProject(project, actionsFolder, projectFolder) {
        if (typeof projectFolder !== 'string') throw new Error('Missing action runner projectFolder');
        this.project = project;
        this.actionsFolder = actionsFolder;
        this.projectFolder = projectFolder;
        this.actionCacheReady = this.actionDefinitionCache?.startProject(project, actionsFolder) ?? null;

        return this.actionCacheReady ?? Promise.resolve();
    }

    stop() {
        for (const execution of this.executions.values()) execution.cancel();
        this.project = null;
        this.actionsFolder = null;
        this.actionCacheReady = null;
        this.projectFolder = null;
        this.actionDefinitionCache?.stop();
    }

    subscribe(listener) {
        if (typeof listener !== 'function') throw new Error('Missing action execution listener');
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    async start(request) {
        const startRequest = validateStartRequest(request);
        this.requireReady();
        const origin = activityOrigin(startRequest.context);
        const project = { ...this.project };
        const actionsFolder = this.actionsFolder;
        const rootAction = await this.loadRootAction(startRequest.actionId);
        const executionId = createExecutionId();
        const execution = new ActionExecution({
            actionsFolder,
            activityOrigin: origin,
            context: startRequest.context,
            executionId,
            project,
            projectFolder: this.projectFolder,
            rootAction,
            runInput: startRequest.runInput,
            startedAt: new Date().toISOString(),
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

    async prepareActionPrompt(request) {
        const promptRequest = validatePreparePromptRequest(request);
        this.requirePreparationReady();
        const project = { ...this.project };
        const action = await this.loadRootAction(promptRequest.actionId);
        if (action.type !== 'agent') throw new Error('Cannot prepare a prompt for a command action');
        const resolution = await this.actionWorktreeExecutionService.resolve(project, action, promptRequest.context);

        return { prompt: prepareAgentPrompt(action, promptRequest.context, resolution.executionProject) };
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

    requireProjectFolder() {
        if (this.projectFolder === null) throw new Error('Action runner has no projectFolder');

        return this.projectFolder;
    }

    async loadRootAction(actionId) {
        const config = this.agentConfigProvider();
        await this.actionCacheReady;

        return resolveActionDefinition(this.actionDefinitionCache, config.agentProfiles, actionId);
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
        this.requirePreparationReady();
        if (!this.agentRunnerService) throw new Error('Action runner has no agent runner service');
    }

    requirePreparationReady() {
        if (!this.project) throw new Error('Action runner has no project');
        if (!this.actionsFolder) throw new Error('Action runner has no actions folder');
        if (this.projectFolder === null) throw new Error('Action runner has no projectFolder');
        if (!this.localGitService) throw new Error('Action runner has no local Git service');
        if (!this.actionDefinitionCache) throw new Error('Action runner has no action definition cache');
        if (!this.actionCacheReady) throw new Error('Action runner action definition cache is not ready');
        if (!this.actionWorktreeExecutionService) throw new Error('Action runner has no worktree execution service');
        if (!this.agentConfigProvider) throw new Error('Action runner has no agent config provider');
    }
}

module.exports = { ActionRunnerService };
