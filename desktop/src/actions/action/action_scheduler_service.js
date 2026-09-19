const { normalizeFolderPath } = require('../../../../shared/project_config_defaults.mjs');
const {
    activeSchedules,
    appendActionSchedule,
    cancelPendingActionSchedule,
    deleteScheduleRecord,
    findPendingSchedule,
    replaceScheduleRecord,
    updateActionScheduleStatus,
} = require('../schedule/schedule_store');
const { cancelScheduleTimer, clearScheduleTimers, reconcileScheduleTimers } = require('../schedule/schedule_timers');
const { accountResetObservations, trackerKey } = require('../schedule/schedule_account_snapshots');
const { resolveScheduledCardContext } = require('../schedule/scheduled_card_context');
const { ScheduledCardSequenceEngine } = require('../schedule/scheduled_card_sequence_engine');
const { allocateActionRunId } = require('./action_runner_service');

function createScheduleId() {
    return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createScheduleExecutionControl() {
    let resolveStartedPromise;
    let startedResolved = false;
    const started = new Promise((resolve) => {
        resolveStartedPromise = resolve;
    });

    return {
        cancelRequested: false,
        resolveStarted: (runId) => {
            if (startedResolved) return;
            startedResolved = true;
            resolveStartedPromise(runId);
        },
        started,
    };
}

function scheduleStatusFromResult(status) {
    if (status === 'completed') return 'completed';
    if (status === 'cancelled') return 'cancelled';

    return 'failed';
}

function validateFutureTimestamp(timestamp, fieldName, now) {
    if (typeof timestamp !== 'string' || timestamp.length === 0) throw new Error(`Missing action schedule ${fieldName}`);
    const fireAt = Date.parse(timestamp);
    if (Number.isNaN(fireAt)) throw new Error(`Invalid action schedule ${fieldName}: ${timestamp}`);
    if (fireAt <= now) throw new Error(`Action schedule ${fieldName} must be in the future`);
}

function validateRegistrationRequest(request, now) {
    if (!request || typeof request !== 'object') throw new Error('Missing action schedule registration request');
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action schedule actionId');
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action schedule context');
    if (!request.trigger || typeof request.trigger !== 'object') throw new Error('Missing action schedule trigger');
    if (request.trigger.type === 'at') {
        validateFutureTimestamp(request.trigger.timestamp, 'timestamp', now);
        return request;
    }
    if (request.trigger.type === 'account-reset') {
        validateFutureTimestamp(request.trigger.expectedResetAt, 'expectedResetAt', now);
        return request;
    }
    if (request.trigger.type === 'card-state') return request;

    throw new Error(`Unsupported action schedule trigger: ${request.trigger.type}`);
}

function validateSequenceRegistrationRequest(request) {
    if (!request || typeof request !== 'object') throw new Error('Missing sequence schedule registration request');
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing sequence schedule actionId');
    if (!Array.isArray(request.cardInternalIds) || request.cardInternalIds.length === 0) {
        throw new Error('Missing sequence schedule cardInternalIds');
    }
    if (typeof request.readyState !== 'string' || request.readyState.length === 0) {
        throw new Error('Missing sequence schedule readyState');
    }
    if (!request.trigger || typeof request.trigger !== 'object') throw new Error('Missing sequence schedule trigger');

    return request;
}

function requireProject(project) {
    if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) throw new Error('Missing scheduler project');

    return project;
}

class ActionSchedulerService {
    constructor(dependencies) {
        this.actionRunnerService = dependencies?.actionRunnerService;
        this.confirmCardStateScheduleContinuation = dependencies?.confirmCardStateScheduleContinuation ?? null;
        this.errorReporter = dependencies?.errorReporter ?? (() => undefined);
        this.clearTimeout = dependencies?.clearTimeout ?? clearTimeout;
        this.localGitService = dependencies?.localGitService;
        this.now = dependencies?.now ?? Date.now;
        this.setTimeout = dependencies?.setTimeout ?? setTimeout;
        this.project = null;
        this.actionsFolder = null;
        this.activeCardsFolder = null;
        this.cardTypes = [];
        this.configuredStates = [];
        this.accountResetObservations = new Map();
        this.cardObservationsByScheduleId = new Map();
        this.projectGeneration = 0;
        this.runIdsByScheduleId = new Map();
        this.scheduleCompletionsByScheduleId = new Map();
        this.scheduleExecutionControls = new Map();
        this.scheduleMutation = Promise.resolve();
        this.sequenceEngine = null;
        this.runningScheduleIds = new Set();
        this.timers = new Map();
        this.accountUsageUnsubscribers = [];
        this.subscribeToAccountUsage('claude', dependencies?.claudeRuntimeService);
        this.subscribeToAccountUsage('codex', dependencies?.codexRuntimeService);
    }

    // The caller resolves the project config and starts the action runner; the scheduler's only
    // project-derived input is the actions folder holding its own schedules file.
    async startProject(project, paths, projectConfig) {
        if (!paths || typeof paths.actionsFolder !== 'string' || paths.actionsFolder.length === 0) {
            throw new Error('Missing scheduler actionsFolder');
        }
        if (typeof paths.activeCardsFolder !== 'string' || paths.activeCardsFolder.length === 0) {
            throw new Error('Missing scheduler activeCardsFolder');
        }
        if (!Array.isArray(projectConfig?.states)) throw new Error('Missing scheduler project states');
        if (!Array.isArray(projectConfig.cardTypes)) throw new Error('Missing scheduler project card types');
        this.clearProjectState();
        this.project = requireProject(project);
        this.actionsFolder = paths.actionsFolder;
        this.activeCardsFolder = paths.activeCardsFolder;
        this.cardTypes = projectConfig.cardTypes;
        this.configuredStates = projectConfig.states.map(({ state }) => state);
        const generation = this.projectGeneration;
        const executionContext = {
            actionsFolder: this.actionsFolder,
            activeCardsFolder: this.activeCardsFolder,
            cardTypes: this.cardTypes,
            generation,
            project: this.project,
        };
        this.sequenceEngine = new ScheduledCardSequenceEngine({
            actionRunnerService: this.actionRunnerService,
            allocateRunId: allocateActionRunId,
            isCurrent: () => generation === this.projectGeneration,
            loadSchedules: () => this.loadSchedules(executionContext),
            resolveCardContext: (cardInternalId) => this.resolveCardContext(cardInternalId, executionContext),
            saveSequence: (sequence) => this.saveSequence(sequence, executionContext),
            states: this.configuredStates,
        });
        await this.reconcile({ startup: true });
    }

    stop() {
        this.clearProjectState();
        for (const unsubscribe of this.accountUsageUnsubscribers) unsubscribe();
        this.accountUsageUnsubscribers = [];
        this.runningScheduleIds.clear();
        this.runIdsByScheduleId.clear();
        this.scheduleCompletionsByScheduleId.clear();
        this.scheduleExecutionControls.clear();
        this.project = null;
        this.actionsFolder = null;
        this.activeCardsFolder = null;
        this.cardTypes = [];
        this.configuredStates = [];
        this.sequenceEngine = null;
    }

    clearProjectState() {
        this.projectGeneration += 1;
        clearScheduleTimers(this.timers, this.clearTimeout);
        this.accountResetObservations.clear();
        this.cardObservationsByScheduleId.clear();
    }

    subscribeToAccountUsage(agent, runtimeService) {
        if (!runtimeService) return;
        const unsubscribe = runtimeService.subscribe((snapshot) => {
            void this.handleAccountUsageChange(agent, snapshot).catch((error) => this.errorReporter(error));
        });
        this.accountUsageUnsubscribers.push(unsubscribe);
    }

    async registerActionSchedule(request) {
        const registration = validateRegistrationRequest(request, this.now());
        const schedule = {
            actionId: registration.actionId,
            context: registration.context,
            createdAt: new Date(this.now()).toISOString(),
            id: createScheduleId(),
            kind: 'action',
            status: 'pending',
            trigger: registration.trigger,
        };
        await this.mutateSchedules(null, (schedules) => appendActionSchedule(schedules, schedule));
        await this.reconcile();

        return schedule;
    }

    async registerSequenceSchedule(request) {
        const registration = validateSequenceRegistrationRequest(request);
        const schedule = {
            actionCompleted: false,
            actionId: registration.actionId,
            cardInternalIds: registration.cardInternalIds,
            createdAt: new Date(this.now()).toISOString(),
            currentIndex: 0,
            currentRunId: null,
            failure: null,
            id: createScheduleId(),
            kind: 'sequence',
            readyState: registration.readyState,
            readyStateMet: false,
            status: 'pending',
            trigger: registration.trigger,
        };
        await this.mutateSchedules(null, (schedules) => appendActionSchedule(schedules, schedule));
        if (schedule.trigger.type === 'now') await this.fireSchedule(schedule.id);
        else await this.reconcile();

        return schedule;
    }

    async listActiveSchedules() {
        return activeSchedules(await this.loadSchedules());
    }

    async deleteSchedule(scheduleId) {
        if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing schedule id');
        const schedules = await this.loadSchedules();
        if (!schedules.some(({ id }) => id === scheduleId)) throw new Error(`Schedule not found: ${scheduleId}`);

        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout);
        const sequence = schedules.find((schedule) => schedule.id === scheduleId && schedule.kind === 'sequence');
        if (sequence) await this.sequenceEngine.cancel(scheduleId);
        const scheduleKey = this.scheduleKey(scheduleId);
        await this.cancelRunningActionSchedule(scheduleKey);
        const completion = this.scheduleCompletionsByScheduleId.get(scheduleKey);
        if (completion) await completion;

        const nextSchedules = await this.mutateSchedules(null, (currentSchedules) => (
            deleteScheduleRecord(currentSchedules, scheduleId)
        ));
        await this.reconcile();

        return nextSchedules;
    }

    async cancelActionSchedule(scheduleId) {
        if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id');

        const scheduleKey = this.scheduleKey(scheduleId);
        const cancelledRunningSchedule = await this.cancelRunningActionSchedule(scheduleKey);
        if (cancelledRunningSchedule) {
            return this.loadSchedules();
        }

        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout);

        const schedules = await this.mutateSchedules(null, (currentSchedules) => (
            cancelPendingActionSchedule(currentSchedules, scheduleId)
        ));
        await this.reconcile();

        return schedules;
    }

    async handleProjectChange(event) {
        // The bridge registers the project watcher independently of activation, so an event can
        // arrive before startProject; there is nothing to reconcile until then.
        if (this.actionsFolder === null) return;

        const normalizedActionsFolder = normalizeFolderPath(this.actionsFolder);
        if (!event || event.path !== `${normalizedActionsFolder}/.md2-schedules.json`) return;

        try {
            await this.reconcile();
        } catch {
            // Reconcile reports the failure. The project watcher must remain active for a later repair.
        }
    }

    async handleCardStateChange(cardInternalId, state) {
        if (typeof cardInternalId !== 'string' || cardInternalId.length === 0) throw new Error('Missing card-state cardInternalId');
        if (typeof state !== 'string' || state.length === 0) throw new Error('Missing card-state state');
        if (this.actionsFolder === null) return;
        const generation = this.projectGeneration;
        const schedules = await this.loadSchedules();
        if (generation !== this.projectGeneration) return;
        this.reconcileCardObservations(schedules);

        for (const schedule of schedules) {
            if (schedule.status !== 'pending' || schedule.trigger.type !== 'card-state') continue;
            if (schedule.trigger.cardInternalId !== cardInternalId) continue;
            const observation = this.cardObservationsByScheduleId.get(schedule.id);
            const enteredTargetState = observation.state !== schedule.trigger.targetState
                && state === schedule.trigger.targetState;
            observation.state = state;
            if (enteredTargetState) await this.fireSchedule(schedule.id, generation);
        }
        if (generation === this.projectGeneration) await this.sequenceEngine.handleCardStateChange(cardInternalId, state);
    }

    async handleAccountUsageChange(agent, snapshot) {
        const observations = accountResetObservations(agent, snapshot);
        if (this.actionsFolder === null) return;
        const generation = this.projectGeneration;
        for (const observation of observations) {
            this.accountResetObservations.set(
                trackerKey(observation.agent, observation.limitId, observation.windowId),
                observation.resetsAt,
            );
        }
        const schedules = await this.loadSchedules();
        if (generation !== this.projectGeneration) return;

        for (const schedule of schedules) {
            if (schedule.status !== 'pending' || schedule.trigger.type !== 'account-reset') continue;
            const { agent: triggerAgent, expectedResetAt, limitId, windowId } = schedule.trigger;
            const hasMatchingObservation = observations.some((observation) => (
                observation.agent === triggerAgent
                && observation.limitId === limitId
                && observation.windowId === windowId
            ));
            if (!hasMatchingObservation || this.now() < Date.parse(expectedResetAt)) continue;
            await this.fireSchedule(schedule.id, generation);
        }
    }

    async reconcile(options = {}) {
        let schedules;
        try {
            schedules = await this.loadSchedules();
        } catch (error) {
            this.reportError(error);
            throw error;
        }
        if (options.startup) schedules = await this.reconcileInterruptedActionSchedules(schedules);
        const startupCardStates = options.startup
            ? await this.reconcileStartupCardStateSchedules(schedules)
            : null;
        if (startupCardStates?.schedulesChanged) schedules = await this.loadSchedules();
        this.reconcileCardObservations(schedules, startupCardStates);
        const dependencies = this.createTimerDependencies(this.projectGeneration);

        await reconcileScheduleTimers(schedules, dependencies);
        for (const schedule of schedules) {
            if (schedule.kind !== 'sequence') continue;
            if (schedule.status === 'running') await this.sequenceEngine.activate(schedule.id);
            if (schedule.status === 'pending' && schedule.trigger.type === 'now') await this.fireSchedule(schedule.id);
        }
        for (const scheduleId of startupCardStates?.confirmedScheduleIds ?? []) {
            void this.fireSchedule(scheduleId).catch((error) => this.reportError(error));
        }
    }

    reconcileCardObservations(schedules, startupCardStates = null) {
        const pendingCardScheduleIds = new Set();
        for (const schedule of schedules) {
            if (schedule.status !== 'pending' || schedule.trigger.type !== 'card-state') continue;
            pendingCardScheduleIds.add(schedule.id);
            const current = this.cardObservationsByScheduleId.get(schedule.id);
            const sameTrigger = current
                && current.cardInternalId === schedule.trigger.cardInternalId
                && current.registrationState === schedule.trigger.registrationState
                && current.targetState === schedule.trigger.targetState;
            if (sameTrigger) continue;
            this.cardObservationsByScheduleId.set(schedule.id, {
                cardInternalId: schedule.trigger.cardInternalId,
                registrationState: schedule.trigger.registrationState,
                state: startupCardStates?.statesByScheduleId.get(schedule.id) ?? schedule.trigger.registrationState,
                targetState: schedule.trigger.targetState,
            });
        }
        for (const scheduleId of this.cardObservationsByScheduleId.keys()) {
            if (!pendingCardScheduleIds.has(scheduleId)) this.cardObservationsByScheduleId.delete(scheduleId);
        }
    }

    async reconcileInterruptedActionSchedules(schedules) {
        const interruptedSchedules = schedules.filter((schedule) => schedule.kind === 'action' && schedule.status === 'running');
        for (const schedule of interruptedSchedules) {
            const error = new Error(`Action schedule ${schedule.id} could not recover its interrupted run and was marked failed`);
            this.reportError(error);
            await this.updateScheduleStatus(schedule.id, 'failed');
        }

        return interruptedSchedules.length > 0 ? this.loadSchedules() : schedules;
    }

    async reconcileStartupCardStateSchedules(schedules) {
        const confirmedScheduleIds = [];
        let schedulesChanged = false;
        const statesByScheduleId = new Map();
        const pendingSchedules = schedules.filter((schedule) => (
            schedule.status === 'pending' && schedule.trigger.type === 'card-state'
        ));
        for (const schedule of pendingSchedules) {
            let context;
            try {
                context = await this.resolveCardContext(schedule.trigger.cardInternalId);
            } catch (error) {
                this.reportError(error);
                continue;
            }
            statesByScheduleId.set(schedule.id, context.state);
            const missedTargetTransition = context.state === schedule.trigger.targetState
                && schedule.trigger.registrationState !== schedule.trigger.targetState;
            if (!missedTargetTransition) continue;
            if (!this.confirmCardStateScheduleContinuation) {
                this.reportError(new Error(`Card-state schedule ${schedule.id} requires user confirmation before it can continue`));
                continue;
            }
            const shouldRun = await this.confirmCardStateScheduleContinuation(schedule, context.state);
            if (shouldRun) confirmedScheduleIds.push(schedule.id);
            else {
                await this.updateScheduleStatus(schedule.id, 'cancelled');
                schedulesChanged = true;
            }
        }

        return { confirmedScheduleIds, schedulesChanged, statesByScheduleId };
    }

    createTimerDependencies(generation) {
        return {
            clearTimeout: this.clearTimeout,
            failSchedule: (schedule, failure) => this.failSchedule(schedule, failure, generation),
            fireSchedule: (scheduleId) => this.fireSchedule(scheduleId, generation),
            now: this.now,
            setTimeout: this.setTimeout,
            timers: this.timers,
        };
    }

    async fireSchedule(scheduleId, generation = this.projectGeneration) {
        if (generation !== this.projectGeneration) return;
        const scheduleKey = this.scheduleKey(scheduleId, generation);
        if (this.runningScheduleIds.has(scheduleKey)) return this.scheduleCompletionsByScheduleId.get(scheduleKey);
        const executionContext = {
            actionsFolder: this.requireActionsFolder(),
            activeCardsFolder: this.activeCardsFolder,
            cardTypes: this.cardTypes,
            generation,
            project: this.requireCurrentProject(),
        };
        const executionControl = createScheduleExecutionControl();
        this.scheduleExecutionControls.set(scheduleKey, executionControl);

        const completion = this.executeSchedule(scheduleId, scheduleKey, executionContext, executionControl);
        this.scheduleCompletionsByScheduleId.set(scheduleKey, completion);

        try {
            await completion;
        } finally {
            this.scheduleCompletionsByScheduleId.delete(scheduleKey);
            this.scheduleExecutionControls.delete(scheduleKey);
        }
    }

    async executeSchedule(scheduleId, scheduleKey, executionContext, executionControl) {
        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout);
        this.runningScheduleIds.add(scheduleKey);

        try {
            const schedule = await this.findPendingSchedule(scheduleId, executionContext);
            if (!schedule || executionContext.generation !== this.projectGeneration) return;

            if (schedule.kind === 'sequence') {
                executionControl.resolveStarted(null);
                await this.sequenceEngine.activate(scheduleId);
                return;
            }

            if (executionControl.cancelRequested) {
                executionControl.resolveStarted(null);
                return;
            }
            const runId = allocateActionRunId();
            this.runIdsByScheduleId.set(scheduleKey, runId);
            await this.updateScheduleStatus(scheduleId, 'running', executionContext);
            if (executionContext.generation !== this.projectGeneration || executionControl.cancelRequested) {
                await this.updateScheduleStatus(scheduleId, 'pending', executionContext);
                executionControl.resolveStarted(null);
                return;
            }
            await this.startScheduledAction(schedule, runId, executionContext);
            executionControl.resolveStarted(runId);
            if (executionControl.cancelRequested) this.actionRunnerService.cancel(runId);
            const result = await this.actionRunnerService.wait(runId);
            const status = scheduleStatusFromResult(result.status);
            await this.updateScheduleStatus(scheduleId, status, executionContext);
        } catch {
            executionControl.resolveStarted(null);
            const schedule = await this.findRunningSchedule(scheduleId, executionContext);
            if (schedule) {
                await this.updateScheduleStatus(scheduleId, 'failed', executionContext);
            }
        } finally {
            executionControl.resolveStarted(null);
            this.runIdsByScheduleId.delete(scheduleKey);
            this.runningScheduleIds.delete(scheduleKey);
        }
    }

    async findPendingSchedule(scheduleId, executionContext) {
        const schedules = await this.loadSchedules(executionContext);

        return findPendingSchedule(schedules, scheduleId);
    }

    async failSchedule(schedule, failure, generation) {
        if (generation !== this.projectGeneration) return;
        if (schedule.kind === 'sequence') {
            await this.saveSequence({ ...schedule, failure, status: 'failed' });
            return;
        }
        await this.updateScheduleStatus(schedule.id, 'failed');
    }

    async updateScheduleStatus(scheduleId, status, executionContext = null) {
        await this.mutateSchedules(executionContext, (schedules) => updateActionScheduleStatus(schedules, scheduleId, status));
    }

    async startScheduledAction(schedule, runId, executionContext) {
        const context = schedule.context.cardInternalId
            ? { ...await this.resolveCardContext(schedule.context.cardInternalId, executionContext), kind: schedule.context.kind }
            : schedule.context;
        const request = { actionId: schedule.actionId, context, runInput: {} };
        await this.actionRunnerService.start(request, { interactive: false, runId });
    }

    async resolveCardContext(cardInternalId, executionContext = null) {
        const project = executionContext?.project ?? this.requireCurrentProject();
        const activeCardsFolder = executionContext?.activeCardsFolder ?? this.activeCardsFolder;
        const cardTypes = executionContext?.cardTypes ?? this.cardTypes;
        if (!activeCardsFolder) throw new Error('Action scheduler has no activeCardsFolder');
        const { files } = await this.localGitService.loadProject(project, activeCardsFolder);

        return resolveScheduledCardContext(files, cardTypes, cardInternalId);
    }

    async saveSequence(sequence, executionContext = null) {
        const nextSchedules = await this.mutateSchedules(executionContext, (schedules) => (
            replaceScheduleRecord(schedules, sequence)
        ));

        return nextSchedules.find(({ id }) => id === sequence.id);
    }

    async cancelRunningActionSchedule(scheduleKey) {
        const executionControl = this.scheduleExecutionControls.get(scheduleKey);
        if (executionControl) executionControl.cancelRequested = true;
        const startedRunId = executionControl ? await executionControl.started : null;
        const runId = startedRunId ?? this.runIdsByScheduleId.get(scheduleKey);
        if (!runId) return false;
        try {
            this.actionRunnerService.cancel(runId);
        } catch (error) {
            if (!(error instanceof Error) || !error.message.startsWith('Unknown action run:')) throw error;
        }

        return true;
    }

    async findRunningSchedule(scheduleId, executionContext) {
        const schedules = await this.loadSchedules(executionContext);

        return schedules.find((schedule) => schedule.id === scheduleId && schedule.status === 'running') ?? null;
    }

    requireCurrentProject() {
        return requireProject(this.project);
    }

    requireActionsFolder() {
        if (!this.actionsFolder) throw new Error('Action scheduler has no project');

        return this.actionsFolder;
    }

    scheduleKey(scheduleId, generation = this.projectGeneration) {
        return `${generation}\u0000${scheduleId}`;
    }

    loadSchedules(executionContext = null) {
        const project = executionContext?.project ?? this.requireCurrentProject();
        const actionsFolder = executionContext?.actionsFolder ?? this.requireActionsFolder();

        return this.localGitService.loadActionSchedules(project, actionsFolder);
    }

    mutateSchedules(executionContext, mutation) {
        const project = executionContext?.project ?? this.requireCurrentProject();
        const actionsFolder = executionContext?.actionsFolder ?? this.requireActionsFolder();
        const operation = this.scheduleMutation.then(async () => {
            const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
            const nextSchedules = mutation(schedules);
            await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);

            return nextSchedules;
        });
        this.scheduleMutation = operation.then(() => undefined, () => undefined);

        return operation;
    }

    reportError(error) {
        try {
            this.errorReporter(error);
        } catch {
            // Error reporting must not affect schedule reconciliation.
        }
    }

}

module.exports = { ActionSchedulerService };
