const { exec } = require('node:child_process')
const { promisify } = require('node:util')
const { loadActionDefinitions } = require('../../../shared/action_definitions.mjs')
const { appendActionSchedule, findPendingSchedule, pendingAfterActionSchedules, updateActionScheduleStatus } = require('./schedule_store')
const { cancelScheduleTimer, clearScheduleTimers, reconcileScheduleTimers } = require('./schedule_timers')

const execAsync = promisify(exec)
const DEFAULT_ACTIONS_FOLDER = 'actions'
const DEFAULT_PROJECT_FOLDER = ''

function createScheduleId() {
    return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createFailureEntry(message) {
    const completedAt = new Date().toISOString()

    return { completedAt, output: message, prompt: '', status: 'failed' }
}

function scheduleStatusFromResult(status) {
    if (status === 'completed') return 'completed'
    if (status === 'cancelled') return 'cancelled'

    return 'failed'
}

function validateRegistrationRequest(request) {
    if (!request || typeof request !== 'object') throw new Error('Missing action schedule registration request')
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing action schedule actionId')
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action schedule context')
    if (!request.trigger || typeof request.trigger !== 'object') throw new Error('Missing action schedule trigger')

    return request
}

function requireProject(project) {
    if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) throw new Error('Missing scheduler project')

    return project
}

function defaultAgentSlotCommandProvider(agentConfigProvider) {
    const config = agentConfigProvider ? agentConfigProvider() : null

    return config?.agentSlotCommand ?? ''
}

function normalizeFolderPath(folderPath) {
    return folderPath.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

function resolveProjectFolderPath(projectFolder, folderPath) {
    const normalizedProjectFolder = normalizeFolderPath(projectFolder)
    const normalizedFolderPath = normalizeFolderPath(folderPath)

    return normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/${normalizedFolderPath}` : normalizedFolderPath
}

async function defaultCommandRunner(command, rootPath) {
    try {
        const { stderr, stdout } = await execAsync(command, { cwd: rootPath })

        return { command, exitCode: 0, stderr, stdout }
    } catch (error) {
        if (!error || typeof error !== 'object') throw error

        return { command, exitCode: typeof error.code === 'number' ? error.code : 1, stderr: typeof error.stderr === 'string' ? error.stderr : '', stdout: typeof error.stdout === 'string' ? error.stdout : '' }
    }
}

class ActionSchedulerService {
    constructor(dependencies) {
        this.actionRunnerService = dependencies?.actionRunnerService
        this.agentConfigProvider = dependencies?.agentConfigProvider ?? null
        this.agentSlotCommandProvider = dependencies?.agentSlotCommandProvider
            ?? (() => defaultAgentSlotCommandProvider(this.agentConfigProvider))
        this.clearTimeout = dependencies?.clearTimeout ?? clearTimeout
        this.commandRunner = dependencies?.commandRunner ?? defaultCommandRunner
        this.localGitService = dependencies?.localGitService
        this.now = dependencies?.now ?? Date.now
        this.setTimeout = dependencies?.setTimeout ?? setTimeout
        this.project = null
        this.actionsFolder = null
        this.executionIdsByScheduleId = new Map()
        this.runningScheduleIds = new Set()
        this.timers = new Map()
    }

    async startProject(project) {
        this.project = requireProject(project)
        this.actionsFolder = await this.loadActionsFolder()
        this.actionRunnerService.startProject(this.project, this.actionsFolder)
        await this.reconcile()
    }

    stop() {
        clearScheduleTimers(this.timers, this.clearTimeout)
        this.runningScheduleIds.clear()
        this.executionIdsByScheduleId.clear()
        this.project = null
        this.actionsFolder = null
    }

    async registerActionSchedule(request) {
        const registration = validateRegistrationRequest(request)
        const project = this.requireCurrentProject()
        const actionsFolder = await this.requireActionsFolder()
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder)
        const schedule = {
            actionId: registration.actionId,
            context: registration.context,
            createdAt: new Date().toISOString(),
            id: createScheduleId(),
            status: 'pending',
            trigger: registration.trigger,
        }
        const nextSchedules = appendActionSchedule(schedules, schedule)
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules)
        await this.reconcile()

        return schedule
    }

    async cancelActionSchedule(scheduleId) {
        if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id')

        const executionId = this.executionIdsByScheduleId.get(scheduleId)
        if (executionId) {
            this.actionRunnerService.cancel(executionId)

            return this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder())
        }

        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout)

        const schedules = await this.localGitService.cancelActionSchedule(
            this.requireCurrentProject(),
            await this.requireActionsFolder(),
            scheduleId,
        )
        await this.reconcile()

        return schedules
    }

    async handleProjectChange(event) {
        const actionsFolder = await this.requireActionsFolder()
        const normalizedActionsFolder = actionsFolder.replace(/\\/gu, '/').replace(/\/$/u, '')
        if (!event || event.path !== `${normalizedActionsFolder}/.md2-schedules.json`) return

        await this.reconcile()
    }

    async handleActionCompleted(actionId) {
        if (typeof actionId !== 'string' || actionId.length === 0) throw new Error('Missing completed action id')

        const schedules = await this.loadSchedulesForReconcile()
        const matchingSchedules = pendingAfterActionSchedules(schedules, actionId)

        for (const schedule of matchingSchedules) await this.fireSchedule(schedule.id)
    }

    async reconcile() {
        const schedules = await this.loadSchedulesForReconcile()
        const dependencies = this.createTimerDependencies()

        await reconcileScheduleTimers(schedules, dependencies)
    }

    async loadSchedulesForReconcile() {
        try {
            return await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder())
        } catch (error) {
            await this.recordSchedulerFailure(null, error instanceof Error ? error.message : 'Action schedule load failed')

            return []
        }
    }

    createTimerDependencies() {
        return {
            agentSlotCommandProvider: this.agentSlotCommandProvider,
            clearTimeout: this.clearTimeout,
            commandRunner: this.commandRunner,
            failSchedule: (schedule, message) => this.failSchedule(schedule, message),
            fireSchedule: (scheduleId) => this.fireSchedule(scheduleId),
            now: this.now,
            rootPath: this.requireCurrentProject().rootPath,
            setTimeout: this.setTimeout,
            timers: this.timers,
        }
    }

    async fireSchedule(scheduleId) {
        if (this.runningScheduleIds.has(scheduleId)) return

        cancelScheduleTimer(this.timers, scheduleId, this.clearTimeout)
        this.runningScheduleIds.add(scheduleId)

        try {
            const schedule = await this.findPendingSchedule(scheduleId)
            if (!schedule) return

            await this.updateScheduleStatus(scheduleId, 'running')
            const result = await this.runScheduledAction(schedule)
            const status = scheduleStatusFromResult(result.status)
            if (status === 'failed') await this.recordSchedulerFailure(schedule, result.failure ?? 'Scheduled action failed')
            await this.updateScheduleStatus(scheduleId, status)
        } catch (error) {
            const schedule = await this.findRunningSchedule(scheduleId)
            if (schedule) {
                await this.recordSchedulerFailure(schedule, error instanceof Error ? error.message : 'Scheduled action failed')
                await this.updateScheduleStatus(scheduleId, 'failed')
            }
        } finally {
            this.executionIdsByScheduleId.delete(scheduleId)
            this.runningScheduleIds.delete(scheduleId)
        }
    }

    async findPendingSchedule(scheduleId) {
        const schedules = await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder())

        return findPendingSchedule(schedules, scheduleId)
    }

    async failSchedule(schedule, message) {
        await this.recordSchedulerFailure(schedule, message)
        await this.updateScheduleStatus(schedule.id, 'failed')
    }

    async updateScheduleStatus(scheduleId, status) {
        const project = this.requireCurrentProject()
        const actionsFolder = await this.requireActionsFolder()
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder)
        const nextSchedules = updateActionScheduleStatus(schedules, scheduleId, status)
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules)
    }

    async runScheduledAction(schedule) {
        const request = { actionId: schedule.actionId, context: schedule.context, runInput: {} }
        const executionId = await this.actionRunnerService.start(request)
        this.executionIdsByScheduleId.set(schedule.id, executionId)

        return this.actionRunnerService.wait(executionId)
    }

    async findRunningSchedule(scheduleId) {
        const schedules = await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder())

        return schedules.find((schedule) => schedule.id === scheduleId && schedule.status === 'running') ?? null
    }

    async recordSchedulerFailure(schedule, message) {
        if (!schedule) return

        const entry = createFailureEntry(message)
        await this.appendHistory(schedule.actionId, schedule.context, entry)
    }

    async appendHistory(actionId, context, entry, project = this.requireCurrentProject()) {
        const request = { actionId, actionsFolder: await this.requireActionsFolder(), context }
        await this.localGitService.appendActionRunHistory(project, request, entry)
    }

    async loadActionsFolder() {
        const config = await this.localGitService.loadProjectConfig(this.requireCurrentProject())
        const projectFolder = typeof config?.projectFolder === 'string' ? config.projectFolder : DEFAULT_PROJECT_FOLDER
        if (config?.actionsFolder !== undefined) {
            if (typeof config.actionsFolder !== 'string' || config.actionsFolder.length === 0) {
                throw new Error('Invalid project actionsFolder')
            }

            return resolveProjectFolderPath(projectFolder, config.actionsFolder)
        }

        return resolveProjectFolderPath(projectFolder, DEFAULT_ACTIONS_FOLDER)
    }

    requireCurrentProject() {
        return requireProject(this.project)
    }

    async requireActionsFolder() {
        if (this.actionsFolder) return this.actionsFolder

        this.actionsFolder = await this.loadActionsFolder()

        return this.actionsFolder
    }
}

module.exports = { ActionSchedulerService, loadActionDefinitions }
