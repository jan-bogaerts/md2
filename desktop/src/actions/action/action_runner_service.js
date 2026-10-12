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
const { parseConversationActivityReference } = require('../../../../shared/activity_paths.mjs');

function createRunId() {
    return `action-${crypto.randomUUID()}`;
}

function allocateActionRunId() {
    return createRunId();
}

const TERMINAL_RECOVERY_RETENTION_MS = 5 * 60 * 1000;

// Activity ownership follows the presence of cardInternalId, not the context kind.
function activityOrigin(context) {
    if (typeof context.cardInternalId === 'string' && context.cardInternalId.length > 0) {
        return { cardInternalId: context.cardInternalId, kind: 'card' };
    }

    return { kind: 'project' };
}

function requireConfiguredStates(states) {
    if (!Array.isArray(states)) throw new Error('Invalid project states');

    return states.map(({ state }) => {
        if (typeof state !== 'string' || state.length === 0) throw new Error('Invalid project state');

        return state;
    });
}

function userInputRequest(action, visited = new Set()) {
    if (visited.has(action.id)) return null;
    visited.add(action.id);
    if (action.userInput) return action.userInput;

    for (const linkedAction of [...action.onBefore, ...action.on.map(({ action: match }) => match), ...action.onAfter]) {
        const request = userInputRequest(linkedAction, visited);
        if (request) return request;
    }

    return null;
}

class ActionRunnerService {
    constructor(dependencies) {
        this.actionWorktreeRunService = dependencies?.actionWorktreeRunService;
        this.agentConfigProvider = dependencies?.agentConfigProvider;
        this.agentRunnerService = dependencies?.agentRunnerService;
        this.commandRunner = dependencies?.commandRunner ?? runCommand;
        this.commandWindowRunner = dependencies?.commandWindowRunner ?? runCommandInWindow;
        this.diagramOutputWatcherFactory = dependencies?.diagramOutputWatcherFactory;
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
        this.restartingRuns = new Set();
        this.compactRequests = new Map();
        this.compactOperations = Promise.resolve();
        this.compactGeneration = 0;
        this.compactTargetCancellations = new Map();
        this.pendingCompactAcceptances = new Map();
        this.compactConversationCancellations = new Map();
    }

    // Paths arrive already resolved and validated from resolveProjectPaths, and states from the same
    // config read, so the runner no longer loads `.md2/config` itself.
    async startProject(project, paths, states) {
        const { actionsFolder, activeCardsFolder, diagramFooter, diagramsFolder, projectFolder, releasesFolder } = paths ?? {};
        const configuredStates = requireConfiguredStates(states);
        if (this.project) await this.stop();
        // stop() clears configuredStates, so the validated list is stored after the teardown.
        this.configuredStates = configuredStates;
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
        await this.actionDefinitionCache.startProject(project, actionsFolder);
    }

    async stop() {
        this.compactGeneration += 1;
        const completions = [...this.runs.values()].map((run) => {
            run.cancel();

            return run.completion;
        });
        await Promise.all(completions);
        this.clearProject();
    }

    async suspend() {
        this.compactGeneration += 1;
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
        if (startRequest.context.sequenceId || startRequest.context.sequenceCheckoutPath) {
            if (!options.sequenceId || options.sequenceId !== startRequest.context.sequenceId
                || !startRequest.context.sequenceCheckoutPath) {
                throw new Error('Sequence checkout context requires its scheduler owner');
            }
        }
        this.requireReady();
        assertReleasedCardActionAllowed(startRequest.context, this.releasesFolder);
        const origin = activityOrigin(startRequest.context);
        const project = { ...this.project };
        const actionsFolder = this.actionsFolder;
        const definition = await this.loadRootAction(startRequest.actionId);
        if (options.compactTarget) {
            if (!options.compactGuard) throw new Error('Missing compact acceptance guard');
            this.assertCompactAcceptance(options.compactTarget, options.compactGuard);
            if (definition.type !== 'agent') throw new Error('Compact requires an agent action');
        }
        const rootAction = options.compactTarget ? { ...definition, streaming: true } : definition;
        const requestedInput = options.compactTarget ? null : userInputRequest(rootAction);
        if (options.interactive === false && requestedInput && startRequest.runInput[requestedInput.type] === undefined) {
            throw new Error(`Unattended action requires a supplied ${requestedInput.type}: ${rootAction.label}`);
        }
        const diagramPath = options.compactTarget ? null : this.resolveStartDiagramPath(startRequest, rootAction);
        const conversationReservation = this.consumeConversationReservation(startRequest, rootAction);
        const runId = options.runId ?? createRunId();
        if (typeof runId !== 'string' || runId.length === 0) throw new Error('Invalid reserved action run ID');
        if (this.runs.has(runId) || this.completedRunResults.has(runId)) throw new Error(`Action run already exists: ${runId}`);
        const run = new ActionRun({
            compactOnly: !!options.compactTarget,
            compactTarget: options.compactTarget,
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
            requestedInput,
            startedAt: new Date().toISOString(),
        }, {
            actionWorktreeRunService: this.actionWorktreeRunService,
            agentExecutor: this.agentExecutor,
            agentRunnerService: this.agentRunnerService,
            commandRunner: this.commandRunner,
            commandWindowRunner: this.commandWindowRunner,
            diagramOutputWatcherFactory: this.diagramOutputWatcherFactory,
            localGitService: this.localGitService,
            publisher: this.publish.bind(this),
        });
        this.runEvents.set(runId, []);
        this.runs.set(runId, run);
        run.start(this.finalizeRun.bind(this, run));
        if (rootAction.type === 'agent') await run.waitForInitialConversationSave();

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
        const conversationId = startRequest.runInput.conversationId ?? `agent-${crypto.randomUUID()}`;
        const reference = this.localGitService.activityConversationReference(this.projectFolder, origin, conversationId);
        const { activityPath } = parseConversationActivityReference(reference);
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
        const diagramPath = action.output?.kind === 'diagram' ? this.allocateDiagramPath(action.label) : null;
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
            '{{version}}',
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
            this.invalidateCompactAcceptance(run);
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
        const run = this.requireRun(runId);
        this.invalidateCompactAcceptance(run);
        run.cancel();
    }

    answerInput(runId, response) {
        return this.requireRun(runId).answerInput(response);
    }

    async sendAgentMessage(runId, content) {
        const run = this.requireRun(runId);
        await this.waitForCompactAcceptance(run);
        return run.sendAgentMessage(content);
    }

    async enqueueAgentPrompt(runId, content, submissionId) {
        const run = this.requireRun(runId);
        await this.waitForCompactAcceptance(run);
        return run.enqueueAgentPrompt(content, submissionId);
    }

    async waitForCompactAcceptance(run) {
        const conversationId = run.activeConversationId;
        const pending = this.pendingCompactAcceptances.get(conversationId);
        if (pending?.length > 0) await Promise.all([...pending]);
    }

    invalidateCompactAcceptance(run) {
        const conversationId = run.activeConversationId;
        if (conversationId) {
            const version = this.compactConversationCancellations.get(conversationId) ?? 0;
            this.compactConversationCancellations.set(conversationId, version + 1);
        }
    }

    async cancelCompactsForConversation(conversationId) {
        if (typeof conversationId !== 'string' || conversationId.length === 0) throw new Error('Missing compact cancellation conversation ID');
        const version = this.compactConversationCancellations.get(conversationId) ?? 0;
        this.compactConversationCancellations.set(conversationId, version + 1);
        const completions = [];
        for (const run of this.runs.values()) {
            if (run.activeConversationId !== conversationId) continue;
            if (!run.compactOnly && !run.activeCompact && run.compactQueue.length === 0) continue;
            run.cancel();
            completions.push(run.completion);
        }
        await Promise.all(completions);
    }

    /** Serializes acceptance so concurrent clicks cannot create two processes for one saved session. */
    async compactConversation(request) {
        const generation = this.compactGeneration;
        const targetVersion = this.compactTargetVersion(request);
        const previousOperation = this.compactOperations;
        const completion = Promise.withResolvers();
        const acceptance = Promise.withResolvers();
        const conversationId = request?.conversationId;
        const cancellationVersion = this.compactConversationCancellations.get(conversationId) ?? 0;
        const guard = { generation, targetVersion, cancellationVersion };
        const pending = this.pendingCompactAcceptances.get(conversationId) ?? [];
        this.pendingCompactAcceptances.set(conversationId, [...pending, acceptance.promise]);
        this.compactOperations = completion.promise;
        try {
            await previousOperation;
            if (generation !== this.compactGeneration) throw new Error('Compaction cancelled during project shutdown');
            return await this.acceptCompact(request, guard);
        } finally {
            const remaining = this.pendingCompactAcceptances.get(conversationId).filter((promise) => promise !== acceptance.promise);
            if (remaining.length > 0) this.pendingCompactAcceptances.set(conversationId, remaining);
            else this.pendingCompactAcceptances.delete(conversationId);
            acceptance.resolve();
            completion.resolve();
        }
    }

    async acceptCompact(request, guard) {
        this.requireReady();
        for (const field of ['requestId', 'conversationId', 'reference', 'provider', 'actionId']) {
            if (typeof request?.[field] !== 'string' || request[field].length === 0) throw new Error(`Missing compact ${field}`);
        }
        if (!['claude', 'codex'].includes(request.provider)) throw new Error('Unsupported compact provider');
        const startRequest = validateStartRequest({ actionId: request.actionId, context: request.context, runInput: {} });
        const existingRequest = this.compactRequests.get(request.requestId);
        if (existingRequest) {
            if (existingRequest.conversationId !== request.conversationId || existingRequest.reference !== request.reference
                || existingRequest.provider !== request.provider || existingRequest.actionId !== request.actionId
                || (existingRequest.context.cardInternalId ?? null) !== (startRequest.context.cardInternalId ?? null)) {
                throw new Error('Compact request ID already belongs to another target');
            }
            return existingRequest;
        }
        const conversation = await this.localGitService.loadAgentConversation(this.project, request.reference);
        const expectedCardInternalId = startRequest.context.cardInternalId ?? null;
        if (conversation.id !== request.conversationId || (conversation.cardInternalId ?? null) !== expectedCardInternalId
            || conversation.actionId !== request.actionId) throw new Error('Compact conversation identity or ownership does not match');
        if (!conversation.entries.some(({ kind }) => kind === 'message')) throw new Error('There is nothing to compact');
        this.assertCompactAcceptance(request, guard);
        const liveRun = [...this.runs.values()].find((run) => (
            run.activeConversationId === request.conversationId
        ));
        const provider = liveRun?.activeAgentProvider ?? request.provider;
        if (provider !== request.provider) throw new Error('Displayed conversation provider does not match its active session');
        if (!liveRun && !conversation.providerSessions.some(({ agent, conversationId }) => agent === provider && !!conversationId)) {
            throw new Error('Missing provider session for compact');
        }
        const captured = { ...request, context: startRequest.context, state: 'queued' };
        if (liveRun) await liveRun.enqueueCompact(captured);
        else {
            const startupRequest = {
                actionId: request.actionId, context: startRequest.context,
                runInput: { agent: provider, conversationId: conversation.id, continueFrom: request.reference },
            };
            await this.start(startupRequest, { compactTarget: captured, compactGuard: guard });
        }
        return this.compactRequests.get(request.requestId) ?? captured;
    }

    assertCompactAcceptance(request, guard) {
        if (guard.generation !== this.compactGeneration) throw new Error('Compaction cancelled during project shutdown');
        if (guard.targetVersion !== this.compactTargetVersion(request)) throw new Error('Compaction cancelled because its target was deleted');
        if (guard.cancellationVersion !== (this.compactConversationCancellations.get(request.conversationId) ?? 0)) {
            throw new Error('Compaction cancelled because its conversation was stopped or finished');
        }
    }

    compactTargetVersion(request) {
        const targets = [request?.reference?.split('#')[0], request?.context?.file].filter((value) => typeof value === 'string');
        let version = 0;
        for (const [targetPath, count] of this.compactTargetCancellations) {
            if (targets.some((target) => target === targetPath || target.startsWith(`${targetPath}/`))) version += count;
        }
        return version;
    }

    /** Cancel before deletion so a provider checkpoint cannot recreate deleted activity. */
    async cancelCompactsForPath(targetPath) {
        if (typeof targetPath !== 'string' || targetPath.length === 0) throw new Error('Missing compact cancellation target path');
        const previousVersion = this.compactTargetCancellations.get(targetPath) ?? 0;
        this.compactTargetCancellations.set(targetPath, previousVersion + 1);
        const completions = [];
        for (const run of this.runs.values()) {
            const requests = [...(run.activeCompact ? [run.activeCompact] : []), ...run.compactQueue];
            if (run.compactTarget) requests.push(run.compactTarget);
            const matches = requests.some((request) => {
                const targets = [request.reference.split('#')[0], request.context.file].filter((value) => typeof value === 'string');
                return targets.some((target) => target === targetPath || target.startsWith(`${targetPath}/`));
            });
            if (!matches) continue;
            run.failCompactRequests('Compaction cancelled because its target was deleted');
            run.cancel();
            completions.push(run.completion);
        }
        await Promise.all(completions);
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
        const run = this.requireRun(runId);
        this.invalidateCompactAcceptance(run);
        run.finishAgent();
    }

    handleCardStateChange(cardInternalId, state, checkoutPath = null) {
        for (const run of this.runs.values()) {
            if ((run.context?.sequenceCheckoutPath ?? null) !== checkoutPath) continue;
            run.handleCardStateChange(cardInternalId, state);
        }
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
        if (rootAction.output?.kind !== 'diagram') {
            if (startRequest.runInput.diagramPath !== undefined) {
                throw new Error('Diagram output path requires a diagram action');
            }

            return null;
        }

        if (startRequest.context.kind !== 'diagram') throw new Error('Diagram action requires diagram context');

        return startRequest.runInput.diagramPath ?? this.allocateDiagramPath(rootAction.label);
    }

    async finalizeRun(run, runCompletion) {
        const result = await runCompletion;
        this.invalidateCompactAcceptance(run);
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
        if (event.type === 'update' && event.update.kind === 'agentCompact') {
            this.compactRequests.set(event.update.request.requestId, event.update.request);
        }
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

module.exports = { ActionRunnerService, allocateActionRunId };
