import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionRunnerService } = require('./action_runner_service');

const context = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' };
const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

function actionFile(id, overrides = {}) {
    return {
        content: JSON.stringify({
            command: id,
            description: `${id} description`,
            id,
            label: id,
            name: id,
            type: 'command',
            ...overrides,
        }),
        path: `actions/${id}.json`,
    };
}

function createRunner(actionFiles = [actionFile('main')], overrides = {}) {
    const localGitService = {
        appendActionRunHistory: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => actionFiles),
        loadAgentConversation: vi.fn(),
    };
    const commandRunner = vi.fn(async (_project, command) => ({ command, exitCode: 0, stderr: '', stdout: command }));
    const agentRunnerService = { start: vi.fn(), stop: vi.fn() };
    const actionWorktreeExecutionService = {
        execute: vi.fn(async (primaryProject, _action, _context, execute) => ({
            ...await execute(primaryProject),
            branch: primaryProject.branch,
            executionWorktree: null,
            repositoryRoot: primaryProject.rootPath,
        })),
    };
    const runner = new ActionRunnerService({
        actionWorktreeExecutionService,
        agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
        agentRunnerService,
        commandRunner,
        localGitService,
        ...overrides,
    });
    runner.startProject(project, 'actions');

    return { actionWorktreeExecutionService, agentRunnerService, commandRunner, localGitService, runner };
}

async function runToCompletion(runner, request = { actionId: 'main', context, runInput: {} }) {
    const executionId = await runner.start(request);

    return runner.wait(executionId);
}

describe('ActionRunnerService', () => {
    it('requires project and collaborators before start', async () => {
        const runner = new ActionRunnerService({});

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Action runner has no project');
        runner.startProject(project, 'actions');
        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Action runner has no local Git service');
    });

    it('returns current actions folder and clears readiness on stop', () => {
        const { runner } = createRunner();

        expect(runner.requireActionsFolder()).toBe('actions');
        runner.stop();
        expect(() => runner.requireActionsFolder()).toThrow('Action runner has no actions folder');
    });

    it('reloads and validates definitions before every start', async () => {
        const { commandRunner, localGitService, runner } = createRunner();

        await runToCompletion(runner);
        localGitService.loadActionFiles.mockResolvedValueOnce([actionFile('renamed')]);

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Unknown action: main');
        expect(commandRunner).toHaveBeenCalledTimes(1);
        expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['unknown persisted field', [actionFile('main', { needsWorktree: true })], {}, 'Unknown action field needsWorktree'],
        ['circular reference', [actionFile('main', { onBefore: ['linked'] }), actionFile('linked', { onAfter: ['main'] })], {}, 'Circular action reference'],
        ['unknown action', [actionFile('other')], {}, 'Unknown action: main'],
    ])('rejects %s before execution id creation', async (_label, files, runInput, message) => {
        const { commandRunner, runner } = createRunner(files);

        await expect(runner.start({ actionId: 'main', context, runInput })).rejects.toThrow(message);
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('returns terminal failure for runtime selection error', async () => {
        const files = [actionFile('main', {agent: 'codex', command: undefined, model: 'gpt-5.5', prompt: 'Run {{file}}', type: 'agent'})];
        const { agentRunnerService, runner } = createRunner(files);

        await expect(runToCompletion(runner, {actionId: 'main', context, runInput: { model: 'retired-model' }})).resolves.toMatchObject({ failure: expect.stringContaining('Unknown model'), status: 'failed' });
        expect(agentRunnerService.start).not.toHaveBeenCalled();
    });

    it('composes real execution and command collaborators with ordered events', async () => {
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
        expect(localGitService.appendActionRunHistory).toHaveBeenCalledTimes(4);
        expect(events.filter(({ status, type }) => status === 'completed' && type === 'action').map(({ actionId, phase }) => ({actionId, phase}))).toEqual([
            { actionId: 'before', phase: 'before' },
            { actionId: 'main', phase: 'main' },
            { actionId: 'matched', phase: 'on' },
            { actionId: 'after', phase: 'after' },
        ]);
    });

    it('wait returns active completion and consumes stored completed result when retrieved', async () => {
        const { runner } = createRunner();
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} });

        await expect(runner.wait(executionId)).resolves.toMatchObject({ executionId, status: 'completed' });
        await expect(runner.wait(executionId)).resolves.toMatchObject({ executionId, status: 'completed' });
        await expect(runner.wait(executionId)).rejects.toThrow(`Unknown action execution: ${executionId}`);
    });

    it('retains only newest 100 unconsumed results', async () => {
        const { runner } = createRunner();
        const executionIds = [];
        const terminalIds = [];
        runner.subscribe((event) => {
            if (event.type === 'execution' && event.status === 'completed') terminalIds.push(event.executionId);
        });

        for (let index = 0; index < 101; index++) {
            executionIds.push(await runner.start({ actionId: 'main', context, runInput: {} }));
        }
        await vi.waitFor(() => expect(terminalIds).toHaveLength(101));

        await expect(runner.wait(executionIds[0])).rejects.toThrow(`Unknown action execution: ${executionIds[0]}`);
        await expect(runner.wait(executionIds[1])).resolves.toMatchObject({ status: 'completed' });
    });

    it('keeps project and actions-folder snapshot across project switch', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const commandRunner = vi.fn(async (executionProject, command) => {
            if (command === 'main') await promise;

            return { command, exitCode: 0, stderr: '', stdout: command };
        });
        const files = [actionFile('main', { onAfter: ['after'] }), actionFile('after')];
        const { localGitService, runner } = createRunner(files, { commandRunner });
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} });
        await vi.waitFor(() => expect(commandRunner).toHaveBeenCalledTimes(1));

        runner.startProject({ branch: 'other', id: 'other', rootPath: 'C:/other' }, 'other-actions');
        resolve();
        await runner.wait(executionId);

        expect(commandRunner.mock.calls.map((call) => call[0])).toEqual([project, project]);
        expect(localGitService.appendActionRunHistory.mock.calls.map((call) => call[1].actionsFolder)).toEqual(['actions', 'actions']);
    });

    it('delegates cancel and rejects unknown execution id', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await promise;
            if (signal.aborted) throw new Error('aborted');

            return { command, exitCode: 0, stderr: '', stdout: '' };
        });
        const { runner } = createRunner(undefined, { commandRunner });
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} });

        expect(() => runner.cancel('unknown')).toThrow('Unknown action execution: unknown');
        runner.cancel(executionId);
        resolve();
        await expect(runner.wait(executionId)).resolves.toMatchObject({ status: 'cancelled' });
    });

    it('registers execution before running-event listener can cancel it', async () => {
        const { commandRunner, runner } = createRunner();
        runner.subscribe((event) => {
            if (event.type === 'execution' && event.status === 'running') runner.cancel(event.executionId);
        });

        await expect(runToCompletion(runner)).resolves.toMatchObject({ status: 'cancelled' });
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('stop cancels every active execution and clears project state', async () => {
        const { promise, resolve } = Promise.withResolvers();
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await promise;
            if (signal.aborted) throw new Error('aborted');

            return { command, exitCode: 0, stderr: '', stdout: '' };
        });
        const actionCompleted = vi.fn();
        const { runner } = createRunner(undefined, { actionCompleted, commandRunner });
        const firstId = await runner.start({ actionId: 'main', context, runInput: {} });
        const secondId = await runner.start({ actionId: 'main', context, runInput: {} });

        runner.stop();
        resolve();

        await expect(runner.wait(firstId)).resolves.toMatchObject({ status: 'cancelled' });
        await expect(runner.wait(secondId)).resolves.toMatchObject({ status: 'cancelled' });
        expect(() => runner.requireActionsFolder()).toThrow('Action runner has no actions folder');
        expect(actionCompleted).not.toHaveBeenCalled();
    });

    it('isolates listeners, error reporter, and completion callback from result', async () => {
        const listenerError = new Error('listener failed');
        const callbackError = new Error('scheduler failed');
        const errorReporter = vi.fn(() => { throw new Error('reporter failed'); });
        const actionCompleted = vi.fn(async () => { throw callbackError; });
        const { runner } = createRunner(undefined, { actionCompleted, errorReporter });
        const laterListener = vi.fn();
        runner.subscribe(() => { throw listenerError; });
        runner.subscribe(laterListener);

        await expect(runToCompletion(runner)).resolves.toMatchObject({ status: 'completed' });
        expect(laterListener).toHaveBeenCalled();
        expect(errorReporter).toHaveBeenCalledWith(listenerError);
        expect(errorReporter).toHaveBeenCalledWith(callbackError);
    });

    it.each([[0, 'completed'], [1, 'failed']])('invokes completion callback for exit code %s', async (exitCode, status) => {
        const actionCompleted = vi.fn();
        const commandRunner = vi.fn(async (_project, command) => ({ command, exitCode, stderr: '', stdout: '' }));
        const { runner } = createRunner(undefined, { actionCompleted, commandRunner });

        await expect(runToCompletion(runner)).resolves.toMatchObject({ status });
        expect(actionCompleted).toHaveBeenCalledWith('main');
    });
});
