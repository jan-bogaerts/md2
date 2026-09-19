const { normalizeFolderPath } = require('../../../../shared/project_config_defaults.mjs');
const {
    activeSchedules,
    appendActionSchedule,
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
        await this.reconcile();
    }

    stop() {
        this.clearProjectState();
        for (const unsubscribe of this.accountUsageUnsubscribers) unsubscribe();
        this.accountUsageUnsubscribers = [];
        this.runningScheduleIds.clear();
        this.runIdsByScheduleId.clear();
        this.scheduleCompletionsByScheduleId.clear();
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
        const project = this.requireCurrentProject();
        const actionsFolder = this.requireActionsFolder();
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
        const schedule = {
            actionId: registration.actionId,
            context: registration.context,
            createdAt: new Date(this.now()).toISOString(),
            id: createScheduleId(),
            kind: 'action',
            status: 'pending',
            trigger: registration.trigger,
        };
        const nextSchedules = appendActionSchedule(schedules, schedule);
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);
        await this.reconcile();

        return schedule;
    }

    async registerSequenceSchedule(request) {
        const registration = validateSequenceRegistrationRequest(request);
        const project = this.requireCurrentProject();
        const actionsFolder = this.requireActionsFolder();
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
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
        const nextSchedules = appendActionSchedule(schedules, schedule);
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);
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
        const runId = this.runIdsByScheduleId.get(scheduleKey);
        if (runId) this.actionRunnerService.cancel(runId);
        const completion = this.scheduleCompletionsByScheduleId.get(scheduleKey);
        if (completion) await completion;

        const currentSchedules = await this.loadSchedules();
        const nextSchedules = deleteScheduleRecord(currentSchedules, scheduleId);
        await this.localGitService.saveActionSchedules(
            this.requireCurrentProject(),
            this.requireActionsFolder(),
            nextSchedules,
        );
        await this.reconcile();

        return nextSchedules;
    }

    async cancelActionSchedule(scheduleId) {
        if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id');

        const runId = this.runIdsByScheduleId.get(this.scheduleKey(scheduleId));
        if (runId) {
            this.actionRunnerService.cancel(runId);

            return this.loadSchedules();
        }

        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout);

        const schedules = await this.localGitService.cancelActionSchedule(
            this.requireCurrentProject(),
            this.requireActionsFolder(),
            scheduleId,
        );
        await this.reconcile();

        return schedules;
    }

    async handleProjectChange(event) {
        // The bridge registers the project watcher independently of activation, so an event can
        // arrive before startProject; there is nothing to reconcile until then.
        if (this.actionsFolder === null) return;

        const normalizedActionsFolder = normalizeFolderPath(this.actionsFolder);
        if (!event || event.path !== `${normalizedActionsFolder}/.md2-schedules.json`) return;

        await this.reconcile();
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

    async reconcile() {
        const schedules = await this.loadSchedulesForReconcile();
        this.reconcileCardObservations(schedules);
        const dependencies = this.createTimerDependencies(this.projectGeneration);

        await reconcileScheduleTimers(schedules, dependencies);
        for (const schedule of schedules) {
            if (schedule.kind !== 'sequence') continue;
            if (schedule.status === 'running') await this.sequenceEngine.activate(schedule.id);
            if (schedule.status === 'pending' && schedule.trigger.type === 'now') await this.fireSchedule(schedule.id);
        }
    }

    reconcileCardObservations(schedules) {
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
                state: schedule.trigger.registrationState,
                targetState: schedule.trigger.targetState,
            });
        }
        for (const scheduleId of this.cardObservationsByScheduleId.keys()) {
            if (!pendingCardScheduleIds.has(scheduleId)) this.cardObservationsByScheduleId.delete(scheduleId);
        }
    }

    async loadSchedulesForReconcile() {
        try {
            return await this.loadSchedules();
        } catch {
            return [];
        }
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
            generation,
            project: this.requireCurrentProject(),
        };

        const completion = this.executeSchedule(scheduleId, scheduleKey, executionContext);
        this.scheduleCompletionsByScheduleId.set(scheduleKey, completion);

        try {
            await completion;
        } finally {
            this.scheduleCompletionsByScheduleId.delete(scheduleKey);
        }
    }

    async executeSchedule(scheduleId, scheduleKey, executionContext) {
        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout);
        this.runningScheduleIds.add(scheduleKey);

        try {
            const schedule = await this.findPendingSchedule(scheduleId, executionContext);
            if (!schedule || executionContext.generation !== this.projectGeneration) return;

            if (schedule.kind === 'sequence') {
                await this.sequenceEngine.activate(scheduleId);
                return;
            }

            await this.updateScheduleStatus(scheduleId, 'running', executionContext);
            if (executionContext.generation !== this.projectGeneration) {
                await this.updateScheduleStatus(scheduleId, 'pending', executionContext);
                return;
            }
            const result = await this.runScheduledAction(schedule, scheduleKey);
            const status = scheduleStatusFromResult(result.status);
            await this.updateScheduleStatus(scheduleId, status, executionContext);
        } catch {
            const schedule = await this.findRunningSchedule(scheduleId, executionContext);
            if (schedule) {
                await this.updateScheduleStatus(scheduleId, 'failed', executionContext);
            }
        } finally {
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
        const project = executionContext?.project ?? this.requireCurrentProject();
        const actionsFolder = executionContext?.actionsFolder ?? this.requireActionsFolder();
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
        const nextSchedules = updateActionScheduleStatus(schedules, scheduleId, status);
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);
    }

    async runScheduledAction(schedule, scheduleKey) {
        const request = { actionId: schedule.actionId, context: schedule.context, runInput: {} };
        const runId = await this.actionRunnerService.start(request, { interactive: false });
        this.runIdsByScheduleId.set(scheduleKey, runId);

        return this.actionRunnerService.wait(runId);
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
        const project = executionContext?.project ?? this.requireCurrentProject();
        const actionsFolder = executionContext?.actionsFolder ?? this.requireActionsFolder();
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
        const nextSchedules = replaceScheduleRecord(schedules, sequence);
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);

        return nextSchedules.find(({ id }) => id === sequence.id);
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

}

module.exports = { ActionSchedulerService };
