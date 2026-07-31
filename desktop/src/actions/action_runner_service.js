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

function hasStreamingAction(action, visited = new Set()) {
    if (visited.has(action.id)) return false;
    visited.add(action.id);
    if (action.type === 'agent' && action.streaming) return true;

    return [...action.onBefore, ...action.onAfter, ...action.on.map(({ action: linkedAction }) => linkedAction)]
        .some((linkedAction) => hasStreamingAction(linkedAction, visited));
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
        this.configuredStates = [];
        this.executionEvents = new Map();
        this.executions = new Map();
        this.listeners = new Set();
        this.project = null;
        this.projectFolder = null;
        this.releasesFolder = null;
    }

    async startProject(project, actionsFolder, projectFolder, releasesFolder) {
        if (typeof projectFolder !== 'string') throw new Error('Missing action runner projectFolder');
        if (typeof releasesFolder !== 'string' || releasesFolder.length === 0) throw new Error('Missing action runner releasesFolder');
        if (this.project) await this.stop();
        this.project = project;
        this.actionsFolder = actionsFolder;
        this.projectFolder = projectFolder;
        this.releasesFolder = releasesFolder;
        this.actionCacheReady = this.actionDefinitionCache && this.localGitService
            ? this.initializeProject(project, actionsFolder)
            : null;

        return this.actionCacheReady ?? Promise.resolve();
    }

    async initializeProject(project, actionsFolder) {
        const [, config] = await Promise.all([
            this.actionDefinitionCache.startProject(project, actionsFolder),
            this.localGitService.loadProjectConfig(project),
        ]);
        const states = config?.states;
        if (!Array.isArray(states)) throw new Error('Invalid project states');
        this.configuredStates = states.map(({ state }) => {
            if (typeof state !== 'string' || state.length === 0) throw new Error('Invalid project state');

            return state;
        });
    }

    async stop() {
        const completions = [...this.executions.values()].map((execution) => {
            execution.cancel();

            return execution.completion;
        });
        await Promise.all(completions);
        this.clearProject();
    }

    async suspend() {
        const completions = [...this.executions.values()].map((execution) => {
            execution.suspend();

            return execution.completion;
        });
        await Promise.all(completions);
        this.clearProject();
    }

    clearProject() {
        this.project = null;
        this.actionsFolder = null;
        this.actionCacheReady = null;
        this.projectFolder = null;
        this.releasesFolder = null;
        this.configuredStates = [];
        this.actionDefinitionCache?.stop();
    }

    subscribe(listener) {
        if (typeof listener !== 'function') throw new Error('Missing action execution listener');
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    async start(request, options = {}) {
        const startRequest = validateStartRequest(request);
        this.requireReady();
        const origin = activityOrigin(startRequest.context);
        const project = { ...this.project };
        const actionsFolder = this.actionsFolder;
        const rootAction = await this.loadRootAction(startRequest.actionId);
        if (options.interactive === false && hasStreamingAction(rootAction)) {
            throw new Error(`Streaming action requires an interactive manual run: ${rootAction.label}`);
        }
        const executionId = createExecutionId();
        const execution = new ActionExecution({
            actionsFolder,
            activityOrigin: origin,
            context: startRequest.context,
            executionId,
            project,
            projectFolder: this.projectFolder,
            releasesFolder: this.releasesFolder,
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
        this.executionEvents.set(executionId, []);
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

        return {
            prompt: prepareAgentPrompt(
                action,
                promptRequest.context,
                resolution.executionProject,
                project,
                this.releasesFolder,
            ),
        };
    }

    async wait(executionId) {
        const execution = this.executions.get(executionId);
        if (execution) return execution.completion;

        const result = this.completedResults.get(executionId);
        if (!result) throw new Error(`Unknown action execution: ${executionId}`);
        this.completedResults.delete(executionId);

        return result;
    }

    loadActiveExecutionEvents() {
        return [...this.executionEvents.values()].flatMap((events) => events.map((event) => structuredClone(event)));
    }

    cancel(executionId) {
        this.requireExecution(executionId).cancel();
    }

    sendAgentMessage(executionId, content) {
        return this.requireExecution(executionId).sendAgentMessage(content);
    }

    beginAgentPromptDraft(executionId) {
        return this.requireExecution(executionId).beginAgentPromptDraft();
    }

    setAgentQueuedMessage(executionId, sessionId, content, revision) {
        return this.requireExecution(executionId).setAgentQueuedMessage(sessionId, content, revision);
    }

    sendQueuedAgentMessage(executionId, sessionId, revision) {
        return this.requireExecution(executionId).sendQueuedAgentMessage(sessionId, revision);
    }

    answerAgentQuestion(executionId, requestId, answers) {
        return this.requireExecution(executionId).answerAgentQuestion(requestId, answers);
    }

    finishAgentExecution(executionId) {
        this.requireExecution(executionId).finishAgent();
    }

    handleCardStateChange(cardInternalId, state) {
        for (const execution of this.executions.values()) execution.handleCardStateChange(cardInternalId, state);
    }

    requireActionsFolder() {
        if (!this.actionsFolder) throw new Error('Action runner has no actions folder');

        return this.actionsFolder;
    }

    requireProjectFolder() {
        if (this.projectFolder === null) throw new Error('Action runner has no projectFolder');
        if (this.releasesFolder === null) throw new Error('Action runner has no releasesFolder');

        return this.projectFolder;
    }

    async loadRootAction(actionId) {
        const config = this.agentConfigProvider();
        await this.actionCacheReady;

        return resolveActionDefinition(this.actionDefinitionCache, config.agentProfiles, actionId, this.configuredStates);
    }

    async finalizeExecution(execution, runCompletion) {
        const result = await runCompletion;
        this.executions.delete(execution.executionId);
        this.executionEvents.delete(execution.executionId);
        this.completedResults.set(execution.executionId, result);
        if (this.completedResults.size > COMPLETED_EXECUTION_LIMIT) {
            this.completedResults.delete(this.completedResults.keys().next().value);
        }
        return result;
    }

    publish(event) {
        const events = this.executionEvents.get(event.executionId);
        if (events) events.push(event);
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
