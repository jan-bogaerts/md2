import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionRun } = require('./action_run');

const context = { cardInternalId: 'card-1', file: 'design/card.md', kind: 'card' };
const project = { branch: 'main', rootPath: 'C:/repo' };

function action(id, overrides = {}) {
    return {
        command: id,
        id,
        label: id,
        on: [],
        onAfter: [],
        onBefore: [],
        type: 'command',
        ...overrides,
    };
}

function deferred() {
    const { promise, resolve } = Promise.withResolvers();

    return { promise, resolve };
}

function createRun(rootAction, overrides = {}) {
    const events = [];
    const appendActionRunHistory = overrides.localGitService?.appendActionRunHistory ?? vi.fn(async () => []);
    const localGitService = {
        appendAndCommitActionActivity: vi.fn(async (_project, _projectFolder, _origin, record) => {
            const commits = record.commits.map((commit) => ({
                ...commit,
                actionId: commit.actionId ?? record.rootActionId,
                actionName: commit.actionName ?? record.rootActionLabel,
                repositoryRoot: project.rootPath,
            }));
            const entry = {
                ...record.details,
                commits,
                completedAt: record.completedAt,
                ...(record.rootConversationId ? { rootConversationId: record.rootConversationId } : {}),
                startedAt: record.startedAt,
                status: record.status,
            };
            await appendActionRunHistory(project, { actionId: record.rootActionId, context }, entry);

            return { relativePath: 'design/activity/card__card-1.json' };
        }),
        appendActionRunHistory,
        ...overrides.localGitService,
    };
    const commandRunner = overrides.commandRunner ?? vi.fn(async (_project, command, _signal, onOutput) => {
        onOutput({ stderr: '', stdout: `${command}-chunk` });

        return { command, exitCode: 0, stderr: '', stdout: command };
    });
    const actionWorktreeRunService = {
        execute: vi.fn(async (primaryProject, _action, _context, run) => ({
            ...await run(primaryProject),
            branch: primaryProject.branch,
            runWorktree: null,
            repositoryRoot: primaryProject.rootPath,
        })),
        runWithCardLock: vi.fn(async (_primaryProject, _context, operation) => operation()),
        ...overrides.actionWorktreeRunService,
    };
    const agentRunnerService = overrides.agentRunnerService ?? { stop: vi.fn() };
    const agentExecutor = overrides.agentExecutor ?? { execute: vi.fn() };
    const run = new ActionRun({
        activeCardsFolder: 'design/feature_descriptions',
        actionsFolder: 'actions',
        activityOrigin: overrides.context?.kind === 'project'
            ? { kind: 'project' }
            : { cardInternalId: 'card-1', kind: 'card' },
        context: overrides.context ?? context,
        diagramFooter: overrides.diagramFooter,
        diagramsFolder: overrides.diagramsFolder,
        diagramPath: overrides.diagramPath,
        runId: 'run-1',
        project,
        projectFolder: 'design',
        releasesFolder: 'design/releases',
        rootAction,
        runInput: { extraPrompt: '', ...overrides.runInput },
        startedAt: '2026-07-20T10:00:00.000Z',
    }, {
        actionWorktreeRunService,
        agentExecutor,
        agentRunnerService,
        commandRunner,
        diagramOutputWatcherFactory: overrides.diagramOutputWatcherFactory,
        localGitService,
        publisher: (event) => events.push(event),
    });
    run.start((completion) => completion);

    return { actionWorktreeRunService, agentRunnerService, commandRunner, events, run, localGitService };
}

describe('ActionRun', () => {
    it('finishes a streaming diagram agent when valid output precedes provider startup', async () => {
        const close = vi.fn(async () => undefined);
        const agentRunnerService = { finish: vi.fn(), stop: vi.fn() };
        const diagramOutputWatcherFactory = vi.fn((input) => ({
            close,
            start: vi.fn(async () => input.handleReady()),
        }));
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                input.onActiveRunChange('provider-run');
                input.onActiveRunChange(null);

                return {
                    changedPaths: [], conversationId: 'conversation-1', exitCode: 0,
                    reference: 'conversation.json', stderr: '', stdout: '',
                };
            }),
        };
        const rootAction = action('diagram', {
            agent: 'codex',
            appliesTo: { kind: 'diagram', type: 'root' },
            autoFinish: { when: 'diagram-created' },
            command: null,
            output: { kind: 'diagram' },
            prompt: 'Create diagram',
            streaming: true,
            type: 'agent',
        });
        const { run } = createRun(rootAction, {
            agentExecutor,
            agentRunnerService,
            context: { kind: 'diagram', type: 'root' },
            diagramFooter: 'Save {{diagram-file}}',
            diagramOutputWatcherFactory,
            diagramPath: 'design/diagrams/output.json',
            diagramsFolder: 'design/diagrams',
        });

        await expect(run.completion).resolves.toMatchObject({diagramPath: 'design/diagrams/output.json', status: 'completed'});
        expect(agentRunnerService.finish).toHaveBeenCalledWith('provider-run');
        expect(close).toHaveBeenCalledOnce();
    });

    it('fails before provider startup when diagram watcher cannot start', async () => {
        const close = vi.fn(async () => undefined);
        const agentExecutor = { execute: vi.fn() };
        const rootAction = action('diagram', {
            agent: 'codex', appliesTo: { kind: 'diagram', type: 'root' },
            autoFinish: { when: 'diagram-created' }, command: null,
            output: { kind: 'diagram' }, prompt: 'Create diagram', streaming: true, type: 'agent',
        });
        const { run } = createRun(rootAction, {
            agentExecutor,
            context: { kind: 'diagram', type: 'root' },
            diagramFooter: 'Save {{diagram-file}}',
            diagramOutputWatcherFactory: () => ({close, start: vi.fn(async () => { throw new Error('diagram watch failed'); })}),
            diagramPath: 'design/diagrams/output.json',
            diagramsFolder: 'design/diagrams',
        });

        await expect(run.completion).resolves.toMatchObject({ failure: 'diagram watch failed', status: 'failed' });
        expect(agentExecutor.execute).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledOnce();
    });

    it('closes diagram watcher when action is cancelled', async () => {
        const watcherStarted = deferred();
        const close = vi.fn(async () => undefined);
        const agentExecutor = {
            execute: vi.fn(async (input) => new Promise((_resolve, reject) => {
                input.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
            })),
        };
        const rootAction = action('diagram', {
            agent: 'codex', appliesTo: { kind: 'diagram', type: 'root' },
            autoFinish: { when: 'diagram-created' }, command: null,
            output: { kind: 'diagram' }, prompt: 'Create diagram', streaming: true, type: 'agent',
        });
        const { run } = createRun(rootAction, {
            agentExecutor,
            context: { kind: 'diagram', type: 'root' },
            diagramFooter: 'Save {{diagram-file}}',
            diagramOutputWatcherFactory: () => ({
                close,
                start: vi.fn(async () => watcherStarted.resolve()),
            }),
            diagramPath: 'design/diagrams/output.json',
            diagramsFolder: 'design/diagrams',
        });
        await watcherStarted.promise;

        run.cancel();

        await expect(run.completion).resolves.toMatchObject({ status: 'cancelled' });
        expect(close).toHaveBeenCalledOnce();
    });

    it.each(['', '   '])('rejects incomplete root command %j before worktree resolution or process start', async (command) => {
        const rootAction = action('main', { command });
        const { actionWorktreeRunService, commandRunner, run } = createRun(rootAction);

        await expect(run.completion).resolves.toMatchObject({
            failure: 'Command text is required for action "main"',
            status: 'failed',
        });
        expect(actionWorktreeRunService.execute).not.toHaveBeenCalled();
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('rejects incomplete linked command before root or linked process start', async () => {
        const linkedAction = action('linked', { command: ' ' });
        const rootAction = action('main', { onBefore: [linkedAction] });
        const { actionWorktreeRunService, commandRunner, run } = createRun(rootAction);

        await expect(run.completion).resolves.toMatchObject({
            failure: 'Command text is required for action "linked"',
            status: 'failed',
        });
        expect(actionWorktreeRunService.execute).not.toHaveBeenCalled();
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('runs before, main, every matching on rule, and after in declaration order', async () => {
        const before = action('before');
        const firstMatch = action('first-match');
        const secondMatch = action('second-match');
        const after = action('after');
        const rootAction = action('main', {
            on: [
                { action: firstMatch, condition: 'main' },
                { action: secondMatch, condition: 'main' },
            ],
            onAfter: [after],
            onBefore: [before],
        });
        const { commandRunner, run } = createRun(rootAction);

        await expect(run.completion).resolves.toMatchObject({ status: 'completed' });
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['before', 'main', 'first-match', 'second-match', 'after']);
    });

    it.each([
        ['before', (failure) => action('main', { onBefore: [failure] }), 'failed'],
        ['main', () => action('main'), 'failed'],
        ['on', (failure) => action('main', { on: [{ action: failure, condition: 'main' }] }), 'failed'],
        ['after', (failure) => action('main', { onAfter: [failure] }), 'okButNotAfter'],
        ['nested after', (failure) => action('main', { onAfter: [action('parent', { onAfter: [failure] })] }), 'okButNotAfter'],
    ])('maps %s failure to %s', async (_phase, createRoot, expectedStatus) => {
        const failure = action(_phase === 'main' ? 'main' : 'failure');
        const rootAction = createRoot(failure);
        const commandRunner = vi.fn(async (_project, command) => ({command, exitCode: command === failure.id ? 1 : 0, stderr: '', stdout: command}));
        const { run } = createRun(rootAction, { commandRunner });

        await expect(run.completion).resolves.toMatchObject({ status: expectedStatus });
    });

    it.each([
        ['before', (parent) => action('main', { onBefore: [parent] })],
        ['on', (parent) => action('main', { on: [{ action: parent, condition: 'main' }] })],
    ])('keeps nested after failure in root %s subtree failed', async (_phase, createRoot) => {
        const parent = action('parent', { onAfter: [action('failure')] });
        const commandRunner = vi.fn(async (_project, command) => ({command, exitCode: command === 'failure' ? 1 : 0, stderr: '', stdout: command}));
        const { run } = createRun(createRoot(parent), { commandRunner });

        await expect(run.completion).resolves.toMatchObject({ status: 'failed' });
    });

    it('resolves worktree independently for each linked action', async () => {
        const rootAction = action('main', { onAfter: [action('after')], onBefore: [action('before')] });
        const { actionWorktreeRunService, run } = createRun(rootAction);

        await run.completion;

        expect(actionWorktreeRunService.execute.mock.calls.map((call) => call[1].id)).toEqual(['before', 'main', 'after']);
    });

    it('publishes queued before running when the card lock is occupied', async () => {
        const actionWorktreeRunService = {
            runWithCardLock: vi.fn(async (_primaryProject, _context, operation, options) => {
                options.onQueued();

                return operation();
            }),
        };
        const { events, run } = createRun(action('main'), { actionWorktreeRunService });

        await run.completion;

        expect(events
            .filter((event) => event.type === 'action')
            .map(({ status }) => status))
            .toEqual(['queued', 'running', 'completed']);
        expect(actionWorktreeRunService.runWithCardLock.mock.calls[0][3].signal).toBe(run.controller.signal);
    });

    it('applies root run input only to root action', async () => {
        const rootAction = action('stored main', {
            id: 'main',
            onBefore: [action('before={{card-prompt}}', { id: 'before' })],
        });
        const { commandRunner, run } = createRun(rootAction, {runInput: { command: 'main=focus', extraPrompt: 'not command input' }});

        await run.completion;

        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['before=', 'main=focus']);
    });

    it('passes prompt override only to the root agent action', async () => {
        const linkedAction = action('linked', { command: undefined, prompt: 'Linked stored', type: 'agent' });
        const rootAction = action('main', { command: undefined, onBefore: [linkedAction], prompt: 'Root stored', type: 'agent' });
        const agentExecutor = {
            execute: vi.fn(async (input) => ({
                agent: 'codex', changedPaths: [], conversation: { id: input.action.id }, conversationId: input.action.id, exitCode: 0, model: 'gpt',
                prompt: input.runInput.prompt ?? input.action.prompt, stderr: '', stdout: input.action.id, thinkingLevel: 'none',
            })),
        };
        const { run } = createRun(rootAction, { agentExecutor, runInput: { prompt: 'Root edited' } });

        await run.completion;

        expect(agentExecutor.execute.mock.calls.map(([input]) => input.runInput)).toEqual([
            { extraPrompt: '' },
            { extraPrompt: '', prompt: 'Root edited' },
        ]);
    });

    it('publishes stream, writes history, then publishes terminal action event', async () => {
        const order = [];
        const commandRunner = vi.fn(async (_project, command, _signal, onOutput) => {
            onOutput({ stderr: '', stdout: 'chunk' });
            order.push('process');

            return { command, exitCode: 0, stderr: '', stdout: 'done' };
        });
        const localGitService = {
            appendAndCommitActionActivity: vi.fn(async () => {
                order.push('history');

                return { relativePath: 'design/activity/card__card-1.json' };
            }),
        };
        const events = [];
        const run = new ActionRun({
            actionsFolder: 'actions', activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, context,
            runId: 'run-1', project, projectFolder: 'design', rootAction: action('main'),
            runInput: { extraPrompt: '' }, startedAt: '2026-07-20T10:00:00.000Z',
        }, {
            actionWorktreeRunService: {
                execute: async (primaryProject, _action, _context, run) => run(primaryProject),
                runWithCardLock: async (_primaryProject, _context, operation) => operation(),
            },
            agentExecutor: { execute: vi.fn() },
            agentRunnerService: { stop: vi.fn() },
            commandRunner,
            localGitService,
            publisher: (event) => {
                events.push(event);
                if (event.type === 'action') order.push(`${event.status}:`);
                if (event.type === 'update') order.push(`${event.status}:${event.update.content}`);
            },
        });
        run.start((completion) => completion);

        await run.completion;

        expect(order).toEqual(['running:', 'running:chunk', 'process', 'completed:', 'history']);
        expect(events.every((event) => event.context === context)).toBe(true);
    });

    it('publishes accumulated agent paths only after activity persistence', async () => {
        const rootAction = action('main', {
            onAfter: [action('after', { prompt: 'after', type: 'agent' })],
            prompt: 'main',
            type: 'agent',
        });
        const agentExecutor = {
            execute: vi.fn(async ({ action: currentAction }) => ({
                agent: 'codex',
                changedPaths: currentAction.id === 'main' ? ['app/a.ts'] : ['desktop/b.js', 'app/a.ts'],
                conversationId: currentAction.id,
                exitCode: 0,
                model: 'gpt',
                prompt: currentAction.prompt,
                stderr: '',
                stdout: '',
                thinkingLevel: 'none',
            })),
        };
        const order = [];
        const localGitService = {
            appendAndCommitActionActivity: vi.fn(async () => {
                order.push('activity');

                return { relativePath: 'design/activity/card__card-1.json' };
            }),
        };
        const { events, run } = createRun(rootAction, { agentExecutor, localGitService });
        const originalPublisher = run.publisher;
        run.publisher = (event) => {
            originalPublisher(event);
            if (event.type === 'run' && event.status === 'completed') order.push('terminal');
        };

        await expect(run.completion).resolves.toMatchObject({
            changedPaths: ['app/a.ts', 'desktop/b.js'],
            status: 'completed',
        });

        expect(order).toEqual(['activity', 'terminal']);
        expect(events.at(-1)).toMatchObject({
            changedPaths: ['app/a.ts', 'desktop/b.js'],
            status: 'completed',
            type: 'run',
        });
    });

    it('cancels active command before root cancellation and starts no later phase', async () => {
        const commandCompletion = deferred();
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await commandCompletion.promise;
            if (signal.aborted) throw new Error('aborted');

            return { command, exitCode: 0, stderr: '', stdout: command };
        });
        const { commandRunner: runner, events, run } = createRun(
            action('main', { onAfter: [action('after')] }),
            { commandRunner },
        );
        run.cancel();
        commandCompletion.resolve();

        await expect(run.completion).resolves.toMatchObject({ status: 'cancelled' });
        expect(runner).toHaveBeenCalledTimes(1);
        expect(events.slice(-2).map(({ status, type }) => ({ status, type }))).toEqual([
            { status: 'cancelled', type: 'action' },
            { status: 'cancelled', type: 'run' },
        ]);
    });

    it.each([
        ['before', { onBefore: [action('target')] }, ['target']],
        ['on', { on: [{ action: action('target'), condition: 'main' }], onAfter: [action('later')] }, ['main', 'target']],
        ['after', { onAfter: [action('target'), action('later')] }, ['main', 'target']],
    ])('cancels linked %s action and starts no later phase', async (phase, rootOverrides, expectedCommands) => {
        const targetCompletion = deferred();
        const commandRunner = vi.fn(async (_project, command, signal) => {
            if (command === 'target') await targetCompletion.promise;
            if (signal.aborted) throw new Error('aborted');

            return { command, exitCode: 0, stderr: '', stdout: command };
        });
        const { events, run } = createRun(action('main', rootOverrides), { commandRunner });
        await vi.waitFor(() => expect(commandRunner.mock.calls.map((call) => call[1])).toContain('target'));
        run.cancel();
        targetCompletion.resolve();

        await expect(run.completion).resolves.toMatchObject({ status: 'cancelled' });
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(expectedCommands);
        expect(events).toContainEqual(expect.objectContaining({ actionId: 'target', phase, status: 'cancelled', type: 'action' }));
    });

    it('stops active agent run through cancel', async () => {
        const agentCompletion = deferred();
        const agentRunnerService = { stop: vi.fn() };
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                input.onActiveRunChange('agent-run');
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversation: { id: 'conversation' }, exitCode: 1, model: 'gpt', prompt: 'run',
                    conversationId: 'conversation', reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', type: 'agent' });
        const { run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await vi.waitFor(() => expect(agentExecutor.execute).toHaveBeenCalled());
        run.cancel();
        agentCompletion.resolve();

        await run.completion;

        expect(agentRunnerService.stop).toHaveBeenCalledWith('agent-run');
    });

    it('publishes isolated approvals and blocks prompts until every request resolves', async () => {
        const agentCompletion = deferred();
        const agentStarted = deferred();
        const answerApproval = vi.fn(async () => undefined);
        const sendMessage = vi.fn(async () => undefined);
        const agentRunnerService = { answerApproval, sendMessage, stop: vi.fn() };
        let agentInput;
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                agentInput = input;
                input.onActiveRunChange('agent-run');
                agentStarted.resolve();
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', streaming: true, type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await agentStarted.promise;
        const firstApproval = { itemId: 'command-1', kind: 'commandExecution', requestId: 41, threadId: 'thread-1', turnId: 'turn-1' };
        const secondApproval = { itemId: 'file-1', kind: 'fileChange', requestId: 42, threadId: 'thread-1', turnId: 'turn-1' };
        agentInput.onEvent({ approval: firstApproval, type: 'approval' });
        agentInput.onEvent({ approval: secondApproval, type: 'approval' });

        expect(() => run.sendAgentMessage('next')).toThrow('pending approval');
        await run.answerAgentApproval(41, 'accept');
        agentInput.onEvent({ requestId: 41, type: 'approvalSubmitted' });
        agentInput.onEvent({ requestId: 41, state: 'waitingForInput', type: 'approvalResolved' });
        expect(() => run.sendAgentMessage('still blocked')).toThrow('pending approval');
        agentInput.onEvent({ requestId: 42, state: 'running', type: 'approvalResolved' });
        await run.sendAgentMessage('next');
        agentCompletion.resolve();
        await run.completion;

        expect(answerApproval).toHaveBeenCalledWith('agent-run', 41, 'accept');
        expect(sendMessage).toHaveBeenCalledWith('agent-run', 'next');
        expect(events.filter(({ update }) => update?.kind === 'agentApproval')).toHaveLength(2);
        expect(events).toContainEqual(expect.objectContaining({
            status: 'waitingForInput',
            update: { kind: 'agentApprovalResolved', requestId: 41 },
        }));
        expect(events).toContainEqual(expect.objectContaining({
            status: 'running',
            update: { kind: 'agentApprovalResolved', requestId: 42 },
        }));
    });

    it('resolves direct and queued streaming prompts against active linked worktree', async () => {
        const agentCompletion = deferred();
        const agentStarted = deferred();
        const sendMessage = vi.fn(async () => undefined);
        const agentRunnerService = {
            sendMessage,
            stop: vi.fn(),
        };
        let agentInput;
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                agentInput = input;
                input.onActiveRunChange('agent-run');
                agentStarted.resolve();
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const worktreeProject = { branch: 'feature', rootPath: 'C:/worktrees/2' };
        const actionWorktreeRunService = {
            execute: vi.fn(async (_primaryProject, _action, _context, runner) => ({
                ...await runner(worktreeProject),
                branch: worktreeProject.branch,
                repositoryRoot: worktreeProject.rootPath,
                runWorktree: 2,
            })),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', streaming: true, type: 'agent' });
        const { events, run } = createRun(rootAction, { actionWorktreeRunService, agentExecutor, agentRunnerService });
        await agentStarted.promise;

        await run.sendAgentMessage('Direct {{worktree-folder}} {{repository-folder}} {{card-file}} {{card-prompt}} {{unknown}}');
        const entry = await run.enqueueAgentPrompt('Queued {{worktree-folder}} {{card-file}}');
        await expect(run.enqueueAgentPrompt('Broken {{card-title}}')).rejects.toThrow('without a card title');
        expect(events).toContainEqual(expect.objectContaining({update: { entry, kind: 'agentPromptQueued' }}));
        agentInput.onEvent({ state: 'waitingForInput', type: 'state' });
        await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));

        expect(sendMessage).toHaveBeenCalledWith('agent-run', 'Direct C:/worktrees/2 C:/repo design/card.md  {{unknown}}');
        expect(sendMessage).toHaveBeenCalledWith('agent-run', 'Queued C:/worktrees/2 design/card.md');

        agentCompletion.resolve();
        await run.completion;
        expect(run.activeAgentProject).toBeNull();
    });

    it('releases first queued prompt after matching question dismissal', async () => {
        const agentCompletion = deferred();
        const agentStarted = deferred();
        const sendMessage = vi.fn(async () => undefined);
        let agentInput;
        const dismissQuestions = vi.fn(async (_runId, requestId) => {
            const event = {
                content: '',
                id: 'dismissed-1',
                kind: 'event',
                label: 'Questions dismissed',
                status: 'completed',
                timestamp: 'now',
                type: 'questionsDismissed',
            };
            agentInput.onEvent({ event, requestId, state: 'running', type: 'questionDismissed' });
        });
        const agentRunnerService = { dismissQuestions, sendMessage, stop: vi.fn() };
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                agentInput = input;
                input.onActiveRunChange('agent-run');
                agentStarted.resolve();
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', streaming: true, type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await agentStarted.promise;
        agentInput.onEvent({ state: 'waitingForInput', type: 'state' });
        agentInput.onEvent({ questions: [{ id: 'confirm', question: 'Proceed?' }], requestId: 7, type: 'question' });
        await run.enqueueAgentPrompt('Continue differently');
        await Promise.resolve();
        expect(sendMessage).not.toHaveBeenCalled();

        await run.dismissAgentQuestions(7);
        await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith('agent-run', 'Continue differently'));

        expect(dismissQuestions).toHaveBeenCalledWith('agent-run', 7);
        expect(events).toContainEqual(expect.objectContaining({
            status: 'running',
            update: expect.objectContaining({ kind: 'agentQuestionDismissed', requestId: 7 }),
        }));
        agentInput.onEvent({ questions: [{ id: 'next', question: 'Next?' }], requestId: 8, type: 'question' });
        agentInput.onEvent({
            type: 'userMessage',
            userMessage: { content: 'Continue differently', id: 'message-1', kind: 'message', role: 'user', timestamp: 'now' },
        });
        await run.enqueueAgentPrompt('Wait for next answer');
        await Promise.resolve();
        expect(run.activeAgentQuestion).toBe(true);
        expect(run.activeAgentQuestionRequestId).toBe(8);
        expect(sendMessage).toHaveBeenCalledOnce();
        agentCompletion.resolve();
        await run.completion;
    });

    it('runs a queued one-shot follow-up before action completion', async () => {
        const firstCompletion = deferred();
        const firstResult = {
            agent: 'codex', changedPaths: ['first.ts'], conversationId: 'conversation', exitCode: 0,
            model: 'gpt', prompt: 'run', reference: 'run.json',
            stderr: 'first error', stdout: 'first output', thinkingLevel: 'none',
        };
        const secondResult = {
            ...firstResult,
            changedPaths: ['second.ts'],
            prompt: 'follow up',
            stderr: 'second error',
            stdout: 'second output',
        };
        const agentExecutor = {
            execute: vi.fn()
                .mockImplementationOnce(async (input) => {
                    input.onActiveRunChange('agent-run-1');
                    await firstCompletion.promise;
                    input.onActiveRunChange(null);

                    return firstResult;
                })
                .mockResolvedValueOnce(secondResult),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor });
        await vi.waitFor(() => expect(agentExecutor.execute).toHaveBeenCalledOnce());
        await run.enqueueAgentPrompt('follow up');
        firstCompletion.resolve();

        await run.completion;

        expect(agentExecutor.execute).toHaveBeenCalledTimes(2);
        expect(agentExecutor.execute.mock.calls[1][0].runInput).toMatchObject({
            continueFrom: 'run.json',
            prompt: 'follow up',
        });
        expect(events.findLast(({ type }) => type === 'action')).toMatchObject({ status: 'completed' });
    });

    it('edits, deletes, and dispatches several one-shot prompts once in FIFO order', async () => {
        const firstCompletion = deferred();
        const result = {
            agent: 'codex', changedPaths: [], conversationId: 'conversation', exitCode: 0,
            model: 'gpt', prompt: 'run', reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
        };
        const agentExecutor = {
            execute: vi.fn()
                .mockImplementationOnce(async (input) => {
                    input.onActiveRunChange('agent-run-1');
                    await firstCompletion.promise;
                    input.onActiveRunChange(null);

                    return result;
                })
                .mockResolvedValue({ ...result, reference: 'continued.json' }),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', type: 'agent' });
        const { run } = createRun(rootAction, { agentExecutor });
        await vi.waitFor(() => expect(agentExecutor.execute).toHaveBeenCalledOnce());
        const first = await run.enqueueAgentPrompt('First');
        const second = await run.enqueueAgentPrompt('Second');
        await run.enqueueAgentPrompt('Third');
        const editedSecond = await run.editQueuedAgentPrompt(second.id, second.revision, 'Edited second');
        await expect(run.editQueuedAgentPrompt(second.id, second.revision, 'Stale edit')).rejects.toThrow('changed before operation');
        expect(() => run.editQueuedAgentPrompt(first.id, first.revision, '   ')).toThrow('cannot be empty');
        await run.deleteQueuedAgentPrompt(first.id, first.revision);
        firstCompletion.resolve();

        await run.completion;

        expect(editedSecond).toMatchObject({ content: 'Edited second', revision: 1 });
        expect(agentExecutor.execute).toHaveBeenCalledTimes(3);
        expect(agentExecutor.execute.mock.calls.slice(1).map(([input]) => input.runInput.prompt))
            .toEqual(['Edited second', 'Third']);
    });

    it('drains prompts queued before streaming completion through ordered continuations', async () => {
        const firstCompletion = deferred();
        const firstStarted = deferred();
        const finalCompletion = deferred();
        const finalStarted = deferred();
        const firstResult = {
            agent: 'claude', changedPaths: ['first.ts'], conversationId: 'conversation', exitCode: 0,
            model: 'claude', prompt: 'run', reference: 'first.json', stderr: 'first error', stdout: 'first output',
            thinkingLevel: 'none',
        };
        const secondResult = {
            ...firstResult,
            changedPaths: ['second.ts'],
            prompt: 'First follow-up',
            reference: 'second.json',
            stderr: 'second error',
            stdout: 'second output',
        };
        const finalResult = {
            ...firstResult,
            changedPaths: ['final.ts'],
            prompt: 'Second follow-up',
            reference: 'final.json',
            stderr: 'final error',
            stdout: 'final output',
        };
        let firstInput;
        const agentExecutor = {
            execute: vi.fn()
                .mockImplementationOnce(async (input) => {
                    firstInput = input;
                    input.onActiveRunChange('agent-run-1');
                    firstStarted.resolve();
                    await firstCompletion.promise;
                    input.onActiveRunChange(null);

                    return firstResult;
                })
                .mockImplementationOnce(async (input) => {
                    input.onActiveRunChange('agent-run-2');
                    input.onActiveRunChange(null);

                    return secondResult;
                })
                .mockImplementationOnce(async (input) => {
                    input.onActiveRunChange('agent-run-3');
                    finalStarted.resolve();
                    await finalCompletion.promise;
                    input.onActiveRunChange(null);

                    return finalResult;
                }),
        };
        const agentRunnerService = { sendMessage: vi.fn(), stop: vi.fn() };
        const rootAction = action('main', { agent: 'claude', model: 'claude', prompt: 'run', streaming: true, type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await firstStarted.promise;
        firstInput.onEvent({ approval: { requestId: 41 }, type: 'approval' });
        const firstEntryPromise = run.enqueueAgentPrompt('First follow-up');
        const secondEntryPromise = run.enqueueAgentPrompt('Second follow-up');
        firstCompletion.resolve();
        const [firstEntry, secondEntry] = await Promise.all([firstEntryPromise, secondEntryPromise]);
        await finalStarted.promise;

        expect(agentExecutor.execute).toHaveBeenCalledTimes(3);
        expect(agentExecutor.execute.mock.calls.slice(1).map(([input]) => input.runInput)).toMatchObject([
            { continueFrom: 'first.json', prompt: 'First follow-up' },
            { continueFrom: 'second.json', prompt: 'Second follow-up' },
        ]);
        expect(agentRunnerService.sendMessage).not.toHaveBeenCalled();
        const removedPromptIds = events
            .filter(({ update }) => update?.kind === 'agentPromptRemoved')
            .map(({ update }) => update.promptId);
        expect(removedPromptIds).toEqual([firstEntry.id, secondEntry.id]);
        expect(events).not.toContainEqual(expect.objectContaining({ status: 'completed', type: 'action' }));
        expect(events).not.toContainEqual(expect.objectContaining({ status: 'completed', type: 'run' }));

        finalCompletion.resolve();
        await expect(run.completion).resolves.toMatchObject({ status: 'completed' });

        const lastRemovalIndex = events.findLastIndex(({ update }) => update?.kind === 'agentPromptRemoved');
        const actionCompletionIndex = events.findIndex(({ status, type }) => status === 'completed' && type === 'action');
        const runCompletionIndex = events.findIndex(({ status, type }) => status === 'completed' && type === 'run');
        expect(actionCompletionIndex).toBeGreaterThan(lastRemovalIndex);
        expect(runCompletionIndex).toBeGreaterThan(actionCompletionIndex);
        await expect(run.enqueueAgentPrompt('Too late')).rejects.toThrow('no longer accepts');
    });

    it('fails a streaming queued continuation once and discards later prompts', async () => {
        const firstCompletion = deferred();
        const firstStarted = deferred();
        const followUpCompletion = deferred();
        const followUpStarted = deferred();
        const firstResult = {
            agent: 'claude', conversationId: 'conversation', exitCode: 0, model: 'claude', prompt: 'run',
            reference: 'first.json', stderr: '', stdout: '', thinkingLevel: 'none',
        };
        let firstInput;
        const agentExecutor = {
            execute: vi.fn()
                .mockImplementationOnce(async (input) => {
                    firstInput = input;
                    input.onActiveRunChange('agent-run-1');
                    firstStarted.resolve();
                    await firstCompletion.promise;
                    input.onActiveRunChange(null);

                    return firstResult;
                })
                .mockImplementationOnce(async (input) => {
                    input.onEvent({ approval: { requestId: 42 }, type: 'approval' });
                    input.onActiveRunChange('agent-run-2');
                    followUpStarted.resolve();
                    await followUpCompletion.promise;
                    input.onActiveRunChange(null);

                    return { ...firstResult, exitCode: 1, prompt: 'First follow-up', stderr: 'failed' };
                }),
        };
        const agentRunnerService = { sendMessage: vi.fn(), stop: vi.fn() };
        const rootAction = action('main', { agent: 'claude', model: 'claude', prompt: 'run', streaming: true, type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await firstStarted.promise;
        firstInput.onEvent({ approval: { requestId: 41 }, type: 'approval' });
        const firstEntry = await run.enqueueAgentPrompt('First follow-up');
        const laterEntry = await run.enqueueAgentPrompt('Later follow-up');
        firstCompletion.resolve();
        await followUpStarted.promise;

        expect(events.filter(({ update }) => update?.kind === 'agentPromptRemoved'))
            .toEqual([expect.objectContaining({ update: expect.objectContaining({ promptId: firstEntry.id }) })]);
        followUpCompletion.resolve();
        await expect(run.completion).resolves.toMatchObject({ status: 'failed' });

        expect(agentExecutor.execute).toHaveBeenCalledTimes(2);
        expect(agentExecutor.execute.mock.calls[1][0].runInput).toMatchObject({
            continueFrom: 'first.json',
            prompt: 'First follow-up',
        });
        expect(agentRunnerService.sendMessage).not.toHaveBeenCalled();
        expect(events.filter(({ update }) => update?.kind === 'agentPromptRemoved').map(({ update }) => update.promptId))
            .toEqual([firstEntry.id, laterEntry.id]);
    });

    it('drains streaming prompts once in FIFO order after pending approval clears', async () => {
        const agentCompletion = deferred();
        const agentStarted = deferred();
        const sendCompletions = [deferred(), deferred(), deferred()];
        const deliveredPrompts = [];
        let activeWrites = 0;
        let maximumActiveWrites = 0;
        const sendMessage = vi.fn(async (_runId, prompt) => {
            const sendIndex = deliveredPrompts.length;
            deliveredPrompts.push(prompt);
            activeWrites += 1;
            maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
            await sendCompletions[sendIndex].promise;
            activeWrites -= 1;
        });
        const agentRunnerService = { sendMessage, stop: vi.fn() };
        let agentInput;
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                agentInput = input;
                input.onActiveRunChange('agent-run');
                agentStarted.resolve();
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', streaming: true, type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await agentStarted.promise;
        agentInput.onEvent({ approval: { requestId: 41 }, type: 'approval' });
        const first = await run.enqueueAgentPrompt('First');
        const second = await run.enqueueAgentPrompt('Second');
        expect(sendMessage).not.toHaveBeenCalled();

        agentInput.onEvent({ requestId: 41, state: 'running', type: 'approvalResolved' });
        await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
        expect(sendMessage).toHaveBeenLastCalledWith('agent-run', 'First');
        expect(run.promptQueue.map(({ content }) => content)).toEqual(['Second']);
        expect(run.promptQueue.some(({ id }) => id === first.id)).toBe(false);

        const thirdEntryPromise = run.enqueueAgentPrompt('Third');
        await Promise.resolve();
        expect(sendMessage).toHaveBeenCalledOnce();
        expect(run.promptQueue.map(({ content }) => content)).toEqual(['Second']);

        sendCompletions[0].resolve();
        await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
        expect(sendMessage).toHaveBeenLastCalledWith('agent-run', 'Second');
        expect(run.promptQueue).toEqual([]);

        sendCompletions[1].resolve();
        const third = await thirdEntryPromise;
        await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(3));
        expect(sendMessage).toHaveBeenLastCalledWith('agent-run', 'Third');
        expect(run.promptQueue).toEqual([]);
        sendCompletions[2].resolve();
        await expect(run.editQueuedAgentPrompt(first.id, first.revision, 'Too late')).rejects.toThrow('already sent or removed');

        expect(deliveredPrompts).toEqual(['First', 'Second', 'Third']);
        expect(maximumActiveWrites).toBe(1);
        expect(new Set(deliveredPrompts).size).toBe(3);
        expect(events
            .filter(({ update }) => update?.kind === 'agentPromptRemoved')
            .map(({ update }) => update.promptId))
            .toEqual([first.id, second.id, third.id]);

        agentCompletion.resolve();
        await run.completion;
    });

    it('discards unsent prompts when a streaming run finishes', async () => {
        const agentCompletion = deferred();
        const agentStarted = deferred();
        const agentRunnerService = { finish: vi.fn(), sendMessage: vi.fn(), stop: vi.fn() };
        let agentInput;
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                agentInput = input;
                input.onActiveRunChange('agent-run');
                agentStarted.resolve();
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', streaming: true, type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await agentStarted.promise;
        agentInput.onEvent({ approval: { requestId: 41 }, type: 'approval' });
        const entry = await run.enqueueAgentPrompt('Discard me');

        run.finishAgent();

        expect(agentRunnerService.finish).toHaveBeenCalledWith('agent-run');
        expect(events).toContainEqual(expect.objectContaining({update: { kind: 'agentPromptRemoved', promptId: entry.id, revision: entry.revision }}));
        await expect(run.enqueueAgentPrompt('Too late')).rejects.toThrow('no longer accepts');
        agentCompletion.resolve();
        await run.completion;
    });

    it('rejects autoFinish without card context before provider start', async () => {
        const agentExecutor = { execute: vi.fn() };
        const rootAction = action('main', {
            agent: 'codex',
            autoFinish: { state: 'ready', when: 'card-state' },
            model: 'gpt',
            prompt: 'run',
            streaming: true,
            type: 'agent',
        });
        const { run } = createRun(rootAction, {
            agentExecutor,
            context: { kind: 'project' },
        });
        await expect(run.completion).resolves.toMatchObject({
            failure: expect.stringContaining('requires card context for autoFinish'),
            status: 'failed',
        });
        expect(agentExecutor.execute).not.toHaveBeenCalled();
    });

    it('ignores auto-finish state changes while the configured child is inactive', async () => {
        const commandCompletion = deferred();
        const agentCompletion = deferred();
        const agentStarted = deferred();
        const autoFinishAction = action('stream', {agent: 'codex', autoFinish: { state: 'ready', when: 'card-state' }, model: 'gpt', prompt: 'run', streaming: true, type: 'agent'});
        const rootAction = action('main', { onAfter: [autoFinishAction] });
        const commandRunner = vi.fn(async (_project, command) => {
            await commandCompletion.promise;

            return { command, exitCode: 0, stderr: '', stdout: command };
        });
        const agentRunnerService = { finish: vi.fn(), stop: vi.fn() };
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                input.onActiveRunChange('agent-run');
                agentStarted.resolve();
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const { run } = createRun(rootAction, { agentExecutor, agentRunnerService, commandRunner });
        run.handleCardStateChange('card-1', 'ready');
        commandCompletion.resolve();
        await agentStarted.promise;

        expect(agentRunnerService.finish).not.toHaveBeenCalled();
        run.handleCardStateChange('other-card', 'ready');
        run.handleCardStateChange('card-1', 'design');
        run.handleCardStateChange('card-1', 'ready');
        expect(agentRunnerService.finish).toHaveBeenCalledOnce();
        expect(agentRunnerService.finish).toHaveBeenCalledWith('agent-run');

        agentCompletion.resolve();
        await run.completion;
    });

    it('finishes every matching streaming child in one chain', async () => {
        const firstCompletion = deferred();
        const secondCompletion = deferred();
        const firstAction = action('first', {agent: 'codex', autoFinish: { state: 'ready', when: 'card-state' }, model: 'gpt', prompt: 'run', streaming: true, type: 'agent'});
        const secondAction = action('second', {agent: 'codex', autoFinish: { state: 'ready', when: 'card-state' }, model: 'gpt', prompt: 'run', streaming: true, type: 'agent'});
        const rootAction = action('main', { onAfter: [secondAction], onBefore: [firstAction] });
        const agentRunnerService = { finish: vi.fn(), stop: vi.fn() };
        const completions = [firstCompletion, secondCompletion];
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                const runIndex = agentExecutor.execute.mock.calls.length;
                input.onActiveRunChange(`agent-run-${runIndex}`);
                await completions[runIndex - 1].promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: `conversation-${runIndex}`, exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: `run-${runIndex}.json`, stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const { run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await vi.waitFor(() => expect(agentExecutor.execute).toHaveBeenCalledTimes(1));
        run.handleCardStateChange('card-1', 'ready');
        firstCompletion.resolve();
        await vi.waitFor(() => expect(agentExecutor.execute).toHaveBeenCalledTimes(2));
        run.handleCardStateChange('card-1', 'ready');
        secondCompletion.resolve();
        await run.completion;

        expect(agentRunnerService.finish.mock.calls).toEqual([['agent-run-1'], ['agent-run-2']]);
    });

    it('remembers an auto-finish transition occurring before the active process is ready', async () => {
        const processReady = deferred();
        const agentCompletion = deferred();
        const executorStarted = deferred();
        const agentRunnerService = { finish: vi.fn(), stop: vi.fn() };
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                executorStarted.resolve();
                await processReady.promise;
                input.onActiveRunChange('agent-run');
                await agentCompletion.promise;
                input.onActiveRunChange(null);

                return {
                    agent: 'codex', conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
                };
            }),
        };
        const rootAction = action('stream', {agent: 'codex', autoFinish: { state: 'ready', when: 'card-state' }, model: 'gpt', prompt: 'run', streaming: true, type: 'agent'});
        const { run } = createRun(rootAction, { agentExecutor, agentRunnerService });
        await executorStarted.promise;
        run.handleCardStateChange('card-1', 'ready');
        processReady.resolve();
        await vi.waitFor(() => expect(agentRunnerService.finish).toHaveBeenCalledWith('agent-run'));
        agentCompletion.resolve();

        await run.completion;
    });

    it('publishes nested agent events and terminal metadata', async () => {
        const runningConversation = {
            actionId: 'main', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: null, entries: [],
            hasExplicitTitle: true, id: 'conversation', path: 'run.json', providerSessions: [],
            startedAt: 'now', status: 'running', title: 'Main',
        };
        const completedConversation = { ...runningConversation, completedAt: 'later', status: 'completed' };
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                input.onEvent({ continued: false, conversation: runningConversation, type: 'started' });
                input.onEvent({
                    state: 'waitingForInput',
                    timer: { elapsedMs: 10_000, runningStartedAt: null },
                    type: 'state',
                });
                input.onEvent({ content: 'chunk', entryIndex: 0, messageId: 'assistant-1', sequence: 2, type: 'output' });
                input.onEvent({
                    contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
                    type: 'usage',
                    usage: { cachedInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 4, totalTokens: 10 },
                });
                input.onEvent({
                    entryIndex: 1,
                    event: {
                        content: 'running', id: 'activity-1', label: 'Command', providerItemId: 'command-1',
                        sequence: 3, status: 'inProgress', timestamp: 'now', type: 'commandExecution',
                    },
                    type: 'agentEvent',
                });
                input.onEvent({ conversation: completedConversation, type: 'closed' });

                return {
                    agent: 'codex', exitCode: 0, model: 'gpt', permissionMode: 'ask-for-approval', prompt: 'run',
                    conversationId: 'conversation', reference: 'run.json', stderr: '', stdout: 'done', thinkingLevel: 'high',
                };
            }),
        };
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', type: 'agent' });
        const { events, run } = createRun(rootAction, { agentExecutor });

        await run.completion;

        expect(events).toContainEqual(expect.objectContaining({
            status: 'waitingForInput',
            timer: { elapsedMs: 10_000, runningStartedAt: null },
            type: 'agentState',
        }));
        expect(events).toContainEqual(expect.objectContaining({
            status: 'running',
            type: 'update',
            update: { continued: false, conversation: runningConversation, kind: 'agentStarted' },
        }));
        expect(events).toContainEqual(expect.objectContaining({
            status: 'running',
            type: 'update',
            update: { content: 'chunk', entryIndex: 0, kind: 'agentOutput', messageId: 'assistant-1', sequence: 2 },
        }));
        expect(events).toContainEqual(expect.objectContaining({
            status: 'running',
            type: 'update',
            update: {
                contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
                kind: 'agentUsage',
                usage: { cachedInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 4, totalTokens: 10 },
            },
        }));
        expect(events).toContainEqual(expect.objectContaining({
            status: 'completed',
            type: 'update',
            update: { conversation: completedConversation, kind: 'agentClosed' },
        }));
        expect(events).toContainEqual(expect.objectContaining({
            status: 'running',
            type: 'update',
            update: {
                entryIndex: 1,
                event: expect.objectContaining({ providerItemId: 'command-1', sequence: 3 }),
                kind: 'agentEvent',
            },
        }));
        expect(events).toContainEqual(expect.objectContaining({
            conversationId: 'conversation', permissionMode: 'ask-for-approval', reference: 'run.json',
            runId: 'run-1', status: 'completed', thinkingLevel: 'high', type: 'action',
        }));
    });

    it('commits successful tracked agent paths before writing explicit history metadata', async () => {
        const agentExecutor = {
            execute: vi.fn(async () => ({
                agent: 'codex', changedPaths: ['app/a.ts', 'app/b.ts'], conversation: { id: 'conversation' },
                conversationId: 'conversation', exitCode: 0, model: 'gpt', prompt: 'run', reference: 'run.json',
                stderr: '', stdout: '[wrong wrong123] agent commit', thinkingLevel: 'none',
            })),
        };
        const commitTrackedPaths = vi.fn(async () => 'abcdef3');
        const resolveCommitMetadata = vi.fn(async () => ({
            commit: 'abcdef3456789012345678901234567890123456',
            committedAt: '2026-07-15T10:00:00+00:00',
            filePaths: ['app/a.ts', 'app/b.ts'],
        }));
        const rootAction = action('main', {agent: 'codex', model: 'gpt', prompt: 'run', trackFileChanges: true, type: 'agent'});
        const { run, localGitService } = createRun(rootAction, {
            agentExecutor,
            localGitService: { commitTrackedPaths, resolveCommitMetadata },
        });

        await expect(run.completion).resolves.toMatchObject({ status: 'completed' });

        expect(commitTrackedPaths).toHaveBeenCalledWith('C:/repo', ['app/a.ts', 'app/b.ts'], 'main', run.controller.signal);
        expect(localGitService.appendActionRunHistory.mock.calls[0][2].commits[0]).toMatchObject({
            actionId: 'main', actionName: 'main', commit: 'abcdef3456789012345678901234567890123456',
            filePaths: ['app/a.ts', 'app/b.ts'],
        });
        const record = localGitService.appendAndCommitActionActivity.mock.calls[0][3];
        expect(record).toMatchObject({
            conversationIds: ['conversation'], details: { agent: 'codex', model: 'gpt', thinkingLevel: 'none', type: 'agent' },
            rootConversationId: 'conversation',
        });
        expect(record).not.toHaveProperty('history');
        expect(record.details).not.toHaveProperty('output');
        expect(record.details).not.toHaveProperty('prompt');
    });

    it('groups ordered before, root, matching, and after commits on root history only', async () => {
        const before = action('before');
        const matching = action('matching');
        const after = action('after');
        const rootAction = action('main', {
            on: [{ action: matching, condition: '\\[main' }],
            onAfter: [after],
            onBefore: [before],
        });
        const hashes = { after: 'ddddddd', before: 'aaaaaaa', main: 'bbbbbbb', matching: 'ccccccc' };
        const commandRunner = vi.fn(async (_project, command) => ({command, exitCode: 0, stderr: '', stdout: `[${command} ${hashes[command]}] ${command}`}));
        const localGitService = {
            appendActionRunHistory: vi.fn(async () => []),
            resolveCommitMetadata: vi.fn(async (rootPath, commit) => ({
                commit: commit.padEnd(40, commit[0]), committedAt: `2026-07-15T1${Object.values(hashes).indexOf(commit)}:00:00+00:00`,
                filePaths: [`${rootPath}/${commit}.md`],
            })),
        };
        const actionWorktreeRunService = {
            execute: vi.fn(async (_primaryProject, currentAction, _context, run) => {
                const runProject = { branch: currentAction.id, rootPath: `C:/repo/${currentAction.id}` };

                return { ...await run(runProject), branch: runProject.branch, repositoryRoot: runProject.rootPath };
            }),
        };
        const runValues = createRun(rootAction, { actionWorktreeRunService, commandRunner, localGitService });
        const { run, localGitService: service } = runValues;

        await expect(run.completion).resolves.toMatchObject({ status: 'completed' });

        const record = service.appendAndCommitActionActivity.mock.calls[0][3];
        expect(record.commits.map(({ actionId }) => actionId ?? 'main')).toEqual(['before', 'main', 'matching', 'after']);
        expect(record.commits.every((commit) => !Object.hasOwn(commit, 'repositoryRoot'))).toBe(true);
    });

    it('keeps multiple command summaries once and gives directly started action ownership', async () => {
        const rootAction = action('linked', { label: 'Linked action' });
        const commandRunner = vi.fn(async () => ({
            command: 'linked', exitCode: 0, stderr: '[topic abcdef2] duplicate',
            stdout: '[topic abcdef1] first\n[topic abcdef2] second\n[topic abcdef1] duplicate',
        }));
        const resolveCommitMetadata = vi.fn(async (_rootPath, commit) => ({commit: commit.padEnd(40, commit.at(-1)), committedAt: '2026-07-15T10:00:00+00:00', filePaths: [`${commit}.md`]}));
        const { run, localGitService } = createRun(rootAction, {commandRunner, localGitService: { resolveCommitMetadata }});

        await run.completion;

        const entry = localGitService.appendActionRunHistory.mock.calls[0][2];
        expect(entry.commits.map(({ actionId, actionName, commit }) => ({actionId, actionName, commit}))).toEqual([
            { actionId: 'linked', actionName: 'Linked action', commit: 'abcdef1111111111111111111111111111111111' },
            { actionId: 'linked', actionName: 'Linked action', commit: 'abcdef2222222222222222222222222222222222' },
        ]);
    });

    it('assigns a linked tracked-agent commit to command root history', async () => {
        const trackedAction = action('tracked', {agent: 'codex', model: 'gpt', prompt: 'edit', trackFileChanges: true, type: 'agent'});
        const rootAction = action('main', { onBefore: [trackedAction] });
        const agentExecutor = {execute: vi.fn(async () => ({agent: 'codex', changedPaths: ['app/a.ts'], conversationId: 'tracked-conversation', exitCode: 0, model: 'gpt', prompt: 'edit', stderr: '', stdout: '', thinkingLevel: 'none'}))};
        const localGitService = {
            appendActionRunHistory: vi.fn(async () => []),
            commitTrackedPaths: vi.fn(async () => 'abcdef3'),
            resolveCommitMetadata: vi.fn(async () => ({commit: 'abcdef3456789012345678901234567890123456', committedAt: '2026-07-15T10:00:00+00:00', filePaths: ['app/a.ts']})),
        };
        const { run, localGitService: service } = createRun(rootAction, { agentExecutor, localGitService });

        await run.completion;

        expect(service.appendAndCommitActionActivity).toHaveBeenCalledOnce();
        expect(service.appendAndCommitActionActivity.mock.calls[0][3].commits[0].actionId).toBe('tracked');
    });

    it('stores repeated reported agent commit and matching tracked commit once', async () => {
        const agentExecutor = {
            execute: vi.fn(async () => ({
                agent: 'codex', changedPaths: ['app/a.ts'], conversationId: 'conversation', exitCode: 0, model: 'gpt',
                prompt: 'edit', stderr: 'Commit: abc1234', stdout: 'Commit: abc1234\nCommit: abc1234', thinkingLevel: 'none',
            })),
        };
        const rootAction = action('main', {agent: 'codex', model: 'gpt', prompt: 'edit', trackFileChanges: true, type: 'agent'});
        const localGitService = {
            commitTrackedPaths: vi.fn(async () => 'abc1234'),
            resolveCommitMetadata: vi.fn(async () => ({
                commit: 'abc1234567890123456789012345678901234567', committedAt: '2026-07-15T10:00:00+00:00',
                deletions: 0, filePaths: ['app/a.ts'], filesChanged: 1, insertions: 1,
            })),
        };
        const { run, localGitService: service } = createRun(rootAction, { agentExecutor, localGitService });

        await expect(run.completion).resolves.toMatchObject({ status: 'completed' });

        const record = service.appendAndCommitActionActivity.mock.calls[0][3];
        expect(record.commits).toHaveLength(1);
        expect(record.commits[0].commit).toBe('abc1234567890123456789012345678901234567');
        expect(service.resolveCommitMetadata).toHaveBeenCalledTimes(3);
    });

    it('retains captured commits when a later action fails', async () => {
        const rootAction = action('main', { onAfter: [action('after')] });
        const commandRunner = vi.fn(async (_project, command) => ({
            command, exitCode: command === 'after' ? 1 : 0, stderr: '',
            stdout: `[main ${command === 'main' ? 'aaaaaaa' : 'bbbbbbb'}] ${command}`,
        }));
        const resolveCommitMetadata = vi.fn(async (_rootPath, commit) => ({commit: commit.padEnd(40, commit[0]), committedAt: '2026-07-15T10:00:00+00:00', filePaths: [`${commit}.md`]}));
        const { run, localGitService } = createRun(rootAction, {commandRunner, localGitService: { resolveCommitMetadata }});

        await expect(run.completion).resolves.toMatchObject({ status: 'okButNotAfter' });

        const rootWrite = localGitService.appendActionRunHistory.mock.calls.find((call) => call[1].actionId === 'main');
        expect(rootWrite[2].commits.map(({ actionId }) => actionId)).toEqual(['main', 'after']);
    });

    it('retains before-phase commits on root history when the chain fails before the root action runs', async () => {
        const committing = action('committing');
        const failing = action('failing');
        const rootAction = action('main', { onBefore: [committing, failing] });
        const commandRunner = vi.fn(async (_project, command) => ({
            command, exitCode: command === 'failing' ? 1 : 0, stderr: '',
            stdout: command === 'committing' ? '[main abcdef1] done' : command,
        }));
        const resolveCommitMetadata = vi.fn(async () => ({commit: 'abcdef1234567890123456789012345678901234', committedAt: '2026-07-15T10:00:00+00:00', filePaths: ['done.md']}));
        const { run, localGitService } = createRun(rootAction, {commandRunner, localGitService: { resolveCommitMetadata }});

        await expect(run.completion).resolves.toMatchObject({ status: 'failed' });

        const rootWrite = localGitService.appendActionRunHistory.mock.calls.find((call) => call[1].actionId === 'main');
        expect(rootWrite[2]).toMatchObject({ status: 'failed' });
        expect(rootWrite[2].commits.map(({ actionId }) => actionId)).toEqual(['committing']);
    });

    it('retains command commits completed before cancellation is observed', async () => {
        const commandCompletion = deferred();
        const commandRunner = vi.fn(async () => {
            await commandCompletion.promise;

            return { command: 'main', exitCode: 0, stderr: '', stdout: '[main abcdef1] completed before cancel' };
        });
        const resolveCommitMetadata = vi.fn(async () => ({commit: 'abcdef1234567890123456789012345678901234', committedAt: '2026-07-15T10:00:00+00:00', filePaths: ['done.md']}));
        const { run, localGitService } = createRun(action('main'), {commandRunner, localGitService: { resolveCommitMetadata }});
        run.cancel();
        commandCompletion.resolve();

        await expect(run.completion).resolves.toMatchObject({ status: 'cancelled' });
        expect(localGitService.appendActionRunHistory.mock.calls[0][2].commits).toHaveLength(1);
    });

    it('keeps concurrent run commit accumulators isolated', async () => {
        const rootAction = action('main');
        const createCommandRunner = (commit) => vi.fn(async () => ({command: 'main', exitCode: 0, stderr: '', stdout: `[main ${commit}] run`}));
        const createLocalGitService = () => ({
            appendActionRunHistory: vi.fn(async () => []),
            resolveCommitMetadata: vi.fn(async (_rootPath, commit) => ({commit: commit.padEnd(40, commit[0]), committedAt: '2026-07-15T10:00:00+00:00', filePaths: [`${commit}.md`]})),
        });
        const firstService = createLocalGitService();
        const secondService = createLocalGitService();
        const first = createRun(rootAction, {commandRunner: createCommandRunner('aaaaaaa'), localGitService: firstService});
        const second = createRun(rootAction, {commandRunner: createCommandRunner('bbbbbbb'), localGitService: secondService});

        await Promise.all([first.run.completion, second.run.completion]);

        expect(firstService.appendActionRunHistory.mock.calls[0][2].commits[0].commit).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
        expect(secondService.appendActionRunHistory.mock.calls[0][2].commits[0].commit).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    });

    it.each([
        ['no changed paths', 0, []],
        ['failed turn', 1, ['app/a.ts']],
    ])('does not create tracked commit for %s', async (_label, exitCode, changedPaths) => {
        const agentExecutor = {
            execute: vi.fn(async () => ({
                agent: 'codex', changedPaths, conversation: { id: 'conversation' }, exitCode, model: 'gpt',
                conversationId: 'conversation', prompt: 'run', reference: 'run.json', stderr: '', stdout: '', thinkingLevel: 'none',
            })),
        };
        const commitTrackedPaths = vi.fn(async () => 'abcdef3');
        const rootAction = action('main', {agent: 'codex', model: 'gpt', prompt: 'run', trackFileChanges: true, type: 'agent'});
        const { run } = createRun(rootAction, { agentExecutor, localGitService: { commitTrackedPaths } });

        await run.completion;

        expect(commitTrackedPaths).not.toHaveBeenCalled();
    });

    it('does not commit tracked paths after cancellation', async () => {
        const agentCompletion = deferred();
        const agentExecutor = {
            execute: vi.fn(async () => {
                await agentCompletion.promise;

                return {
                    agent: 'codex', changedPaths: ['app/a.ts'], conversation: { id: 'conversation' }, exitCode: 0,
                    conversationId: 'conversation', model: 'gpt', prompt: 'run', reference: 'run.json', stderr: '', stdout: '',
                    thinkingLevel: 'none',
                };
            }),
        };
        const commitTrackedPaths = vi.fn(async () => 'abcdef3');
        const rootAction = action('main', {agent: 'codex', model: 'gpt', prompt: 'run', trackFileChanges: true, type: 'agent'});
        const { run } = createRun(rootAction, { agentExecutor, localGitService: { commitTrackedPaths } });
        run.cancel();
        agentCompletion.resolve();

        await run.completion;

        expect(commitTrackedPaths).not.toHaveBeenCalled();
    });

    it('fails command continuation with established message', async () => {
        const { commandRunner, run } = createRun(action('main'), {runInput: { continueFrom: 'source.json' }});

        await expect(run.completion).resolves.toMatchObject({failure: 'Conversation continuation requires an agent action', status: 'failed'});
        expect(commandRunner).not.toHaveBeenCalled();
    });

    it('turns history failure into action failure before terminal event', async () => {
        const localGitService = { appendActionRunHistory: vi.fn(async () => { throw new Error('history failed'); }) };
        const { events, run } = createRun(action('main'), { localGitService });

        await expect(run.completion).resolves.toMatchObject({ failure: 'history failed', status: 'failed' });
        expect(events.filter(({ type }) => type === 'action').at(-1)).toMatchObject({ message: 'history failed', status: 'failed' });
    });
});
