const { loadActionDefinitions } = require('../../../../shared/action_definitions.mjs');
const { appendActionSchedule, findPendingSchedule, updateActionScheduleStatus } = require('../schedule/schedule_store');
const { cancelScheduleTimer, clearScheduleTimers, reconcileScheduleTimers } = require('../schedule/schedule_timers');

const DEFAULT_ACTIONS_FOLDER = 'actions';
const DEFAULT_PROJECT_FOLDER = '';
const DEFAULT_RELEASES_FOLDER = 'releases';

function createScheduleId() {
    return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFailureEntry(message) {
    const completedAt = new Date().toISOString();

    return { completedAt, output: message, prompt: '', status: 'failed' };
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

function normalizeFolderPath(folderPath) {
    return folderPath.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
}

function resolveProjectFolderPath(projectFolder, folderPath) {
    const normalizedProjectFolder = normalizeFolderPath(projectFolder);
    const normalizedFolderPath = normalizeFolderPath(folderPath);

    return normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/${normalizedFolderPath}` : normalizedFolderPath;
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
        this.projectFolder = null;
        this.executionIdsByScheduleId = new Map();
        this.runningScheduleIds = new Set();
        this.timers = new Map();
    }

    async startProject(project) {
        this.project = requireProject(project);
        const { actionsFolder, projectFolder, releasesFolder } = await this.loadProjectPaths();
        this.actionsFolder = actionsFolder;
        this.projectFolder = projectFolder;
        await this.actionRunnerService.startProject(this.project, this.actionsFolder, this.projectFolder, releasesFolder);
        await this.reconcile();
    }

    stop() {
        clearScheduleTimers(this.timers, this.clearTimeout);
        this.runningScheduleIds.clear();
        this.executionIdsByScheduleId.clear();
        this.project = null;
        this.actionsFolder = null;
        this.projectFolder = null;
    }

    async registerActionSchedule(request) {
        const registration = validateRegistrationRequest(request, this.now());
        const project = this.requireCurrentProject();
        const actionsFolder = await this.requireActionsFolder();
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

        const executionId = this.executionIdsByScheduleId.get(scheduleId);
        if (executionId) {
            this.actionRunnerService.cancel(executionId);

            return this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder());
        }

        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout);

        const schedules = await this.localGitService.cancelActionSchedule(
            this.requireCurrentProject(),
            await this.requireActionsFolder(),
            scheduleId,
        );
        await this.reconcile();

        return schedules;
    }

    async handleProjectChange(event) {
        const actionsFolder = await this.requireActionsFolder();
        const normalizedActionsFolder = actionsFolder.replace(/\\/gu, '/').replace(/\/$/u, '');
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
            return await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder());
        } catch (error) {
            await this.recordSchedulerFailure(null, error instanceof Error ? error.message : 'Action schedule load failed');

            return [];
        }
    }

    createTimerDependencies() {
        return {
            clearTimeout: this.clearTimeout,
            failSchedule: (schedule, message) => this.failSchedule(schedule, message),
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
        } catch (error) {
            const schedule = await this.findRunningSchedule(scheduleId);
            if (schedule) {
                await this.recordSchedulerFailure(schedule, error instanceof Error ? error.message : 'Scheduled action failed');
                await this.updateScheduleStatus(scheduleId, 'failed');
            }
        } finally {
            this.executionIdsByScheduleId.delete(scheduleId);
            this.runningScheduleIds.delete(scheduleId);
        }
    }

    async findPendingSchedule(scheduleId) {
        const schedules = await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder());

        return findPendingSchedule(schedules, scheduleId);
    }

    async failSchedule(schedule, message) {
        await this.recordSchedulerFailure(schedule, message);
        await this.updateScheduleStatus(schedule.id, 'failed');
    }

    async updateScheduleStatus(scheduleId, status) {
        const project = this.requireCurrentProject();
        const actionsFolder = await this.requireActionsFolder();
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder);
        const nextSchedules = updateActionScheduleStatus(schedules, scheduleId, status);
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules);
    }

    async runScheduledAction(schedule) {
        const request = { actionId: schedule.actionId, context: schedule.context, runInput: {} };
        const executionId = await this.actionRunnerService.start(request, { interactive: false });
        this.executionIdsByScheduleId.set(schedule.id, executionId);

        return this.actionRunnerService.wait(executionId);
    }

    async findRunningSchedule(scheduleId) {
        const schedules = await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder());

        return schedules.find((schedule) => schedule.id === scheduleId && schedule.status === 'running') ?? null;
    }

    async recordSchedulerFailure(schedule, message) {
        if (!schedule) return;

        const project = this.requireCurrentProject();
        const projectFolder = await this.requireProjectFolder();
        const completedAt = new Date(this.now()).toISOString();
        const origin = schedule.context.kind === 'card' || schedule.context.kind === 'file'
            ? { cardInternalId: schedule.context.cardInternalId, kind: 'card' }
            : { kind: 'project' };
        if (origin.kind === 'card' && (typeof origin.cardInternalId !== 'string' || origin.cardInternalId.length === 0)) {
            throw new Error('Scheduled card activity requires cardInternalId');
        }
        const entry = createFailureEntry(message);
        const record = {
            commits: [],
            completedAt,
            conversationIds: [],
            executionId: `schedule-${schedule.id}`,
            history: entry,
            origin,
            rootActionId: schedule.actionId,
            rootActionLabel: schedule.actionId,
            startedAt: completedAt,
            status: 'failed',
        };
        await this.localGitService.appendAndCommitActionActivity(
            project,
            projectFolder,
            origin,
            record,
            `Record ${schedule.actionId} activity`,
        );
    }

    async loadProjectPaths() {
        const config = await this.localGitService.loadProjectConfig(this.requireCurrentProject());
        const projectFolder = typeof config?.projectFolder === 'string' ? config.projectFolder : DEFAULT_PROJECT_FOLDER;
        const configuredReleasesFolder = config?.releasesFolder ?? DEFAULT_RELEASES_FOLDER;
        if (typeof configuredReleasesFolder !== 'string' || configuredReleasesFolder.length === 0) {
            throw new Error('Invalid project releasesFolder');
        }
        const releasesFolder = resolveProjectFolderPath(projectFolder, configuredReleasesFolder);
        if (config?.actionsFolder !== undefined) {
            if (typeof config.actionsFolder !== 'string' || config.actionsFolder.length === 0) {
                throw new Error('Invalid project actionsFolder');
            }

            return { actionsFolder: resolveProjectFolderPath(projectFolder, config.actionsFolder), projectFolder, releasesFolder };
        }

        return { actionsFolder: resolveProjectFolderPath(projectFolder, DEFAULT_ACTIONS_FOLDER), projectFolder, releasesFolder };
    }

    requireCurrentProject() {
        return requireProject(this.project);
    }

    async requireActionsFolder() {
        if (this.actionsFolder) return this.actionsFolder;

        const { actionsFolder, projectFolder } = await this.loadProjectPaths();
        this.actionsFolder = actionsFolder;
        this.projectFolder = projectFolder;

        return this.actionsFolder;
    }

    async requireProjectFolder() {
        if (this.projectFolder !== null) return this.projectFolder;

        const { actionsFolder, projectFolder } = await this.loadProjectPaths();
        this.actionsFolder = actionsFolder;
        this.projectFolder = projectFolder;

        return this.projectFolder;
    }
}

module.exports = { ActionSchedulerService, loadActionDefinitions };
