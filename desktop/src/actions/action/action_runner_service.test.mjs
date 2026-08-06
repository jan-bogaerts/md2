import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionRunnerService } = require('./action_runner_service');

const context = { cardInternalId: 'card-010', file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' };
const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

function actionFile(id, overrides = {}) {
    return {
        content: JSON.stringify({
            command: id,
            description: `${id} description`,
            id,
            label: id,
            type: 'command',
            ...overrides,
        }),
        path: `actions/${id}.json`,
    };
}

function createRunner(actionFiles = [actionFile('main')], overrides = {}) {
    const appendActionRunHistory = vi.fn(async () => []);
    const localGitService = {
        appendAndCommitActionActivity: vi.fn(async (_project, projectFolder, _origin, record) => {
            const entry = {
                ...record.details,
                completedAt: record.completedAt,
                ...(record.rootConversationId ? { rootConversationId: record.rootConversationId } : {}),
                startedAt: record.startedAt,
                status: record.status,
            };
            await appendActionRunHistory(project, { actionId: record.rootActionId, context, projectFolder }, entry);

            return { relativePath: 'design/activity/card__card-010.json' };
        }),
        appendActionRunHistory,
        activityConversationReference: vi.fn((_projectFolder, _origin, conversationId) => `design/activity/card__card-010.json#conversation=${conversationId}`),
        ensureActivityFile: vi.fn(async () => 'design/activity/card__card-010.json'),
        loadActionFile: vi.fn(async (_project, actionPath) => actionFiles.find(({ path }) => path === actionPath)),
        loadActionFiles: vi.fn(async () => actionFiles),
        loadAgentConversation: vi.fn(),
        loadProjectConfig: vi.fn(async () => ({ states: [{ state: 'design' }, { state: 'ready' }] })),
    };
    const commandRunner = vi.fn(async (_project, command) => ({ command, exitCode: 0, stderr: '', stdout: command }));
    const agentRunnerService = { start: vi.fn(), stop: vi.fn() };
    const actionWorktreeRunService = {
        execute: vi.fn(async (primaryProject, _action, _context, execute) => ({
            ...await execute(primaryProject),
            branch: primaryProject.branch,
            runWorktree: null,
            repositoryRoot: primaryProject.rootPath,
        })),
        resolve: vi.fn(async (primaryProject) => ({ runProject: primaryProject, runWorktree: null })),
        runWithCardLock: vi.fn(async (_primaryProject, _context, operation) => operation()),
    };
    const runner = new ActionRunnerService({
        actionWorktreeRunService,
        agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
        agentRunnerService,
        commandRunner,
        localGitService,
        ...overrides,
    });
    runner.startProject(project, 'actions', 'design', 'design/releases');

    return { actionWorktreeRunService, agentRunnerService, commandRunner, localGitService, runner };
}

async function runToCompletion(runner, request = { actionId: 'main', context, runInput: {} }) {
    const runId = await runner.start(request);

    return runner.wait(runId);
}

describe('ActionRunnerService', () => {
    it('reserves a root agent conversation before the action starts', async () => {
        const files = [actionFile('main', { agent: 'codex', command: undefined, prompt: 'Run', type: 'agent' })];
        const { localGitService, runner } = createRunner(files);

        const reservation = await runner.reserveConversation({ actionId: 'main', context, runInput: {} });

        expect(localGitService.ensureActivityFile).toHaveBeenCalledWith(
            project,
            'design',
            { cardInternalId: context.cardInternalId, kind: 'card' },
        );
        expect(reservation.reference).toBe(`design/activity/card__card-010.json#conversation=${reservation.conversationId}`);
    });

    const releasedContext = {
        ...context,
        file: 'design/releases/v1/F-010.md',
    };

    it('rejects new and continued runs for released cards while archived cards remain runnable', async () => {
        const { commandRunner, runner } = createRunner();

        await expect(runner.start({ actionId: 'main', context: releasedContext, runInput: {} }))
            .rejects.toThrow('Released cards are read-only. Create a new card for more work.');
        await expect(runner.start({
            actionId: 'main',
            context: releasedContext,
            runInput: { continueFrom: 'design/releases/v1/card__card-010.json#conversation=conversation-1' },
        })).rejects.toThrow('Released cards are read-only. Create a new card for more work.');
        expect(commandRunner).not.toHaveBeenCalled();

        await expect(runToCompletion(runner, {
            actionId: 'main',
            context: { ...context, file: 'design/archived/F-010.md' },
            runInput: {},
        })).resolves.toMatchObject({ status: 'completed' });
    });

    it('rejects restart before changing the old run', async () => {
        const { runner } = createRunner();
        const oldRun = { completion: Promise.resolve({ failure: null, status: 'completed' }), finishAgent: vi.fn() };
        runner.runs.set('old-run', oldRun);

        await expect(runner.restart('old-run', {
            actionId: 'main',
            context: releasedContext,
            runInput: { prompt: 'More work' },
        })).rejects.toThrow('Released cards are read-only. Create a new card for more work.');
        expect(oldRun.finishAgent).not.toHaveBeenCalled();
    });

    it('rejects prompt preparation for released cards', async () => {
        const { actionWorktreeRunService, runner } = createRunner();

        await expect(runner.prepareActionPrompt({ actionId: 'main', context: releasedContext }))
            .rejects.toThrow('Released cards are read-only. Create a new card for more work.');
        expect(actionWorktreeRunService.resolve).not.toHaveBeenCalled();
    });

    it('finishes and persists old run before starting its replacement', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const { runner } = createRunner();
        const oldRun = { completion: promise, finishAgent: vi.fn() };
        const request = { actionId: 'main', context, runInput: { continueFrom: 'conversation.json', prompt: 'next' } };
        const start = vi.spyOn(runner, 'start').mockResolvedValue('new-run');
        runner.runs.set('old-run', oldRun);

        const restarting = runner.restart('old-run', request);
        expect(oldRun.finishAgent).toHaveBeenCalledOnce();
        expect(start).not.toHaveBeenCalled();

        resolve({ failure: null, status: 'completed' });
        await expect(restarting).resolves.toBe('new-run');
        expect(start).toHaveBeenCalledWith(request);
    });

    it('does not overlap or restart after old run persistence fails', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const { runner } = createRunner();
        const oldRun = { completion: promise, finishAgent: vi.fn() };
        const request = { actionId: 'main', context, runInput: { continueFrom: 'conversation.json', prompt: 'next' } };
        const start = vi.spyOn(runner, 'start').mockResolvedValue('new-run');
        runner.runs.set('old-run', oldRun);

        const restarting = runner.restart('old-run', request);
        await expect(runner.restart('old-run', request)).rejects.toThrow('restart already in progress');
        resolve({ failure: 'history write failed', status: 'failed' });

        await expect(restarting).rejects.toThrow('history write failed');
        expect(start).not.toHaveBeenCalled();
    });

    it('returns ordered events for active runs only', () => {
        const { runner } = createRunner();
        const firstEvent = { runId: 'run-1', sequence: 1, type: 'run' };
        const secondEvent = { runId: 'run-1', sequence: 2, type: 'agentState' };
        runner.runEvents.set('run-1', []);

        runner.publish(firstEvent);
        runner.publish(secondEvent);
        const events = runner.loadActiveRunEvents();
        events[0].sequence = 99;

        expect(events).toEqual([{ ...firstEvent, sequence: 99 }, secondEvent]);
        expect(runner.loadActiveRunEvents()).toEqual([firstEvent, secondEvent]);
    });

    it('forwards card-state changes to every live run', () => {
        const { runner } = createRunner();
        const firstRun = { handleCardStateChange: vi.fn() };
        const secondRun = { handleCardStateChange: vi.fn() };
        runner.runs.set('first', firstRun);
        runner.runs.set('second', secondRun);

        runner.handleCardStateChange('card-1', 'ready');

        expect(firstRun.handleCardStateChange).toHaveBeenCalledWith('card-1', 'ready');
        expect(secondRun.handleCardStateChange).toHaveBeenCalledWith('card-1', 'ready');
    });

    it('requires project and collaborators before start', async () => {
        const runner = new ActionRunnerService({});

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Action runner has no project');
        runner.startProject(project, 'actions', 'design', 'design/releases');
        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Action runner has no local Git service');
    });

    it('rejects unattended streaming chains before starting a process', async () => {
        const files = [
            actionFile('main', { command: 'main', onAfter: ['stream'] }),
            actionFile('stream', {
                command: undefined,
                prompt: 'wait for confirmation',
                streaming: true,
                type: 'agent',
            }),
        ];
        const { agentRunnerService, commandRunner, runner } = createRunner(files);

        await expect(runner.start(
            { actionId: 'main', context, runInput: {} },
            { interactive: false },
        )).rejects.toThrow('Streaming action requires an interactive manual run');
        expect(commandRunner).not.toHaveBeenCalled();
        expect(agentRunnerService.start).not.toHaveBeenCalled();
    });

    it('returns current actions folder and clears readiness on stop', async () => {
        const { runner } = createRunner();

        expect(runner.requireActionsFolder()).toBe('actions');
        expect(runner.requireProjectFolder()).toBe('design');
        await runner.stop();
        expect(() => runner.requireActionsFolder()).toThrow('Action runner has no actions folder');
    });

    it('reads current selected definition before every start without rescanning all actions', async () => {
        const { commandRunner, localGitService, runner } = createRunner();

        await runToCompletion(runner);
        localGitService.loadActionFile.mockResolvedValueOnce(actionFile('renamed'));

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Unknown action: main');
        expect(commandRunner).toHaveBeenCalledTimes(1);
        expect(localGitService.loadActionFiles).toHaveBeenCalledOnce();
        expect(localGitService.loadActionFile).toHaveBeenCalledTimes(2);
    });

    it('prepares a canonical prompt against the resolved worktree without starting run', async () => {
        const files = [actionFile('main', {
            command: undefined,
            needsWorkTree: true,
            prompt: 'Review {{card-file}} in {{worktree-folder}}; repository {{repository-folder}}; project {{project-folder}}; releases {{releases-folder}}',
            trackFileChanges: true,
            type: 'agent',
        })];
        const { actionWorktreeRunService, agentRunnerService, localGitService, runner } = createRunner(files);
        const worktreeProject = { ...project, branch: 'feature', rootPath: 'C:/worktrees/2' };
        actionWorktreeRunService.resolve.mockResolvedValueOnce({ runProject: worktreeProject, runWorktree: 2 });

        await expect(runner.prepareActionPrompt({ actionId: 'main', context })).resolves.toEqual({prompt: `Review design/F-010.md in C:/worktrees/2; repository C:/repo; project ${path.resolve('C:/repo', 'design')}; releases ${path.resolve('C:/repo', 'design/releases')}\n\nDo not stage or commit changes. md2 will commit files captured from provider edit tools.`});
        expect(actionWorktreeRunService.resolve).toHaveBeenCalledWith(project, expect.objectContaining({ id: 'main' }), context);
        expect(actionWorktreeRunService.execute).not.toHaveBeenCalled();
        expect(agentRunnerService.start).not.toHaveBeenCalled();
        expect(localGitService.appendAndCommitActionActivity).not.toHaveBeenCalled();
    });

    it('drops unknown persisted fields before run', async () => {
        const { commandRunner, runner } = createRunner([actionFile('main', { needsWorktree: true })]);

        await expect(runToCompletion(runner)).resolves.toMatchObject({ status: 'completed' });
        expect(commandRunner).toHaveBeenCalledOnce();
    });

    it.each([
        ['circular reference', [actionFile('main', { onBefore: ['linked'] }), actionFile('linked', { onAfter: ['main'] })], {}, 'Circular action reference'],
        ['unknown action', [actionFile('other')], {}, 'Unknown action: main'],
    ])('rejects %s before run id creation', async (_label, files, runInput, message) => {
        const { commandRunner, runner } = createRunner(files);

        await expect(runner.start({ actionId: 'main', context, runInput })).rejects.toThrow(message);
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('returns terminal failure for runtime selection error', async () => {
        const files = [actionFile('main', {agent: 'codex', command: undefined, model: 'gpt-5.5', prompt: 'Run {{card-file}}', type: 'agent'})];
        const { agentRunnerService, runner } = createRunner(files);

        await expect(runToCompletion(runner, {actionId: 'main', context, runInput: { model: 'retired-model' }})).resolves.toMatchObject({ failure: expect.stringContaining('Unknown model'), status: 'failed' });
        expect(agentRunnerService.start).not.toHaveBeenCalled();
    });

    it('composes real run and command collaborators with ordered events', async () => {
        const files = [
            actionFile('before'),
            actionFile('main', { on: [{ actionId: 'matched', condition: 'main' }], onAfter: ['after'], onBefore: ['before'] }),
            actionFile('matched'),
            actionFile('after'),
        ];
        const { commandRunner, localGitService, runner } = createRunner(files);
        const events = [];
        runner.subscribe((event) => events.push(event));

        await expect(runToCompletion(runner)).resolves.toMatchObject({ status: 'completed' });
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['before', 'main', 'matched', 'after']);
        expect(localGitService.appendAndCommitActionActivity).toHaveBeenCalledOnce();
        expect(events.filter(({ status, type }) => status === 'completed' && type === 'action').map(({ actionId, phase }) => ({actionId, phase}))).toEqual([
            { actionId: 'before', phase: 'before' },
            { actionId: 'main', phase: 'main' },
            { actionId: 'matched', phase: 'on' },
            { actionId: 'after', phase: 'after' },
        ]);
    });

    it('wait returns active completion and consumes stored completed result when retrieved', async () => {
        const { runner } = createRunner();
        const runId = await runner.start({ actionId: 'main', context, runInput: {} });

        await expect(runner.wait(runId)).resolves.toMatchObject({ runId, status: 'completed' });
        await expect(runner.wait(runId)).resolves.toMatchObject({ runId, status: 'completed' });
        await expect(runner.wait(runId)).rejects.toThrow(`Unknown action run: ${runId}`);
    });

    it('retains every unconsumed terminal result until its waiter retrieves it', async () => {
        const { runner } = createRunner();
        const runIds = [];
        const terminalIds = [];
        runner.subscribe((event) => {
            if (event.type === 'run' && event.status === 'completed') terminalIds.push(event.runId);
        });

        for (let index = 0; index < 101; index++) {
            runIds.push(await runner.start({ actionId: 'main', context, runInput: {} }));
        }
        await vi.waitFor(() => expect(terminalIds).toHaveLength(101));

        await expect(runner.wait(runIds[0])).resolves.toMatchObject({ status: 'completed' });
        await expect(runner.wait(runIds[100])).resolves.toMatchObject({ status: 'completed' });
    });

    it('cancels an active run when the project switches', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const commandRunner = vi.fn(async (runProject, command) => {
            if (command === 'main') await promise;

            return { command, exitCode: 0, stderr: '', stdout: command };
        });
        const files = [actionFile('main', { onAfter: ['after'] }), actionFile('after')];
        const { localGitService, runner } = createRunner(files, { commandRunner });
        const runId = await runner.start({ actionId: 'main', context, runInput: {} });
        await vi.waitFor(() => expect(commandRunner).toHaveBeenCalledTimes(1));

        runner.startProject({ branch: 'other', id: 'other', rootPath: 'C:/other' }, 'other-actions', 'other-design', 'other-design/releases');
        resolve();
        const result = await runner.wait(runId);

        expect(result.status).toBe('cancelled');
        expect(commandRunner.mock.calls.map((call) => call[0])).toEqual([project]);
        expect(localGitService.appendAndCommitActionActivity.mock.calls[0][1]).toBe('design');
    });

    it('delegates cancel and rejects unknown run id', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await promise;
            if (signal.aborted) throw new Error('aborted');

            return { command, exitCode: 0, stderr: '', stdout: '' };
        });
        const { runner } = createRunner(undefined, { commandRunner });
        const runId = await runner.start({ actionId: 'main', context, runInput: {} });

        expect(() => runner.cancel('unknown')).toThrow('Unknown action run: unknown');
        runner.cancel(runId);
        resolve();
        await expect(runner.wait(runId)).resolves.toMatchObject({ status: 'cancelled' });
    });

    it('registers run before running-event listener can cancel it', async () => {
        const { commandRunner, runner } = createRunner();
        runner.subscribe((event) => {
            if (event.type === 'run' && event.status === 'running') runner.cancel(event.runId);
        });

        await expect(runToCompletion(runner)).resolves.toMatchObject({ status: 'cancelled' });
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('stop cancels every active run and clears project state', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await promise;
            if (signal.aborted) throw new Error('aborted');

            return { command, exitCode: 0, stderr: '', stdout: '' };
        });
        const { runner } = createRunner(undefined, { commandRunner });
        const firstId = await runner.start({ actionId: 'main', context, runInput: {} });
        const secondId = await runner.start({ actionId: 'main', context, runInput: {} });

        const stopping = runner.stop();
        resolve();
        await stopping;

        await expect(runner.wait(firstId)).resolves.toMatchObject({ status: 'cancelled' });
        await expect(runner.wait(secondId)).resolves.toMatchObject({ status: 'cancelled' });
        expect(() => runner.requireActionsFolder()).toThrow('Action runner has no actions folder');
    });

    it('isolates listeners and the error reporter from the result', async () => {
        const listenerError = new Error('listener failed');
        const errorReporter = vi.fn(() => { throw new Error('reporter failed'); });
        const { runner } = createRunner(undefined, { errorReporter });
        const laterListener = vi.fn();
        runner.subscribe(() => { throw listenerError; });
        runner.subscribe(laterListener);

        await expect(runToCompletion(runner)).resolves.toMatchObject({ status: 'completed' });
        expect(laterListener).toHaveBeenCalled();
        expect(errorReporter).toHaveBeenCalledWith(listenerError);
    });
});
