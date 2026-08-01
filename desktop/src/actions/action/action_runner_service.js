const crypto = require('node:crypto');
const { ActionAgentExecutor } = require('./action_agent_executor');
const { runCommand } = require('./action_command_executor');
const { ActionDefinitionCache } = require('./action_definition_cache');
const { resolveActionDefinition } = require('./action_definition_resolver');
const { ActionRun } = require('./action_run');
const { prepareAgentPrompt } = require('./action_text');
const { validatePreparePromptRequest, validateStartRequest } = require('./action_run_request');

function createRunId() {
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
        this.actionWorktreeRunService = dependencies?.actionWorktreeRunService;
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
        this.completedRunResults = new Map();
        this.configuredStates = [];
        this.runEvents = new Map();
        this.runs = new Map();
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
        const completions = [...this.runs.values()].map((run) => {
            run.cancel();

            return run.completion;
        });
        await Promise.all(completions);
        this.clearProject();
    }

    async suspend() {
        const completions = [...this.runs.values()].map((run) => {
            run.suspend();

            return run.completion;
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
        if (typeof listener !== 'function') throw new Error('Missing action run listener');
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
        const runId = createRunId();
        const run = new ActionRun({
            actionsFolder,
            activityOrigin: origin,
            context: startRequest.context,
            runId,
            project,
            projectFolder: this.projectFolder,
            releasesFolder: this.releasesFolder,
            rootAction,
            runInput: startRequest.runInput,
            startedAt: new Date().toISOString(),
        }, {
            actionWorktreeRunService: this.actionWorktreeRunService,
            agentExecutor: this.agentExecutor,
            agentRunnerService: this.agentRunnerService,
            commandRunner: this.commandRunner,
            localGitService: this.localGitService,
            publisher: this.publish.bind(this),
        });
        this.runEvents.set(runId, []);
        this.runs.set(runId, run);
        run.start(this.finalizeRun.bind(this, run));

        return runId;
    }

    async prepareActionPrompt(request) {
        const promptRequest = validatePreparePromptRequest(request);
        this.requirePreparationReady();
        const project = { ...this.project };
        const action = await this.loadRootAction(promptRequest.actionId);
        if (action.type !== 'agent') throw new Error('Cannot prepare a prompt for a command action');
        const resolution = await this.actionWorktreeRunService.resolve(project, action, promptRequest.context);

        return {
            prompt: prepareAgentPrompt(
                action,
                promptRequest.context,
                resolution.runProject,
                project,
                this.releasesFolder,
            ),
        };
    }

    async wait(runId) {
        const run = this.runs.get(runId);
        if (run) return run.completion;

        const result = this.completedRunResults.get(runId);
        if (!result) throw new Error(`Unknown action run: ${runId}`);
        this.completedRunResults.delete(runId);

        return result;
    }

    loadActiveRunEvents() {
        return [...this.runEvents.values()].flatMap((events) => events.map((event) => structuredClone(event)));
    }

    cancel(runId) {
        this.requireRun(runId).cancel();
    }

    sendAgentMessage(runId, content) {
        return this.requireRun(runId).sendAgentMessage(content);
    }

    beginAgentPromptDraft(runId) {
        return this.requireRun(runId).beginAgentPromptDraft();
    }

    setAgentQueuedMessage(runId, sessionId, content, revision) {
        return this.requireRun(runId).setAgentQueuedMessage(sessionId, content, revision);
    }

    sendQueuedAgentMessage(runId, sessionId, revision) {
        return this.requireRun(runId).sendQueuedAgentMessage(sessionId, revision);
    }

    answerAgentQuestion(runId, requestId, answers) {
        return this.requireRun(runId).answerAgentQuestion(requestId, answers);
    }

    answerAgentApproval(runId, requestId, decision) {
        return this.requireRun(runId).answerAgentApproval(requestId, decision);
    }

    finishAgentRun(runId) {
        this.requireRun(runId).finishAgent();
    }

    handleCardStateChange(cardInternalId, state) {
        for (const run of this.runs.values()) run.handleCardStateChange(cardInternalId, state);
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

    async finalizeRun(run, runCompletion) {
        const result = await runCompletion;
        this.runs.delete(run.runId);
        this.runEvents.delete(run.runId);
        this.completedRunResults.set(run.runId, result);
        return result;
    }

    publish(event) {
        const events = this.runEvents.get(event.runId);
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
            // Error reporting must not affect action runs.
        }
    }

    requireRun(runId) {
        const run = this.runs.get(runId);
        if (!run) throw new Error(`Unknown action run: ${runId}`);

        return run;
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
        if (!this.actionWorktreeRunService) throw new Error('Action runner has no worktree run service');
        if (!this.agentConfigProvider) throw new Error('Action runner has no agent config provider');
    }
}

module.exports = { ActionRunnerService };
