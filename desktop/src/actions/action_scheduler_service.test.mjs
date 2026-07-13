import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { ActionSchedulerService } = require('./action_scheduler_service')

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const context = { file: 'design/F-022.md', kind: 'card', type: 'feature' }
const now = Date.parse('2026-07-06T10:00:00.000Z')

function createAction(name = 'implement') {
    return {
        content: JSON.stringify({
            description: `${name} description`,
            label: name,
            name,
            text: 'echo done',
            type: 'cmd',
        }),
        path: `actions/${name}.json`,
    }
}

function createSchedule(id, actionName, trigger) {
    return {
        actionName,
        context,
        createdAt: '2026-07-06T09:00:00.000Z',
        id,
        status: 'pending',
        trigger,
    }
}

function createLocalGitService(initialSchedules, actionFiles = [createAction()], projectConfig = { actionsFolder: 'actions' }) {
    let schedules = initialSchedules
    const histories = []

    return {
        appendActionRunHistory: vi.fn(async (_project, request, entry) => {
            histories.push({ entry, request })

            return histories.map((history) => history.entry)
        }),
        cancelActionSchedule: vi.fn(async (_project, _actionsFolder, scheduleId) => {
            schedules = schedules.map((schedule) => {
                if (schedule.id !== scheduleId) return schedule

                return { ...schedule, status: 'cancelled' }
            })

            return schedules
        }),
        histories,
        loadActionFiles: vi.fn(async () => actionFiles),
        loadActionSchedules: vi.fn(async () => schedules),
        loadProjectConfig: vi.fn(async () => projectConfig),
        runCommand: vi.fn(async (_project, command) => ({ command, exitCode: 0, stderr: '', stdout: 'done' })),
        saveActionSchedules: vi.fn(async (_project, _actionsFolder, nextSchedules) => {
            schedules = nextSchedules

            return schedules
        }),
        schedules: () => schedules,
    }
}

function createScheduler(localGitService, timerDependencies = {}) {
    return new ActionSchedulerService({
        actionWorktreeExecutionService: {
            execute: vi.fn(async (primaryProject, _action, _context, runner) => ({
                ...await runner(primaryProject),
                branch: primaryProject.branch,
                repositoryRoot: primaryProject.rootPath,
            })),
        },
        agentCommandProvider: () => 'agent-command',
        agentRunnerService: { run: vi.fn() },
        clearTimeout: vi.fn(),
        localGitService,
        now: () => now,
        setTimeout: vi.fn(() => 'timer'),
        ...timerDependencies,
    })
}

describe('ActionSchedulerService', () => {
    it('registers pending timers on project load', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:00:05.000Z', type: 'at' })
        const localGitService = createLocalGitService([schedule])
        const setTimeout = vi.fn(() => 'timer-1')
        const scheduler = createScheduler(localGitService, { setTimeout })

        await scheduler.startProject(project)

        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000)
    })

    it('loads schedules and actions from the actions folder inside the configured project folder', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' })
        const localGitService = createLocalGitService([schedule], [createAction()], {
            actionsFolder: 'actions',
            projectFolder: 'projects/demo',
        })
        const scheduler = createScheduler(localGitService)

        await scheduler.startProject(project)
        await scheduler.fireSchedule('schedule-1')

        expect(localGitService.loadActionSchedules).toHaveBeenCalledWith(project, 'projects/demo/actions')
        expect(localGitService.loadActionFiles).toHaveBeenCalledWith(project, 'projects/demo/actions')
        expect(localGitService.histories).toHaveLength(0)
    })

    it('fires a due schedule and marks it done', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' })
        const localGitService = createLocalGitService([schedule])
        const scheduler = createScheduler(localGitService)

        await scheduler.startProject(project)
        await scheduler.fireSchedule('schedule-1')

        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done')
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'done' }])
    })

    it('cancels a pending timer and marks the schedule cancelled', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' })
        const localGitService = createLocalGitService([schedule])
        const clearTimeout = vi.fn()
        const scheduler = createScheduler(localGitService, { clearTimeout, setTimeout: vi.fn(() => 'timer-1') })

        await scheduler.startProject(project)
        await scheduler.cancelActionSchedule('schedule-1')

        expect(clearTimeout).toHaveBeenCalledWith('timer-1')
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'cancelled' }])
    })

    it('fires afterAction schedules when the named action completes', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { actionName: 'build', type: 'afterAction' })
        const localGitService = createLocalGitService([schedule])
        const scheduler = createScheduler(localGitService)

        await scheduler.startProject(project)
        await scheduler.handleActionCompleted('build')

        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done')
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'done' }])
    })

    it('resolves agentSlot schedules with the configured desktop command', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { type: 'agentSlot' })
        const localGitService = createLocalGitService([schedule])
        const commandRunner = vi.fn(async (command) => ({
            command,
            exitCode: 0,
            stderr: '',
            stdout: '2026-07-06T10:00:05.000Z',
        }))
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => ({ agentSlotCommand: 'configured-slot-command' }),
            commandRunner,
        })

        await scheduler.startProject(project)

        expect(commandRunner).toHaveBeenCalledWith('configured-slot-command', project.rootPath)
    })

    it('uses changed desktop config on the next agentSlot resolution', async () => {
        let agentSlotCommand = 'first-slot-command'
        const localGitService = createLocalGitService([])
        const commandRunner = vi.fn(async (command) => ({
            command,
            exitCode: 0,
            stderr: '',
            stdout: '2026-07-06T10:00:05.000Z',
        }))
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => ({ agentSlotCommand }),
            commandRunner,
        })

        await scheduler.startProject(project)
        await scheduler.registerActionSchedule({ actionName: 'implement', context, trigger: { type: 'agentSlot' } })
        agentSlotCommand = 'second-slot-command'
        await scheduler.registerActionSchedule({ actionName: 'implement', context, trigger: { type: 'agentSlot' } })

        expect(commandRunner).toHaveBeenNthCalledWith(1, 'first-slot-command', project.rootPath)
        expect(commandRunner).toHaveBeenNthCalledWith(2, 'second-slot-command', project.rootPath)
    })

    it('records a config-entry error when agentSlot command is empty', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { type: 'agentSlot' })
        const localGitService = createLocalGitService([schedule])
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => ({ agentSlotCommand: '' }),
        })

        await scheduler.startProject(project)

        expect(localGitService.histories[0]).toMatchObject({
            entry: { output: 'Missing desktop.agentSlotCommand for agentSlot action schedule', status: 'failed' },
            request: { actionName: 'implement', actionsFolder: 'actions', context },
        })
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'done' }])
    })

    it('emits scheduled run events while firing a schedule', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' })
        const localGitService = createLocalGitService([schedule])
        const scheduler = createScheduler(localGitService)
        const events = []

        scheduler.subscribeRunEvents((event) => events.push(event))
        await scheduler.startProject(project)
        await scheduler.fireSchedule('schedule-1')

        expect(events.map((event) => event.type)).toEqual(['started', 'closed'])
        expect(events[0]).toMatchObject({
            conversation: { cardPath: 'design/F-022.md', id: 'schedule-1', status: 'running', title: 'Scheduled implement' },
            runId: 'schedule-1',
        })
    })

    it('records invalid actions and continues other schedules', async () => {
        const invalidSchedule = createSchedule('schedule-1', 'missing', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' })
        const validSchedule = createSchedule('schedule-2', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' })
        const localGitService = createLocalGitService([invalidSchedule, validSchedule])
        const scheduler = createScheduler(localGitService)

        await scheduler.startProject(project)
        await scheduler.fireSchedule('schedule-1')
        await scheduler.fireSchedule('schedule-2')

        expect(localGitService.histories[0]).toMatchObject({
            entry: { output: 'Scheduled action no longer exists: missing', status: 'failed' },
            request: { actionName: 'missing', actionsFolder: 'actions', context },
        })
        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done')
        expect(localGitService.schedules()).toEqual([
            { ...invalidSchedule, status: 'done' },
            { ...validSchedule, status: 'done' },
        ])
    })
})
