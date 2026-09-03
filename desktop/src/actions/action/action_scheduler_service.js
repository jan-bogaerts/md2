const { loadActionDefinitions } = require('../../../../shared/action_definitions.mjs');
const { appendActionSchedule, findPendingSchedule, updateActionScheduleStatus } = require('../schedule/schedule_store');
const { cancelScheduleTimer, clearScheduleTimers, reconcileScheduleTimers } = require('../schedule/schedule_timers');

const DEFAULT_ACTIONS_FOLDER = 'actions';
const DEFAULT_DIAGRAMS_FOLDER = 'diagrams';
const DEFAULT_DIAGRAM_FOOTER = 'Use the diagram skill as design guidance. Save one version 1 JSON object to {{diagram-file}}; do not create SVG or markup. Use meta { version: 1, type, title, description, and preset for flow }, nodes [{ id, label, role, optional kind, sublabel, tag, drilldown, fields: [{ name, optional type, key }], x, y, width, height }], edges [{ id, from, to, kind, optional label, waypoints: [{ x, y }], fromCardinality, toCardinality }], optional groups [{ id, label, nodeIds }], and optional sequence fragments [{ id, operator: alt|opt|loop, regions: [{ guard, edgeIds }] }]. Set drilldown to false only for non-selectable nodes. Node and edge ids must be unique together. Supported types: architecture, dependency, sequence, flow, entity. Supported roles: focal, backend, store, external, input, optional, boundary. Supported node kinds: component, participant, step, decision, start, end, state, entity; flow nodes require a kind. Supported edge kinds: connection, data, dependency, cycle, call, return, async, success, flow, transition, relationship. Flow preset must be flowchart or state. Entity field keys are primary or foreign; cardinalities are 1, N, 0..1, or 1..*.';
const DEFAULT_PROJECT_FOLDER = '';
const DEFAULT_RELEASES_FOLDER = 'releases';
const DEFAULT_WORKING_FOLDER = 'active';

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
        this.runIdsByScheduleId = new Map();
        this.runningScheduleIds = new Set();
        this.timers = new Map();
    }

    async startProject(project) {
        this.project = requireProject(project);
        const projectPaths = await this.loadProjectPaths();
        const { actionsFolder, activeCardsFolder, diagramFooter, diagramsFolder, projectFolder, releasesFolder } = projectPaths;
        this.actionsFolder = actionsFolder;
        this.projectFolder = projectFolder;
        await this.actionRunnerService.startProject(
            this.project,
            this.actionsFolder,
            this.projectFolder,
            releasesFolder,
            activeCardsFolder,
            diagramsFolder,
            diagramFooter,
        );
        await this.reconcile();
    }

    stop() {
        clearScheduleTimers(this.timers, this.clearTimeout);
        this.runningScheduleIds.clear();
        this.runIdsByScheduleId.clear();
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

        const runId = this.runIdsByScheduleId.get(scheduleId);
        if (runId) {
            this.actionRunnerService.cancel(runId);

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
        const schedules = await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder());

        return findPendingSchedule(schedules, scheduleId);
    }

    async failSchedule(schedule) {
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
        const runId = await this.actionRunnerService.start(request, { interactive: false });
        this.runIdsByScheduleId.set(schedule.id, runId);

        return this.actionRunnerService.wait(runId);
    }

    async findRunningSchedule(scheduleId) {
        const schedules = await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder());

        return schedules.find((schedule) => schedule.id === scheduleId && schedule.status === 'running') ?? null;
    }

    async loadProjectPaths() {
        const config = await this.localGitService.loadProjectConfig(this.requireCurrentProject());
        const projectFolder = typeof config?.projectFolder === 'string' ? config.projectFolder : DEFAULT_PROJECT_FOLDER;
        const configuredReleasesFolder = config?.releasesFolder ?? DEFAULT_RELEASES_FOLDER;
        if (typeof configuredReleasesFolder !== 'string' || configuredReleasesFolder.length === 0) {
            throw new Error('Invalid project releasesFolder');
        }
        const releasesFolder = resolveProjectFolderPath(projectFolder, configuredReleasesFolder);
        const configuredDiagramsFolder = config?.diagramsFolder ?? DEFAULT_DIAGRAMS_FOLDER;
        if (typeof configuredDiagramsFolder !== 'string' || configuredDiagramsFolder.length === 0) {
            throw new Error('Invalid project diagramsFolder');
        }
        const diagramsFolder = resolveProjectFolderPath(projectFolder, configuredDiagramsFolder);
        const diagramFooter = config?.diagramFooter ?? DEFAULT_DIAGRAM_FOOTER;
        if (typeof diagramFooter !== 'string' || diagramFooter.length === 0 || !diagramFooter.includes('{{diagram-file}}')) {
            throw new Error('Invalid project diagramFooter: requires {{diagram-file}} placeholder');
        }
        const configuredWorkingFolder = config?.workingFolder ?? DEFAULT_WORKING_FOLDER;
        if (typeof configuredWorkingFolder !== 'string' || configuredWorkingFolder.length === 0) {
            throw new Error('Invalid project workingFolder');
        }
        const activeCardsFolder = resolveProjectFolderPath(projectFolder, configuredWorkingFolder);
        if (config?.actionsFolder !== undefined) {
            if (typeof config.actionsFolder !== 'string' || config.actionsFolder.length === 0) {
                throw new Error('Invalid project actionsFolder');
            }

            return {
                actionsFolder: resolveProjectFolderPath(projectFolder, config.actionsFolder),
                activeCardsFolder,
                diagramFooter,
                diagramsFolder,
                projectFolder,
                releasesFolder,
            };
        }

        return {
            actionsFolder: resolveProjectFolderPath(projectFolder, DEFAULT_ACTIONS_FOLDER),
            activeCardsFolder,
            diagramFooter,
            diagramsFolder,
            projectFolder,
            releasesFolder,
        };
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

}

module.exports = { ActionSchedulerService, loadActionDefinitions };
