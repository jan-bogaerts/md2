import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionSchedulerService } = require('./action_scheduler_service');
const { ActionRunnerService } = require('./action_runner_service');

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
const context = { file: 'design/F-022.md', kind: 'card', type: 'feature' };
const now = Date.parse('2026-07-06T10:00:00.000Z');
const MAX_TIMER_DELAY_MS = 2147483647;

function createDeferred() {
    let resolveDeferred = () => undefined;
    const promise = new Promise((resolve) => {
        resolveDeferred = resolve;
    });

    return { promise, resolve: resolveDeferred };
}

function summarizeExecutionEvents(executionEvents) {
    return executionEvents.map((event) => ({
        actionId: event.actionId,
        phase: event.phase,
        status: event.status,
        type: event.type,
    }));
}

function createAction(id = 'implement') {
    return {
        content: JSON.stringify({
            command: 'echo done',
            description: `${id} description`,
            id,
            label: id,
            type: 'command',
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
        status: 'pending',
        trigger,
    };
}

function createLocalGitService(initialSchedules, actionFiles = [createAction()], projectConfig = { actionsFolder: 'actions' }) {
    let schedules = initialSchedules;
    const histories = [];

    return {
        appendActionRunHistory: vi.fn(async (_project, request, entry) => {
            histories.push({ entry, request });

            return histories.map((history) => history.entry);
        }),
        cancelActionSchedule: vi.fn(async (_project, _actionsFolder, scheduleId) => {
            schedules = schedules.map((schedule) => {
                if (schedule.id !== scheduleId) return schedule;

                return { ...schedule, status: 'cancelled' };
            });

            return schedules;
        }),
        histories,
        loadActionFiles: vi.fn(async () => actionFiles),
        loadActionSchedules: vi.fn(async () => schedules),
        loadProjectConfig: vi.fn(async () => projectConfig),
        runCommand: vi.fn(async (_project, command) => ({ command, exitCode: 0, stderr: '', stdout: 'done' })),
        saveActionSchedules: vi.fn(async (_project, _actionsFolder, nextSchedules) => {
            schedules = nextSchedules;

            return schedules;
        }),
        schedules: () => schedules,
    };
}

function createScheduler(localGitService, timerDependencies = {}) {
    const actionWorktreeExecutionService = timerDependencies.actionWorktreeExecutionService ?? {
        execute: vi.fn(async (primaryProject, _action, _context, runner) => ({
            ...await runner(primaryProject),
            branch: primaryProject.branch,
            repositoryRoot: primaryProject.rootPath,
        })),
    };
    const configuredAgentRunnerService = timerDependencies.agentRunnerService ?? { run: vi.fn() };
    const agentRunnerService = {
        start: vi.fn(async (executionProject, request, onEvent, onComplete) => {
            void configuredAgentRunnerService.run(executionProject, request, onEvent).then((result) => onComplete(result.exitCode, {conversation: { id: 'agent-1' }, reference: '.md2-agent-logs/one.json', stderr: result.stderr, stdout: result.stdout}));

            return { runId: 'agent-1' };
        }),
        stop: vi.fn(),
    };
    const agentConfigProvider = timerDependencies.agentConfigProvider ?? (() => ({ agent: 'codex', agentProfiles: [], model: '' }));
    const actionRunnerService = timerDependencies.actionRunnerService ?? new ActionRunnerService({
        actionWorktreeExecutionService,
        agentConfigProvider,
        agentRunnerService,
        commandRunner: (executionProject, command) => localGitService.runCommand(executionProject, command),
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
        actionWorktreeExecutionService,
        agentConfigProvider,
        agentRunnerService,
    });
}

describe('ActionSchedulerService', () => {
    it('registers pending timers on project load', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:00:05.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const setTimeout = vi.fn(() => 'timer-1');
        const scheduler = createScheduler(localGitService, { setTimeout });

        await scheduler.startProject(project);

        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('loads schedules and actions from the actions folder inside the configured project folder', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], [createAction()], {
            actionsFolder: 'actions',
            projectFolder: 'projects/demo',
        });
        const scheduler = createScheduler(localGitService);

        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');

        expect(localGitService.loadActionSchedules).toHaveBeenCalledWith(project, 'projects/demo/actions');
        expect(localGitService.loadActionFiles).toHaveBeenCalledWith(project, 'projects/demo/actions');
        expect(localGitService.histories).toEqual([expect.objectContaining({
            entry: expect.objectContaining({ command: 'echo done', output: 'done', status: 'completed' }),
            request: expect.objectContaining({ actionId: 'implement', actionsFolder: 'projects/demo/actions' }),
        })]);
    });

    it('fires a due schedule and marks it done', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const scheduler = createScheduler(localGitService);

        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');

        expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done');
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'completed' }]);
    });

    it('cancels a pending timer and marks the schedule cancelled', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const clearTimeout = vi.fn();
        const scheduler = createScheduler(localGitService, { clearTimeout, setTimeout: vi.fn(() => 'timer-1') });

        await scheduler.startProject(project);
        await scheduler.cancelActionSchedule('schedule-1');

        expect(clearTimeout).toHaveBeenCalledWith('timer-1');
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'cancelled' }]);
    });

    it('registers a future date and time schedule', async () => {
        const localGitService = createLocalGitService([]);
        const setTimeout = vi.fn(() => 'timer-1');
        const scheduler = createScheduler(localGitService, { setTimeout });
        await scheduler.startProject(project);
        const trigger = { timestamp: '2026-07-06T10:00:05.000Z', type: 'at' };

        const schedule = await scheduler.registerActionSchedule({ actionId: 'implement', context, trigger });

        expect(schedule).toMatchObject({ actionId: 'implement', context, status: 'pending', trigger });
        expect(localGitService.schedules()).toEqual([schedule]);
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it.each([
        [{ timestamp: '2026-07-06T10:00:05.000Z', type: 'agentSlot' }, 'Unsupported action schedule trigger'],
        [{ timestamp: 'not-a-date', type: 'at' }, 'Invalid action schedule timestamp'],
        [{ timestamp: '2026-07-06T10:00:00.000Z', type: 'at' }, 'Action schedule timestamp must be in the future'],
    ])('rejects invalid schedule registration %#', async (trigger, message) => {
        const localGitService = createLocalGitService([]);
        const scheduler = createScheduler(localGitService);
        await scheduler.startProject(project);

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
        await scheduler.startProject(project);

        expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), MAX_TIMER_DELAY_MS);
        currentTime += MAX_TIMER_DELAY_MS;
        setTimeout.mock.calls[0][0]();
        expect(setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 5000);

        currentTime = fireAt;
        setTimeout.mock.calls[1][0]();
        await vi.waitFor(() => expect(localGitService.runCommand).toHaveBeenCalledWith(project, 'echo done'));
    });

    it('emits shared action execution events while firing a schedule', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule]);
        const scheduler = createScheduler(localGitService);
        const events = [];

        scheduler.actionRunnerService.subscribe((event) => events.push(event));
        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');

        expect(events.filter((event) => event.type === 'execution').map((event) => event.status)).toEqual(['running', 'completed']);
        expect(events[0]).toMatchObject({ actionId: 'implement', rootActionId: 'implement' });
    });

    it('applies a scheduled action thinking level and records it in history', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], [createAgentAction('implement', { thinkingLevel: 'high' })]);
        const agentRunner = vi.fn(async (_project, request) => successfulAgentResult(request));
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
            agentRunnerService: { run: agentRunner },
        });

        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner).toHaveBeenCalledWith(project, expect.objectContaining({command: ['codex', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort=high', '--search', 'exec', '--json']}), expect.any(Function));
        expect(localGitService.histories[0]).toMatchObject({
            entry: { agent: 'codex', model: 'gpt-5.5', thinkingLevel: 'high' },
            request: { actionId: 'implement', actionsFolder: 'actions', context },
        });
    });

    it('uses none when a scheduled action has no thinking-level override', async () => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], [createAgentAction()]);
        const agentRunner = vi.fn(async (_project, request) => successfulAgentResult(request));
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
            agentRunnerService: { run: agentRunner },
        });

        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner).toHaveBeenCalledWith(project, expect.objectContaining({ command: ['codex', '--model', 'gpt-5.5', '--search', 'exec', '--json'] }), expect.any(Function));
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
            agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
            agentRunnerService: { run: agentRunner },
        });

        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner.mock.calls.map((call) => call[1].command)).toEqual([
            ['codex', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--search', 'exec', '--json'],
            ['codex', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort=high', '--search', 'exec', '--json'],
        ]);
        expect(localGitService.histories.map(({ entry }) => entry.thinkingLevel)).toEqual(['low', 'high']);
    });

    it.each([
        ['invalid', [createAgentAction('implement', { thinkingLevel: 'extreme' })], {agent: 'codex', agentProfiles: [], model: ''}, 'Invalid thinking level'],
        ['unsupported', [createAgentAction('implement', { agent: undefined, model: undefined, thinkingLevel: undefined })], {
            agent: 'custom',
            agentProfiles: [{ command: ['custom-agent'], models: ['fast'], name: 'custom' }],
            model: 'fast',
            thinkingLevel: 'high',
        }, 'Agent profile does not support thinking levels: custom'],
    ])('rejects %s scheduled thinking-level resolution before process start', async (_label, actionFiles, agentConfig, message) => {
        const schedule = createSchedule('schedule-1', 'implement', { timestamp: '2026-07-06T10:01:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([schedule], actionFiles);
        const agentRunner = vi.fn(async (_project, request) => successfulAgentResult(request));
        const scheduler = createScheduler(localGitService, {
            agentConfigProvider: () => agentConfig,
            agentRunnerService: { run: agentRunner },
        });

        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');

        expect(agentRunner).not.toHaveBeenCalled();
        expect(localGitService.histories[0].entry).toMatchObject({ output: expect.stringContaining(message), status: 'failed' });
    });

    it('records invalid actions and continues other schedules', async () => {
        const invalidSchedule = createSchedule('schedule-1', 'missing', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const validSchedule = createSchedule('schedule-2', 'implement', { timestamp: '2026-07-06T09:59:00.000Z', type: 'at' });
        const localGitService = createLocalGitService([invalidSchedule, validSchedule]);
        const scheduler = createScheduler(localGitService);

        await scheduler.startProject(project);
        await scheduler.fireSchedule('schedule-1');
        await scheduler.fireSchedule('schedule-2');

        expect(localGitService.histories[0]).toMatchObject({
            entry: { output: 'Unknown action: missing', status: 'failed' },
            request: { actionId: 'missing', actionsFolder: 'actions', context },
        });
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
            wait: vi.fn(async () => ({ executionId: 'action-1', failure: runnerStatus === 'completed' ? null : 'runner result', status: runnerStatus })),
        };
        const scheduler = createScheduler(localGitService, { actionRunnerService });

        await scheduler.startProject(project);
        await scheduler.fireSchedule(schedule.id);

        expect(localGitService.schedules()).toEqual([{ ...schedule, status: scheduleStatus }]);
    });

    it('delegates running schedule cancellation through shared execution id', async () => {
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
        await scheduler.startProject(project);
        const firing = scheduler.fireSchedule(schedule.id);
        await vi.waitFor(() => expect(actionRunnerService.wait).toHaveBeenCalledWith('action-1'));

        await scheduler.cancelActionSchedule(schedule.id);
        expect(actionRunnerService.cancel).toHaveBeenCalledWith('action-1');

        completion.resolve({ executionId: 'action-1', failure: 'Action cancelled', status: 'cancelled' });
        await firing;
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'cancelled' }]);
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
        await scheduler.startProject(project);
        const events = [];
        scheduler.actionRunnerService.subscribe((event) => events.push(event));
        const request = { actionId: 'main', context, runInput: {} };

        const directExecutionId = await scheduler.actionRunnerService.start(request);
        const directResult = await scheduler.actionRunnerService.wait(directExecutionId);
        const directEvents = events.splice(0);
        await scheduler.fireSchedule(schedule.id);
        const scheduledEvents = events.splice(0);

        expect(summarizeExecutionEvents(scheduledEvents)).toEqual(summarizeExecutionEvents(directEvents));
        expect(directResult.status).toBe('completed');
        expect(localGitService.schedules()).toEqual([{ ...schedule, status: 'completed' }]);
    });
});
