const crypto = require('node:crypto');
const { ActionAgentExecutor } = require('./action_agent_executor');
const { runCommand, runCommandInWindow } = require('./action_command_executor');
const { ActionDefinitionCache } = require('./action_definition_cache');
const { resolveActionDefinition } = require('./action_definition_resolver');
const { ActionRun } = require('./action_run');
const { appendCurrentCardReferences } = require('./action_card_references');
const { createDiagramPath, resolveDiagramFile } = require('./action_diagram_output');
const { resolveAgentPrompt } = require('./action_text');
const { validatePreparePromptRequest, validateStartRequest } = require('./action_run_request');
const { assertReleasedCardActionAllowed } = require('../../../../shared/released_card_actions.mjs');

function createRunId() {
    return `action-${crypto.randomUUID()}`;
}

const TERMINAL_RECOVERY_RETENTION_MS = 5 * 60 * 1000;

// Activity ownership follows the presence of cardInternalId, not the context kind.
function activityOrigin(context) {
    if (typeof context.cardInternalId === 'string' && context.cardInternalId.length > 0) {
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
        this.commandWindowRunner = dependencies?.commandWindowRunner ?? runCommandInWindow;
        this.errorReporter = dependencies?.errorReporter ?? (() => undefined);
        this.localGitService = dependencies?.localGitService;
        this.now = dependencies?.now ?? Date.now;
        this.usageMetricsService = dependencies?.usageMetricsService ?? null;
        this.actionDefinitionCache = dependencies?.actionDefinitionCache
            ?? (this.localGitService ? new ActionDefinitionCache({ localGitService: this.localGitService }) : null);
        this.agentExecutor = new ActionAgentExecutor({
            agentConfigProvider: this.agentConfigProvider,
            agentRunnerService: this.agentRunnerService,
            localGitService: this.localGitService,
        });
        this.actionsFolder = null;
        this.activeCardsFolder = null;
        this.actionCacheReady = null;
        this.completedRunResults = new Map();
        this.recoveryRunResults = new Map();
        this.conversationReservations = new Map();
        this.configuredStates = [];
        this.diagramFooter = null;
        this.diagramsFolder = null;
        this.latestDiagramTimestampMs = 0;
        this.runEvents = new Map();
        this.runs = new Map();
        this.listeners = new Set();
        this.project = null;
        this.projectFolder = null;
        this.releasesFolder = null;
        this.diagramFooter = null;
        this.diagramsFolder = null;
        this.latestDiagramTimestampMs = 0;
        this.restartingRuns = new Set();
    }

    async startProject(project, actionsFolder, projectFolder, releasesFolder, activeCardsFolder, diagramsFolder, diagramFooter) {
        if (typeof projectFolder !== 'string') throw new Error('Missing action runner projectFolder');
        if (typeof releasesFolder !== 'string' || releasesFolder.length === 0) throw new Error('Missing action runner releasesFolder');
        if (typeof activeCardsFolder !== 'string' || activeCardsFolder.length === 0) throw new Error('Missing action runner activeCardsFolder');
        if (typeof diagramsFolder !== 'string' || diagramsFolder.length === 0) throw new Error('Missing action runner diagramsFolder');
        if (typeof diagramFooter !== 'string' || diagramFooter.length === 0) throw new Error('Missing action runner diagramFooter');
        if (!diagramFooter.includes('{{diagram-file}}')) throw new Error('Action runner diagramFooter requires {{diagram-file}} placeholder');
        if (this.project) await this.stop();
        this.usageMetricsService?.startProject(project, projectFolder);
        this.project = project;
        this.actionsFolder = actionsFolder;
        this.activeCardsFolder = activeCardsFolder;
        this.projectFolder = projectFolder;
        this.releasesFolder = releasesFolder;
        this.diagramsFolder = diagramsFolder;
        this.diagramFooter = diagramFooter;
        this.latestDiagramTimestampMs = 0;
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
        this.activeCardsFolder = null;
        this.actionCacheReady = null;
        this.projectFolder = null;
        this.releasesFolder = null;
        this.configuredStates = [];
        this.conversationReservations.clear();
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
        assertReleasedCardActionAllowed(startRequest.context, this.releasesFolder);
        const origin = activityOrigin(startRequest.context);
        const project = { ...this.project };
        const actionsFolder = this.actionsFolder;
        const rootAction = await this.loadRootAction(startRequest.actionId);
        const diagramPath = this.resolveStartDiagramPath(startRequest, rootAction);
        if (options.interactive === false && hasStreamingAction(rootAction)) {
            throw new Error(`Streaming action requires an interactive manual run: ${rootAction.label}`);
        }
        const conversationReservation = this.consumeConversationReservation(startRequest, rootAction);
        const runId = createRunId();
        const run = new ActionRun({
            activeCardsFolder: this.activeCardsFolder,
            actionsFolder,
            activityOrigin: origin,
            context: startRequest.context,
            conversationReservation,
            diagramFooter: this.diagramFooter,
            diagramsFolder: this.diagramsFolder,
            diagramPath,
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
            commandWindowRunner: this.commandWindowRunner,
            localGitService: this.localGitService,
            publisher: this.publish.bind(this),
        });
        this.runEvents.set(runId, []);
        this.runs.set(runId, run);
        run.start(this.finalizeRun.bind(this, run));

        return runId;
    }

    async reserveConversation(request) {
        const startRequest = validateStartRequest(request);
        this.requireReady();
        assertReleasedCardActionAllowed(startRequest.context, this.releasesFolder);
        if (startRequest.runInput.continueFrom) throw new Error('Continuing an agent conversation does not require a reservation');
        const action = await this.loadRootAction(startRequest.actionId);
        if (action.type !== 'agent') throw new Error('Cannot reserve a conversation for a command action');
        const origin = activityOrigin(startRequest.context);
        const project = { ...this.project };
        const conversationId = `agent-${crypto.randomUUID()}`;
        const activityPath = await this.localGitService.ensureActivityFile(project, this.projectFolder, origin);
        const reference = this.localGitService.activityConversationReference(this.projectFolder, origin, conversationId);
        const reservation = { activityPath, conversationId, reference };
        this.conversationReservations.set(reference, reservation);

        return reservation;
    }

    consumeConversationReservation(startRequest, rootAction) {
        const reservation = startRequest.conversationReservation;
        if (!reservation) return null;
        if (rootAction.type !== 'agent') throw new Error('Command action cannot use an agent conversation reservation');
        const stored = this.conversationReservations.get(reservation.reference);
        if (
            !stored
            || stored.activityPath !== reservation.activityPath
            || stored.conversationId !== reservation.conversationId
        ) {
            throw new Error('Unknown agent conversation reservation');
        }
        this.conversationReservations.delete(reservation.reference);

        return reservation;
    }

    async prepareActionPrompt(request) {
        const promptRequest = validatePreparePromptRequest(request);
        this.requirePreparationReady();
        assertReleasedCardActionAllowed(promptRequest.context, this.releasesFolder);
        const project = { ...this.project };
        const action = await this.loadRootAction(promptRequest.actionId);
        if (action.type !== 'agent') throw new Error('Cannot prepare a prompt for a command action');
        const resolution = await this.actionWorktreeRunService.resolve(project, action, promptRequest.context);
        const diagramPath = promptRequest.context.kind === 'diagram' ? this.allocateDiagramPath(action.label) : null;
        const diagramFile = diagramPath === null
            ? null
            : resolveDiagramFile(resolution.runProject, this.diagramsFolder, diagramPath);

        const prompt = resolveAgentPrompt(
            action,
            promptRequest.context,
            resolution.runProject,
            project,
            this.projectFolder,
            this.releasesFolder,
            this.activeCardsFolder,
            '',
            this.diagramFooter,
            diagramFile,
        );

        return {
            ...(diagramPath ? { diagramPath } : {}),
            prompt: await appendCurrentCardReferences(prompt, promptRequest.context, project, this.localGitService),
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

    async restart(runId, request) {
        if (this.restartingRuns.has(runId)) throw new Error(`Action run restart already in progress: ${runId}`);
        const startRequest = validateStartRequest(request);
        this.requireReady();
        assertReleasedCardActionAllowed(startRequest.context, this.releasesFolder);
        const run = this.requireRun(runId);
        this.restartingRuns.add(runId);
        try {
            run.finishAgent();
            const result = await run.completion;
            if (result.status !== 'completed') {
                throw new Error(result.failure ?? `Action run could not be restarted after ${result.status}`);
            }

            return await this.start(request);
        } finally {
            this.restartingRuns.delete(runId);
        }
    }

    loadRunRecoverySnapshot(rendererRunIds) {
        if (!Array.isArray(rendererRunIds) || rendererRunIds.some((runId) => typeof runId !== 'string')) {
            throw new Error('Invalid action run recovery IDs');
        }

        const now = Date.now();
        for (const [runId, { expiresAt }] of this.recoveryRunResults) {
            if (expiresAt <= now) this.recoveryRunResults.delete(runId);
        }
        const terminalResults = rendererRunIds.flatMap((runId) => {
            const entry = this.recoveryRunResults.get(runId);

            return entry ? [entry.result] : [];
        });

        return { activeRunEvents: [...this.runEvents.values()].flat(), terminalResults };
    }

    cancel(runId) {
        this.requireRun(runId).cancel();
    }

    sendAgentMessage(runId, content) {
        return this.requireRun(runId).sendAgentMessage(content);
    }

    enqueueAgentPrompt(runId, content) {
        return this.requireRun(runId).enqueueAgentPrompt(content);
    }

    editQueuedAgentPrompt(runId, promptId, revision, content) {
        return this.requireRun(runId).editQueuedAgentPrompt(promptId, revision, content);
    }

    deleteQueuedAgentPrompt(runId, promptId, revision) {
        return this.requireRun(runId).deleteQueuedAgentPrompt(promptId, revision);
    }

    answerAgentQuestion(runId, requestId, answers) {
        return this.requireRun(runId).answerAgentQuestion(requestId, answers);
    }

    dismissAgentQuestions(runId, requestId) {
        return this.requireRun(runId).dismissAgentQuestions(requestId);
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
        if (!this.activeCardsFolder) throw new Error('Action runner has no activeCardsFolder');

        return this.actionsFolder;
    }

    requireProjectFolder() {
        if (this.projectFolder === null) throw new Error('Action runner has no projectFolder');
        if (!this.diagramsFolder) throw new Error('Action runner has no diagramsFolder');
        if (!this.diagramFooter) throw new Error('Action runner has no diagramFooter');
        if (this.releasesFolder === null) throw new Error('Action runner has no releasesFolder');

        return this.projectFolder;
    }

    async loadRootAction(actionId) {
        const config = this.agentConfigProvider();
        await this.actionCacheReady;

        return resolveActionDefinition(this.actionDefinitionCache, config.agentProfiles, actionId, this.configuredStates);
    }

    allocateDiagramPath(actionLabel) {
        const timestampMs = Math.max(this.now(), this.latestDiagramTimestampMs + 1);
        this.latestDiagramTimestampMs = timestampMs;

        return createDiagramPath(actionLabel, this.diagramsFolder, timestampMs);
    }

    resolveStartDiagramPath(startRequest, rootAction) {
        if (startRequest.context.kind !== 'diagram') {
            if (startRequest.runInput.diagramPath !== undefined) {
                throw new Error('Diagram output path requires diagram context');
            }

            return null;
        }

        return startRequest.runInput.diagramPath ?? this.allocateDiagramPath(rootAction.label);
    }

    async finalizeRun(run, runCompletion) {
        const result = await runCompletion;
        this.runs.delete(run.runId);
        this.runEvents.delete(run.runId);
        this.completedRunResults.set(run.runId, result);
        this.recoveryRunResults.set(run.runId, {
            expiresAt: Date.now() + TERMINAL_RECOVERY_RETENTION_MS,
            result,
        });
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

    /** Reports every in-flight run so a release can refuse to start while agents are working. */
    listActiveRuns() {
        return [...this.runs.values()].map((run) => ({ label: run.rootAction.label, runId: run.runId }));
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
