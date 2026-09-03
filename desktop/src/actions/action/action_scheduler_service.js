const { normalizeFolderPath } = require('../../../../shared/project_config_defaults.mjs');
const { appendActionSchedule, findPendingSchedule, updateActionScheduleStatus } = require('../schedule/schedule_store');
const { cancelScheduleTimer, clearScheduleTimers, reconcileScheduleTimers } = require('../schedule/schedule_timers');

function createScheduleId() {
    return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function scheduleStatusFromResult(status) {
    if (status === 'completed') return 'completed';
    if (status === 'cancelled') return 'cancelled';

    return 'failed';
}

function validateRegistrationRequest(request, now) {
    if (!request || typeof request !== 'object') throw new Error('Missing action schedule registration request');
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action schedule actionId');
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action schedule context');
    if (!request.trigger || typeof request.trigger !== 'object') throw new Error('Missing action schedule trigger');
    if (request.trigger.type !== 'at') throw new Error(`Unsupported action schedule trigger: ${request.trigger.type}`);
    if (typeof request.trigger.timestamp !== 'string' || request.trigger.timestamp.length === 0) {
        throw new Error('Missing action schedule timestamp');
    }

    const fireAt = Date.parse(request.trigger.timestamp);
    if (Number.isNaN(fireAt)) throw new Error(`Invalid action schedule timestamp: ${request.trigger.timestamp}`);
    if (fireAt <= now) throw new Error('Action schedule timestamp must be in the future');

    return request;
}

function requireProject(project) {
    if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) throw new Error('Missing scheduler project');

    return project;
}

class ActionSchedulerService {
    constructor(dependencies) {
        this.actionRunnerService = dependencies?.actionRunnerService;
        this.clearTimeout = dependencies?.clearTimeout ?? clearTimeout;
        this.localGitService = dependencies?.localGitService;
        this.now = dependencies?.now ?? Date.now;
        this.setTimeout = dependencies?.setTimeout ?? setTimeout;
        this.project = null;
        this.actionsFolder = null;
        this.runIdsByScheduleId = new Map();
        this.runningScheduleIds = new Set();
        this.timers = new Map();
    }

    // The caller resolves the project config and starts the action runner; the scheduler's only
    // project-derived input is the actions folder holding its own schedules file.
    async startProject(project, actionsFolder) {
        if (typeof actionsFolder !== 'string' || actionsFolder.length === 0) throw new Error('Missing scheduler actionsFolder');
        this.project = requireProject(project);
        this.actionsFolder = actionsFolder;
        await this.reconcile();
    }

    stop() {
        clearScheduleTimers(this.timers, this.clearTimeout);
        this.runningScheduleIds.clear();
        this.runIdsByScheduleId.clear();
        this.project = null;
        this.actionsFolder = null;
    }

    async registerActionSchedule(request) {
        const registration = validateRegistrationRequest(request, this.now());
        const project = this.requireCurrentProject();
        const actionsFolder = this.requireActionsFolder();
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
        const schedule = {
            actionId: registration.actionId,
            context: registration.context,
            createdAt: new Date().toISOString(),
            id: createScheduleId(),
            status: 'pending',
            trigger: registration.trigger,
        };
        const nextSchedules = appendActionSchedule(schedules, schedule);
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);
        await this.reconcile();

        return schedule;
    }

    async cancelActionSchedule(scheduleId) {
        if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id');

        const runId = this.runIdsByScheduleId.get(scheduleId);
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

    async reconcile() {
        const schedules = await this.loadSchedulesForReconcile();
        const dependencies = this.createTimerDependencies();

        await reconcileScheduleTimers(schedules, dependencies);
    }

    async loadSchedulesForReconcile() {
        try {
            return await this.loadSchedules();
        } catch {
            return [];
        }
    }

    createTimerDependencies() {
        return {
            clearTimeout: this.clearTimeout,
            failSchedule: (schedule) => this.failSchedule(schedule),
            fireSchedule: (scheduleId) => this.fireSchedule(scheduleId),
            now: this.now,
            setTimeout: this.setTimeout,
            timers: this.timers,
        };
    }

    async fireSchedule(scheduleId) {
        if (this.runningScheduleIds.has(scheduleId)) return;

        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout);
        this.runningScheduleIds.add(scheduleId);

        try {
            const schedule = await this.findPendingSchedule(scheduleId);
            if (!schedule) return;

            await this.updateScheduleStatus(scheduleId, 'running');
            const result = await this.runScheduledAction(schedule);
            const status = scheduleStatusFromResult(result.status);
            await this.updateScheduleStatus(scheduleId, status);
        } catch {
            const schedule = await this.findRunningSchedule(scheduleId);
            if (schedule) {
                await this.updateScheduleStatus(scheduleId, 'failed');
            }
        } finally {
            this.runIdsByScheduleId.delete(scheduleId);
            this.runningScheduleIds.delete(scheduleId);
        }
    }

    async findPendingSchedule(scheduleId) {
        const schedules = await this.loadSchedules();

        return findPendingSchedule(schedules, scheduleId);
    }

    async failSchedule(schedule) {
        await this.updateScheduleStatus(schedule.id, 'failed');
    }

    async updateScheduleStatus(scheduleId, status) {
        const project = this.requireCurrentProject();
        const actionsFolder = this.requireActionsFolder();
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
        const nextSchedules = updateActionScheduleStatus(schedules, scheduleId, status);
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);
    }

    async runScheduledAction(schedule) {
        const request = { actionId: schedule.actionId, context: schedule.context, runInput: {} };
        const runId = await this.actionRunnerService.start(request, { interactive: false });
        this.runIdsByScheduleId.set(schedule.id, runId);

        return this.actionRunnerService.wait(runId);
    }

    async findRunningSchedule(scheduleId) {
        const schedules = await this.loadSchedules();

        return schedules.find((schedule) => schedule.id === scheduleId && schedule.status === 'running') ?? null;
    }

    requireCurrentProject() {
        return requireProject(this.project);
    }

    requireActionsFolder() {
        if (!this.actionsFolder) throw new Error('Action scheduler has no project');

        return this.actionsFolder;
    }

    loadSchedules() {
        return this.localGitService.loadActionSchedules(this.requireCurrentProject(), this.requireActionsFolder());
    }

}

module.exports = { ActionSchedulerService };
