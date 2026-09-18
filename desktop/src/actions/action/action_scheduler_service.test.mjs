import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionSchedulerService } = require('./action_scheduler_service');
const { ActionRunnerService } = require('./action_runner_service');
const { resolveProjectPaths } = require('../../project/project_paths');

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
const context = { cardInternalId: 'card-022', file: 'design/F-022.md', kind: 'card', type: 'feature' };
const now = Date.parse('2026-07-06T10:00:00.000Z');
const MAX_TIMER_DELAY_MS = 2147483647;

function agentConfig(activeAgent = 'codex', model = 'gpt-5.5', agentProfiles = [], thinkingLevel = 'none') {
    return {
        agentProfiles,
        agentSelection: {
            activeAgent,
            permissionMode: 'ask-for-approval',
            settingsByAgent: { [activeAgent]: { model, thinkingLevel } },
        },
    };
}

function createDeferred() {
    let resolveDeferred = () => undefined;
    const promise = new Promise((resolve) => {
        resolveDeferred = resolve;
    });

    return { promise, resolve: resolveDeferred };
}

function summarizeRunEvents(runEvents) {
    return runEvents.map((event) => ({
        actionId: event.actionId,
        phase: event.phase,
        status: event.status,
        type: event.type,
    }));
}

function createAction(id = 'implement', overrides = {}) {
    return {
        content: JSON.stringify({
            command: 'echo done',
            description: `${id} description`,
            id,
            label: id,
            type: 'command',
            ...overrides,
        }),
        path: `actions/${id}.json`,
    };
}

function createAgentAction(id = 'implement', overrides = {}) {
    return {
        content: JSON.stringify({
            agent: 'codex',
            description: `${id} description`,
            id,
            label: id,
            model: 'gpt-5.5',
            prompt: `Run ${id}`,
            type: 'agent',
            ...overrides,
        }),
        path: `actions/${id}.json`,
    };
}

function successfulAgentResult(request) {
    return { command: request.command, exitCode: 0, prompt: request.prompt, stderr: '', stdout: 'done' };
}

function createSchedule(id, actionId, trigger) {
    return {
        actionId,
        context,
        createdAt: '2026-07-06T09:00:00.000Z',
        id,
        kind: 'action',
        status: 'pending',
        trigger,
    };
}

function createLocalGitService(
    initialSchedules,
    actionFiles = [createAction()],
    projectConfig = { actionsFolder: 'actions', states: [{ state: 'ready' }] },
) {
    let schedules = initialSchedules;
    const histories = [];

    return {
        appendAndCommitActionActivity: vi.fn(async (_project, projectFolder, _origin, record) => {
            const request = { actionId: record.rootActionId, context, projectFolder };
            const entry = {
                ...record.details,
                commits: record.commits,
                completedAt: record.completedAt,
                ...(record.rootConversationId ? { rootConversationId: record.rootConversationId } : {}),
                startedAt: record.startedAt,
                status: record.status,
            };
            histories.push({ entry, request });

            return { relativePath: 'design/activity/card__card-022.json' };
        }),
        cancelActionSchedule: vi.fn(async (_project, _actionsFolder, scheduleId) => {
            schedules = schedules.map((schedule) => {
                if (schedule.id !== scheduleId) return schedule;

                return { ...schedule, status: 'cancelled' };
            });

            return schedules;
        }),
        histories,
        loadActionFile: vi.fn(async (_project, actionPath) => actionFiles.find(({ path }) => path === actionPath)),
        loadActionFiles: vi.fn(async () => actionFiles),
        loadActionSchedules: vi.fn(async () => schedules),
        loadFile: vi.fn(async () => ({ content: '# Card', path: context.file })),
        loadProjectConfig: vi.fn(async () => ({ states: [{ state: 'ready' }], ...projectConfig })),
        runCommand: vi.fn(async (_project, command) => ({ command, exitCode: 0, stderr: '', stdout: 'done' })),
        saveActionSchedules: vi.fn(async (_project, _actionsFolder, nextSchedules) => {
            schedules = nextSchedules;

            return schedules;
        }),
        setSchedules: (nextSchedules) => {
            schedules = nextSchedules;
        },
        schedules: () => schedules,
    };
}

function codexSnapshot(limitId, primaryResetsAt, secondaryResetsAt = null) {
    return {
        available: true,
        buckets: [{
            limitId,
            primary: { resetsAt: primaryResetsAt, usedPercent: 10, windowDurationMins: 300 },
            secondary: secondaryResetsAt === null
                ? null
                : { resetsAt: secondaryResetsAt, usedPercent: 20, windowDurationMins: 10080 },
        }],
        observedAt: now,
    };
}

function claudeSnapshot(fiveHourResetsAt, weeklyResetsAt) {
    return {
        available: true,
        observedAt: now,
        windows: [
            { id: 'five_hour', resetsAt: fiveHourResetsAt, usedPercent: 10 },
            { id: 'weekly', resetsAt: weeklyResetsAt, usedPercent: 20 },
        ],
    };
}

function createScheduler(localGitService, timerDependencies = {}) {
    const actionWorktreeRunService = timerDependencies.actionWorktreeRunService ?? {
        execute: vi.fn(async (primaryProject, _action, _context, runner) => ({
            ...await runner(primaryProject),
            branch: primaryProject.branch,
            repositoryRoot: primaryProject.rootPath,
        })),
        runWithCardLock: vi.fn(async (_primaryProject, _context, operation) => operation()),
    };
    const configuredAgentRunnerService = timerDependencies.agentRunnerService ?? { run: vi.fn() };
    const agentRunnerService = {
        start: vi.fn(async (runProject, request, onEvent, onComplete) => {
            void configuredAgentRunnerService.run(runProject, request, onEvent).then((result) => onComplete(result.exitCode, {conversation: { id: 'agent-1' }, reference: 'design/activity/project.json#conversation=agent-1', stderr: result.stderr, stdout: result.stdout}));

            return { runId: 'agent-1' };
        }),
        stop: vi.fn(),
    };
    const agentConfigProvider = timerDependencies.agentConfigProvider ?? (() => agentConfig());
    const actionRunnerService = timerDependencies.actionRunnerService ?? new ActionRunnerService({
        actionWorktreeRunService,
        agentConfigProvider,
        agentRunnerService,
        commandRunner: (runProject, command) => localGitService.runCommand(runProject, command),
        localGitService,
    });

    return new ActionSchedulerService({
        agentCommandProvider: () => 'agent-command',
        clearTimeout: vi.fn(),
        localGitService,
        now: () => now,
        setTimeout: vi.fn(() => 'timer'),
        ...timerDependencies,
        actionRunnerService,
        actionWorktreeRunService,
        agentConfigProvider,
        agentRunnerService,
    });
}

// Mirrors the bridge activation path: one config read, resolved paths, runner first, then scheduler.
async function startProject(scheduler, localGitService) {
    const config = await localGitService.loadProjectConfig(project);
    const paths = resolveProjectPaths(config);
    await scheduler.actionRunnerService.startProject(project, paths, config?.states);
    await scheduler.startProject(project, paths.actionsFolder);
}

describe('ActionSchedulerService', () => {
    it('registers pending timers on project load', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:00:05.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const setTimeout = vi.fn(() => 'timer-1');
        const scheduler = createScheduler(localGitService, { setTimeout });

        await startProject(scheduler, localGitService);

        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    // The bridge registers the project watcher independently of activation, so events can arrive first.
    it('ignores a watcher event that arrives before the project is started', async () => {
        const localGitService = createLocalGitService([]);
        const scheduler = createScheduler(localGitService);

        await expect(scheduler.handleProjectChange({ path: 'design/actions/.md2-schedules.json' })).resolves.toBeUndefined();
        expect(localGitService.loadActionSchedules).not.toHaveBeenCalled();
    });

    it('reconciles when the schedules file changes in the actions folder', async () => {
        const localGitService = createLocalGitService([]);
        const scheduler = createScheduler(localGitService);
        await startProject(scheduler, localGitService);
        localGitService.loadActionSchedules.mockClear();

        await scheduler.handleProjectChange({ path: 'design/actions/.md2-schedules.json' });
        await scheduler.handleProjectChange({ path: 'design/actions/other.json' });

        expect(localGitService.loadActionSchedules).toHaveBeenCalledOnce();
    });

    it('loads schedules and actions from the actions folder inside the configured project folder', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], [createAction('implement', { command: 'echo {{releases-folder}} {{active-cards-folder}}' })], {
            actionsFolder: 'actions',
            projectFolder: 'projects/demo',
            releasesFolder: 'delivery/releases',
            workingFolder: 'feature_descriptions',
        });
        const scheduler = createScheduler(localGitService);

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(localGitService.loadActionSchedules).toHaveBeenCalledWith(project, 'projects/demo/actions');
        expect(localGitService.loadActionFiles).toHaveBeenCalledWith(project, 'projects/demo/actions');
        expect(localGitService.runCommand).toHaveBeenCalledWith(
            project,
            `echo ${path.resolve('C:/repo', 'projects/demo/delivery/releases')} ${path.resolve('C:/repo', 'projects/demo/feature_descriptions')}`,
        );
        expect(localGitService.histories).toEqual([expect.objectContaining({
            entry: expect.objectContaining({
                command: `echo ${path.resolve('C:/repo', 'projects/demo/delivery/releases')} ${path.resolve('C:/repo', 'projects/demo/feature_descriptions')}`,
                output: 'done',
                status: 'completed',
            }),
            request: expect.objectContaining({ actionId: 'implement', projectFolder: 'projects/demo' }),
        })]);
    });

    it('uses default working folder directly under repository when project folder is empty', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService(
            [schedule],
            [createAction('implement', { command: 'echo {{active-cards-folder}}' })],
            { actionsFolder: 'actions', projectFolder: '', releasesFolder: 'releases' },
        );
        const scheduler = createScheduler(localGitService);

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(localGitService.runCommand).toHaveBeenCalledWith(project, `echo ${path.resolve('C:/repo', 'active')}`);
    });

    it('fires a due schedule and marks it done', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const scheduler = createScheduler(localGitService);

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done');
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'completed' }]);
    });

    it('cancels a pending timer and marks the schedule cancelled', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const clearTimeout = vi.fn();
        const scheduler = createScheduler(localGitService, { clearTimeout, setTimeout: vi.fn(() => 'timer-1') });

        await startProject(scheduler, localGitService);
        await scheduler.cancelActionSchedule('schedule-1');

        expect(clearTimeout).toHaveBeenCalledWith('timer-1');
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'cancelled' }]);
    });

    it('lists only pending and running schedules', async () => {
        const pendingSchedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const runningSchedule = { ...createSchedule('schedule-2', 'implement', { timestamp: '2026-07-06T10:02:00.000Z', type: 'at' }), status: 'running' };
        const terminalSchedules = ['cancelled', 'completed', 'failed'].map((status, index) => ({
            ...createSchedule(`schedule-${index + 3}`, 'implement', { timestamp: '2026-07-06T10:03:00.000Z', type: 'at' }),
            status,
        }));
        const localGitService = createLocalGitService([pendingSchedule, runningSchedule, ...terminalSchedules]);
        const scheduler = createScheduler(localGitService);
        await startProject(scheduler, localGitService);

        await expect(scheduler.listActiveSchedules()).resolves.toEqual([pendingSchedule, runningSchedule]);
    });

    it('deletes a pending schedule and its timer', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const clearTimeout = vi.fn();
        const scheduler = createScheduler(localGitService, { clearTimeout });
        await startProject(scheduler, localGitService);

        await expect(scheduler.deleteSchedule(schedule.id)).resolves.toEqual([]);

        expect(clearTimeout).toHaveBeenCalledWith('timer');
        expect(localGitService.schedules()).toEqual([]);
        expect(scheduler.timers.size).toBe(0);
    });

    it('rejects deleting an unknown schedule', async () => {
        const localGitService = createLocalGitService([]);
        const scheduler = createScheduler(localGitService);
        await startProject(scheduler, localGitService);

        await expect(scheduler.deleteSchedule('missing')).rejects.toThrow('Schedule not found: missing');
    });

    it('registers a future date and time schedule', async () => {
        const localGitService = createLocalGitService([]);
        const setTimeout = vi.fn(() => 'timer-1');
        const scheduler = createScheduler(localGitService, { setTimeout });
        await startProject(scheduler, localGitService);
        const trigger = { timestamp: '2026-07-06T10:00:05.000Z', type: 'at' };

        const schedule = await scheduler.registerActionSchedule({ actionId: 'implement', context, trigger });

        expect(schedule).toMatchObject({ actionId: 'implement', context, status: 'pending', trigger });
        expect(localGitService.schedules()).toEqual([schedule]);
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('registers account-reset and card-state schedules from the shared contract', async () => {
        const localGitService = createLocalGitService([]);
        const setTimeout = vi.fn(() => 'timer-1');
        const scheduler = createScheduler(localGitService, { setTimeout });
        await startProject(scheduler, localGitService);
        const accountTrigger = {
            agent: 'codex', expectedResetAt: '2026-07-06T10:00:05.000Z',
            limitId: 'codex,pro', type: 'account-reset', windowId: 'primary',
        };
        const cardTrigger = {cardInternalId: 'card-source', registrationState: 'todo', targetState: 'ready', type: 'card-state'};

        const accountSchedule = await scheduler.registerActionSchedule({ actionId: 'implement', context, trigger: accountTrigger });
        const cardSchedule = await scheduler.registerActionSchedule({ actionId: 'implement', context, trigger: cardTrigger });

        expect(localGitService.schedules()).toEqual([accountSchedule, cardSchedule]);
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('fires only when the configured card later enters its target state', async () => {
        const trigger = {cardInternalId: 'card-source', registrationState: 'todo', targetState: 'ready', type: 'card-state'};
        const schedule = createSchedule('schedule-1', 'implement', trigger);
        const localGitService = createLocalGitService([schedule]);
        const actionRunnerService = {
            cancel: vi.fn(),
            start: vi.fn(async () => 'action-1'),
            startProject: vi.fn(),
            wait: vi.fn(async () => ({ failure: null, runId: 'action-1', status: 'completed' })),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService });
        await startProject(scheduler, localGitService);

        await scheduler.handleCardStateChange('other-card', 'ready');
        await scheduler.handleCardStateChange('card-source', 'todo');
        await scheduler.handleCardStateChange('card-source', 'ready');
        await scheduler.handleCardStateChange('card-source', 'ready');

        expect(actionRunnerService.start).toHaveBeenCalledOnce();
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'completed' }]);
    });

    it('waits for a later transition when the card already has target state at registration', async () => {
        const trigger = {cardInternalId: 'card-source', registrationState: 'ready', targetState: 'ready', type: 'card-state'};
        const schedule = createSchedule('schedule-1', 'implement', trigger);
        const localGitService = createLocalGitService([schedule]);
        const actionRunnerService = {
            cancel: vi.fn(),
            start: vi.fn(async () => 'action-1'),
            startProject: vi.fn(),
            wait: vi.fn(async () => ({ failure: null, runId: 'action-1', status: 'completed' })),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService });
        await startProject(scheduler, localGitService);

        await scheduler.handleCardStateChange('card-source', 'ready');
        expect(actionRunnerService.start).not.toHaveBeenCalled();
        await scheduler.handleCardStateChange('card-source', 'todo');
        await scheduler.handleCardStateChange('card-source', 'ready');

        expect(actionRunnerService.start).toHaveBeenCalledOnce();
    });

    it('fires a due account reset only for the selected agent, limit, and window', async () => {
        let currentTime = now;
        const expectedResetAt = now + 5000;
        const trigger = {
            agent: 'codex', expectedResetAt: new Date(expectedResetAt).toISOString(),
            limitId: 'codex,pro', type: 'account-reset', windowId: 'primary',
        };
        const schedule = createSchedule('schedule-1', 'implement', trigger);
        const localGitService = createLocalGitService([schedule]);
        const actionRunnerService = {
            cancel: vi.fn(),
            start: vi.fn(async () => 'action-1'),
            startProject: vi.fn(),
            wait: vi.fn(async () => ({ failure: null, runId: 'action-1', status: 'completed' })),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService, now: () => currentTime });
        await startProject(scheduler, localGitService);

        await scheduler.handleAccountUsageChange('codex', codexSnapshot('codex,pro', (expectedResetAt + 60000) / 1000));
        expect(actionRunnerService.start).not.toHaveBeenCalled();
        currentTime = expectedResetAt;
        await scheduler.handleAccountUsageChange('claude', claudeSnapshot(expectedResetAt, expectedResetAt));
        await scheduler.handleAccountUsageChange('codex', codexSnapshot('other-limit', expectedResetAt / 1000));
        await scheduler.handleAccountUsageChange('codex', codexSnapshot('codex,pro', null, expectedResetAt / 1000));
        expect(actionRunnerService.start).not.toHaveBeenCalled();
        await scheduler.handleAccountUsageChange('codex', codexSnapshot('codex,pro', expectedResetAt / 1000));

        expect(actionRunnerService.start).toHaveBeenCalledOnce();
    });

    it('keeps persisted account reset deadline when later snapshots estimate another reset', async () => {
        const expectedResetAt = now + 5000;
        const trigger = {
            agent: 'codex', expectedResetAt: new Date(expectedResetAt).toISOString(),
            limitId: 'codex,pro', type: 'account-reset', windowId: 'primary',
        };
        const localGitService = createLocalGitService([createSchedule('schedule-1', 'implement', trigger)]);
        const setTimeout = vi.fn(() => 'timer-1');
        const scheduler = createScheduler(localGitService, { setTimeout });
        await startProject(scheduler, localGitService);

        await scheduler.handleAccountUsageChange('codex', codexSnapshot('codex,pro', (expectedResetAt + 60000) / 1000));

        expect(setTimeout).toHaveBeenCalledOnce();
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
        expect(localGitService.schedules()[0].trigger.expectedResetAt).toBe(new Date(expectedResetAt).toISOString());
    });

    it('fires an overdue persisted account reset from its startup timer once', async () => {
        const trigger = {
            agent: 'claude', expectedResetAt: '2026-07-06T09:59:00.000Z',
            limitId: 'default', type: 'account-reset', windowId: 'weekly',
        };
        const schedule = createSchedule('schedule-1', 'implement', trigger);
        const localGitService = createLocalGitService([schedule]);
        const setTimeout = vi.fn(() => 'timer-1');
        const scheduler = createScheduler(localGitService, { setTimeout });

        await startProject(scheduler, localGitService);
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
        setTimeout.mock.calls[0][0]();
        setTimeout.mock.calls[0][0]();
        await vi.waitFor(() => expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'completed' }]));

        expect(localGitService.runCommand).toHaveBeenCalledOnce();
    });

    it('ignores a card event whose schedule load finishes after a project switch', async () => {
        const trigger = {cardInternalId: 'card-source', registrationState: 'todo', targetState: 'ready', type: 'card-state'};
        const staleSchedule = createSchedule('schedule-old', 'implement', trigger);
        const nextSchedule = createSchedule('schedule-new', 'implement', trigger);
        const delayedSchedules = createDeferred();
        const localGitService = createLocalGitService([staleSchedule]);
        let loadCount = 0;
        localGitService.loadActionSchedules.mockImplementation(async () => {
            loadCount += 1;
            if (loadCount === 1) return [staleSchedule];
            if (loadCount === 2) return delayedSchedules.promise;

            return [nextSchedule];
        });
        const actionRunnerService = {cancel: vi.fn(), start: vi.fn(), startProject: vi.fn(), wait: vi.fn()};
        const scheduler = createScheduler(localGitService, { actionRunnerService });
        await startProject(scheduler, localGitService);

        const staleEvent = scheduler.handleCardStateChange('card-source', 'ready');
        await scheduler.startProject({ branch: 'next', id: 'next', rootPath: 'C:/next' }, 'actions');
        delayedSchedules.resolve([staleSchedule]);
        await staleEvent;

        expect(actionRunnerService.start).not.toHaveBeenCalled();
    });

    it('ignores an account event whose schedule load finishes after a project switch', async () => {
        const trigger = {
            agent: 'codex', expectedResetAt: '2026-07-06T09:59:00.000Z',
            limitId: 'codex,pro', type: 'account-reset', windowId: 'primary',
        };
        const staleSchedule = createSchedule('schedule-old', 'implement', trigger);
        const nextSchedule = createSchedule('schedule-new', 'implement', trigger);
        const delayedSchedules = createDeferred();
        const localGitService = createLocalGitService([staleSchedule]);
        let loadCount = 0;
        localGitService.loadActionSchedules.mockImplementation(async () => {
            loadCount += 1;
            if (loadCount === 1) return [staleSchedule];
            if (loadCount === 2) return delayedSchedules.promise;

            return [nextSchedule];
        });
        const actionRunnerService = {cancel: vi.fn(), start: vi.fn(), startProject: vi.fn(), wait: vi.fn()};
        const scheduler = createScheduler(localGitService, { actionRunnerService });
        await startProject(scheduler, localGitService);

        const staleEvent = scheduler.handleAccountUsageChange('codex', codexSnapshot('codex,pro', (now + 60000) / 1000));
        await scheduler.startProject({ branch: 'next', id: 'next', rootPath: 'C:/next' }, 'actions');
        delayedSchedules.resolve([staleSchedule]);
        await staleEvent;

        expect(actionRunnerService.start).not.toHaveBeenCalled();
    });

    it('shares one execution across concurrent fire attempts', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const completion = createDeferred();
        const actionRunnerService = {
            cancel: vi.fn(),
            start: vi.fn(async () => 'action-1'),
            startProject: vi.fn(),
            wait: vi.fn(async () => completion.promise),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService });
        await startProject(scheduler, localGitService);

        const first = scheduler.fireSchedule(schedule.id);
        const second = scheduler.fireSchedule(schedule.id);
        await vi.waitFor(() => expect(actionRunnerService.start).toHaveBeenCalledOnce());
        completion.resolve({ failure: null, runId: 'action-1', status: 'completed' });
        await Promise.all([first, second]);

        expect(actionRunnerService.start).toHaveBeenCalledOnce();
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'completed' }]);
    });

    it.each([
        [{ timestamp: '2026-07-06T10:00:05.000Z', type: 'agentSlot' }, 'Unsupported action schedule trigger'],
        [{ timestamp: 'not-a-date', type: 'at' }, 'Invalid action schedule timestamp'],
        [{ timestamp: '2026-07-06T10:00:00.000Z', type: 'at' }, 'Action schedule timestamp must be in the future'],
    ])('rejects invalid schedule registration %#', async (trigger, message) => {
        const localGitService = createLocalGitService([]);
        const scheduler = createScheduler(localGitService);
        await startProject(scheduler, localGitService);

        await expect(scheduler.registerActionSchedule({ actionId: 'implement', context, trigger })).rejects.toThrow(message);
        expect(localGitService.saveActionSchedules).not.toHaveBeenCalled();
    });

    it('re-registers long timers until the selected time is due', async () => {
        let currentTime = now;
        const fireAt = now + MAX_TIMER_DELAY_MS + 5000;
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: new Date(fireAt).toISOString(), type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const setTimeout = vi.fn(() => `timer-${setTimeout.mock.calls.length}`);
        const scheduler = createScheduler(localGitService, { now: () => currentTime, setTimeout });
        await startProject(scheduler, localGitService);

        expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), MAX_TIMER_DELAY_MS);
        currentTime += MAX_TIMER_DELAY_MS;
        setTimeout.mock.calls[0][0]();
        expect(setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 5000);

        currentTime = fireAt;
        setTimeout.mock.calls[1][0]();
        await vi.waitFor(() => expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done'));
    });

    it('emits shared action run events while firing a schedule', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const scheduler = createScheduler(localGitService);
        const events = [];

        scheduler.actionRunnerService.subscribe((event) => events.push(event));
        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(events.filter((event) => event.type === 'run').map((event) => event.status)).toEqual(['running', 'completed']);
        expect(events[0]).toMatchObject({ actionId: 'implement', rootActionId: 'implement' });
    });

    it('applies a scheduled action thinking level and records it in history', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], [createAgentAction('implement', { thinkingLevel: 'high' })]);
        const agentRunner = vi.fn(async (_project, request) => successfulAgentResult(request));
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => agentConfig(),
            agentRunnerService: { run: agentRunner },
        });
        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner).toHaveBeenCalledWith(project, expect.objectContaining({
            command: [
                'codex', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write',
                '--ask-for-approval', 'on-request', '--search', 'exec', '--json',
            ],
        }), expect.any(Function));
        expect(localGitService.histories[0]).toMatchObject({
            entry: { agent: 'codex', model: 'gpt-5.5', permissionMode: 'ask-for-approval', thinkingLevel: 'high' },
            request: { actionId: 'implement', context, projectFolder: 'design' },
        });
    });

    it('uses none when a scheduled action has no thinking-level override', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], [createAgentAction()]);
        const agentRunner = vi.fn(async (_project, request) => successfulAgentResult(request));
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => agentConfig(),
            agentRunnerService: { run: agentRunner },
        });

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner).toHaveBeenCalledWith(project, expect.objectContaining({
            command: [
                'codex', '--model', 'gpt-5.5', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request',
                '--search', 'exec', '--json',
            ],
        }), expect.any(Function));
        expect(localGitService.histories[0].entry).toMatchObject({ thinkingLevel: 'none' });
    });

    it('resolves linked scheduled actions from their own thinking levels', async () => {
        const schedule = createSchedule('schedule-1', 'root', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const actionFiles = [
            createAgentAction('root', { onBefore: ['linked'], thinkingLevel: 'high' }),
            createAgentAction('linked', { thinkingLevel: 'low' }),
        ];
        const localGitService = createLocalGitService([schedule], actionFiles);
        const agentRunner = vi.fn(async (_project, request) => successfulAgentResult(request));
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => agentConfig(),
            agentRunnerService: { run: agentRunner },
        });

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner.mock.calls.map((call) => call[1].command)).toEqual([
            ['codex', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '--search', 'exec', '--json'],
            ['codex', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '--search', 'exec', '--json'],
        ]);
        expect(localGitService.histories.map(({ entry }) => entry.thinkingLevel)).toEqual(['high']);
    });

    it.each([
        ['invalid', [createAgentAction('implement', { thinkingLevel: 'extreme' })], agentConfig(), 'Invalid thinking level'],
        ['unsupported', [createAgentAction('implement', { agent: undefined, model: undefined, thinkingLevel: undefined })], {
            agentProfiles: [{ command: ['custom-agent'], models: ['fast'], name: 'custom' }],
            agentSelection: {
                activeAgent: 'custom', permissionMode: 'ask-for-approval',
                settingsByAgent: { custom: { model: 'fast', thinkingLevel: 'high' } },
            },
        }, 'Agent profile does not support thinking levels: custom'],
    ])('rejects %s scheduled thinking-level resolution before process start', async (label, actionFiles, agentConfig) => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], actionFiles);
        const agentRunner = vi.fn(async (_project, request) => successfulAgentResult(request));
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => agentConfig,
            agentRunnerService: { run: agentRunner },
        });

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner).not.toHaveBeenCalled();
        if (label === 'invalid') expect(localGitService.histories).toEqual([]);
        else {
            expect(localGitService.histories).toEqual([expect.objectContaining({entry: expect.objectContaining({status: 'failed', type: 'command'})})]);
        }
    });

    it('rejects invalid actions without a fake run record and continues other schedules', async () => {
        const invalidSchedule = createSchedule('schedule-1', 'missing', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const validSchedule = createSchedule('schedule-2', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([invalidSchedule, validSchedule]);
        const scheduler = createScheduler(localGitService);

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule('schedule-1');
        await scheduler.fireSchedule('schedule-2');

        expect(localGitService.histories).toHaveLength(1);
        expect(localGitService.histories[0]).toMatchObject({ entry: { command: 'echo done', status: 'completed', type: 'command' } });
        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done');
        expect(localGitService.schedules()).toEqual([
            { ...invalidSchedule, status: 'failed' },
            { ...validSchedule, status: 'completed' },
        ]);
    });

    it.each([
        ['completed', 'completed'],
        ['failed', 'failed'],
        ['okButNotAfter', 'failed'],
        ['cancelled', 'cancelled'],
    ])('maps runner %s result to %s schedule state', async (runnerStatus, scheduleStatus) => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const actionRunnerService = {
            cancel: vi.fn(),
            start: vi.fn(async () => 'action-1'),
            startProject: vi.fn(),
            wait: vi.fn(async () => ({ runId: 'action-1', failure: runnerStatus === 'completed' ? null : 'runner result', status: runnerStatus })),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService });

        await startProject(scheduler, localGitService);
        await scheduler.fireSchedule(schedule.id);

        expect(localGitService.schedules()).toEqual([{ ...schedule, status: scheduleStatus }]);
    });

    it('delegates running schedule cancellation through shared run id', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const completion = createDeferred();
        const actionRunnerService = {
            cancel: vi.fn(),
            start: vi.fn(async () => 'action-1'),
            startProject: vi.fn(),
            wait: vi.fn(async () => completion.promise),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService });
        await startProject(scheduler, localGitService);
        const firing = scheduler.fireSchedule(schedule.id);
        await vi.waitFor(() => expect(actionRunnerService.wait).toHaveBeenCalledWith('action-1'));

        await scheduler.cancelActionSchedule(schedule.id);
        expect(actionRunnerService.cancel).toHaveBeenCalledWith('action-1');

        completion.resolve({ runId: 'action-1', failure: 'Action cancelled', status: 'cancelled' });
        await firing;
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'cancelled' }]);
    });

    it('cancels and awaits a running schedule before deleting it', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const completion = createDeferred();
        const actionRunnerService = {
            cancel: vi.fn(),
            start: vi.fn(async () => 'action-1'),
            startProject: vi.fn(),
            wait: vi.fn(async () => completion.promise),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService });
        await startProject(scheduler, localGitService);
        const firing = scheduler.fireSchedule(schedule.id);
        await vi.waitFor(() => expect(actionRunnerService.wait).toHaveBeenCalledWith('action-1'));

        const deletion = scheduler.deleteSchedule(schedule.id);
        await vi.waitFor(() => expect(actionRunnerService.cancel).toHaveBeenCalledWith('action-1'));
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'running' }]);

        completion.resolve({ runId: 'action-1', failure: 'Action cancelled', status: 'cancelled' });
        await firing;
        await expect(deletion).resolves.toEqual([]);
        expect(localGitService.schedules()).toEqual([]);
        expect(scheduler.runIdsByScheduleId.size).toBe(0);
        expect(scheduler.scheduleCompletionsByScheduleId.size).toBe(0);
        expect(scheduler.timers.size).toBe(0);
    });

    it('produces same phase ordering and result for direct and scheduled entry points', async () => {
        const schedule = createSchedule('schedule-1', 'main', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const actionFiles = [
            createAction('before'),
            {
                content: JSON.stringify({
                    command: 'main', description: 'main description', id: 'main', label: 'main',
                    on: [{ actionId: 'matched', condition: 'done' }], onAfter: ['after'], onBefore: ['before'], type: 'command',
                }),
                path: 'actions/main.json',
            },
            createAction('matched'),
            createAction('after'),
        ];
        const localGitService = createLocalGitService([schedule], actionFiles);
        const scheduler = createScheduler(localGitService);
        await startProject(scheduler, localGitService);
        const events = [];
        scheduler.actionRunnerService.subscribe((event) => events.push(event));
        const request = { actionId: 'main', context, runInput: {} };

        const directRunId = await scheduler.actionRunnerService.start(request);
        const directResult = await scheduler.actionRunnerService.wait(directRunId);
        const directEvents = events.splice(0);
        await scheduler.fireSchedule(schedule.id);
        const scheduledEvents = events.splice(0);

        expect(summarizeRunEvents(scheduledEvents)).toEqual(summarizeRunEvents(directEvents));
        expect(directResult.status).toBe('completed');
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'completed' }]);
    });
});
