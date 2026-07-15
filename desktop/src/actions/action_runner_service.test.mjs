import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { ActionRunnerService, validateStartRequest } = require('./action_runner_service')

const context = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }
const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

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
    }
}

function createDeferred() {
    let resolveDeferred = () => undefined
    const promise = new Promise((resolve) => {
        resolveDeferred = resolve
    })

    return { promise, resolve: resolveDeferred }
}

function createRunner(actionFiles, overrides = {}) {
    const localGitService = {
        appendActionRunHistory: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => actionFiles),
        loadAgentConversation: vi.fn(async () => ({
            cardPath: context.file,
            messages: [{ content: 'prior output', role: 'stdout' }],
            nativeSessionId: null,
        })),
    }
    const commandRunner = vi.fn(async (_project, command) => ({ command, exitCode: 0, stderr: '', stdout: command }))
    const agentRunnerService = {
        sendInput: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
    }
    const runner = new ActionRunnerService({
        actionWorktreeExecutionService: {
            execute: vi.fn(async (primaryProject, _action, _context, execute) => ({
                ...await execute(primaryProject),
                branch: primaryProject.branch,
                executionWorktree: null,
                repositoryRoot: primaryProject.rootPath,
            })),
        },
        agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
        agentRunnerService,
        commandRunner,
        localGitService,
        ...overrides,
    })
    runner.startProject(project, 'actions')

    return { agentRunnerService, commandRunner, localGitService, runner }
}

async function runToCompletion(runner, request = { actionId: 'main', context, runInput: {} }) {
    const executionId = await runner.start(request)

    return runner.wait(executionId)
}

describe('validateStartRequest', () => {
    it.each([
        [{ actionId: 'main', command: 'whoami', context, runInput: {} }, 'command'],
        [{ actionId: 'main', context, runInput: { prompt: 'ignore persisted prompt' } }, 'prompt'],
        [{ actionId: 'main', context, onBefore: ['other'], runInput: {} }, 'onBefore'],
    ])('rejects renderer executable field %#', (request, fieldName) => {
        expect(() => validateStartRequest(request)).toThrow(fieldName)
    })
})

describe('ActionRunnerService', () => {
    it('runs a project-wide agent action without a card path', async () => {
        const files = [actionFile('main', {
            agent: 'codex', command: undefined, model: 'GPT 5.5', prompt: '{{prompt}}', type: 'agent',
        })]
        const { agentRunnerService, runner } = createRunner(files)
        agentRunnerService.start.mockImplementation(async (_project, request, _onEvent, onComplete) => {
            onComplete(0, { conversation: { id: 'project-run' }, reference: 'project-run.json', stderr: '', stdout: '' })

            return { runId: 'project-run' }
        })

        const result = await runToCompletion(runner, {
            actionId: 'main', context: { kind: 'project' }, runInput: { extraPrompt: 'Review project' },
        })

        expect(result.status).toBe('completed')
        expect(agentRunnerService.start).toHaveBeenCalledWith(project, expect.objectContaining({
            prompt: 'Review project', scopePath: 'project',
        }), expect.any(Function), expect.any(Function))
        expect(agentRunnerService.start.mock.calls[0][1]).not.toHaveProperty('cardPath')
    })

    it('reloads and validates definitions before each execution', async () => {
        const { commandRunner, localGitService, runner } = createRunner([actionFile('main')])

        await runToCompletion(runner)
        localGitService.loadActionFiles.mockResolvedValueOnce([actionFile('renamed')])

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Unknown action: main')
        expect(commandRunner).toHaveBeenCalledTimes(1)
        expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2)
    })

    it('rejects unknown persisted fields before process start', async () => {
        const { agentRunnerService, commandRunner, runner } = createRunner([actionFile('main', { needsWorktree: true })])

        await expect(runner.start({ actionId: 'main', context, runInput: {} }))
            .rejects.toThrow('Unknown action field needsWorktree')
        expect(commandRunner).not.toHaveBeenCalled()
        expect(agentRunnerService.start).not.toHaveBeenCalled()
    })

    it('rejects a persisted model removed from current Electron configuration before process start', async () => {
        const files = [actionFile('main', {
            agent: 'custom', command: undefined, model: 'retired-model', prompt: 'Run {{file}}', type: 'agent',
        })]
        const agentConfigProvider = () => ({
            agent: 'custom', agentProfiles: [{ command: 'custom', models: ['current-model'], name: 'custom' }], model: 'current-model',
        })
        const { agentRunnerService, runner } = createRunner(files, { agentConfigProvider })

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Unknown model')
        expect(agentRunnerService.start).not.toHaveBeenCalled()
    })

    it.each([
        ['model', { model: 'retired-model' }, 'Unknown model'],
        ['thinking level', { thinkingLevel: 'extreme' }, 'Invalid thinking level'],
    ])('blocks an invalid runtime %s override before process start', async (_label, runInput, expectedError) => {
        const files = [actionFile('main', {
            agent: 'codex', command: undefined, model: 'GPT 5.5', prompt: 'Run {{file}}', type: 'agent',
        })]
        const { agentRunnerService, runner } = createRunner(files)

        const result = await runToCompletion(runner, { actionId: 'main', context, runInput })

        expect(result).toMatchObject({ failure: expect.stringContaining(expectedError), status: 'failed' })
        expect(agentRunnerService.start).not.toHaveBeenCalled()
    })

    it('runs before, main, matching on, and after in configured order', async () => {
        const files = [
            actionFile('before'),
            actionFile('main', { on: [{ actionId: 'matched', condition: 'main' }], onAfter: ['after'], onBefore: ['before'] }),
            actionFile('matched'),
            actionFile('after'),
        ]
        const { commandRunner, runner } = createRunner(files)
        const events = []
        runner.subscribe((event) => events.push(event))

        const result = await runToCompletion(runner)

        expect(result.status).toBe('completed')
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['before', 'main', 'matched', 'after'])
        expect(events.filter((event) => event.type === 'action' && event.status === 'completed').map((event) => ({
            actionId: event.actionId,
            phase: event.phase,
        }))).toEqual([
            { actionId: 'before', phase: 'before' },
            { actionId: 'main', phase: 'main' },
            { actionId: 'matched', phase: 'on' },
            { actionId: 'after', phase: 'after' },
        ])
        for (const event of events) expect(event.context).toStrictEqual(context)
    })

    it('resolves the Remarkable conversion builtin through the definition registry', async () => {
        const { agentRunnerService, runner } = createRunner([])
        agentRunnerService.start.mockImplementation(async (_project, request, _onEvent, onComplete) => {
            onComplete(0, {
                conversation: { id: 'remarkable' }, reference: '.md2-agent-logs/remarkable.json', stderr: '', stdout: '',
            })

            return { runId: 'remarkable' }
        })

        const result = await runToCompletion(runner, {
            actionId: 'md2.convert-remarkable-images-to-text',
            context,
            runInput: { extraPrompt: '- image.png' },
        })

        expect(result.status).toBe('completed')
        expect(agentRunnerService.start).toHaveBeenCalledWith(project, expect.objectContaining({
            prompt: expect.stringContaining('- image.png'),
        }), expect.any(Function), expect.any(Function))
    })

    it('resolves the worktree independently for every linked action', async () => {
        const files = [
            actionFile('before'),
            actionFile('main', { needsWorkTree: true, onAfter: ['after'], onBefore: ['before'] }),
            actionFile('after'),
        ]
        const execute = vi.fn(async (primaryProject, _action, _context, run) => ({
            ...await run(primaryProject),
            branch: primaryProject.branch,
            executionWorktree: null,
            repositoryRoot: primaryProject.rootPath,
        }))
        const { runner } = createRunner(files, { actionWorktreeExecutionService: { execute } })

        const result = await runToCompletion(runner)

        expect(result.status).toBe('completed')
        expect(execute.mock.calls.map((call) => call[1].id)).toEqual(['before', 'main', 'after'])
        for (const call of execute.mock.calls) expect(call[2]).toStrictEqual(context)
    })

    it.each([
        ['before', { onBefore: ['failure'] }, ['failure'], 'failed'],
        ['main', {}, ['main'], 'failed'],
        ['on', { on: [{ actionId: 'failure', condition: 'main' }] }, ['main', 'failure'], 'failed'],
        ['after', { onAfter: ['failure'] }, ['main', 'failure'], 'okButNotAfter'],
    ])('stops on %s failure with expected root status', async (_phase, rootOverrides, expectedCommands, expectedStatus) => {
        const files = [actionFile('main', rootOverrides), actionFile('failure'), actionFile('later')]
        const commandRunner = vi.fn(async (_project, command) => ({
            command,
            exitCode: command === 'failure' || (_phase === 'main' && command === 'main') ? 1 : 0,
            stderr: '',
            stdout: command,
        }))
        const { runner } = createRunner(files, { commandRunner })

        const result = await runToCompletion(runner)

        expect(result.status).toBe(expectedStatus)
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(expectedCommands)
    })

    it('rejects cycles before starting a process', async () => {
        const { commandRunner, runner } = createRunner([
            actionFile('main', { onBefore: ['linked'] }),
            actionFile('linked', { onAfter: ['main'] }),
        ])

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Circular action reference')
        expect(commandRunner).not.toHaveBeenCalled()
    })

    it('cancels active command and starts no later phase', async () => {
        const commandRun = createDeferred()
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await commandRun.promise
            if (signal.aborted) throw new Error('aborted')

            return { command, exitCode: 0, stderr: '', stdout: command }
        })
        const { runner } = createRunner([actionFile('main', { onAfter: ['after'] }), actionFile('after')], { commandRunner })
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} })

        runner.cancel(executionId)
        commandRun.resolve()
        const result = await runner.wait(executionId)

        expect(result.status).toBe('cancelled')
        expect(commandRunner).toHaveBeenCalledTimes(1)
    })

    it('cancels active agent through one execution id', async () => {
        const completion = createDeferred()
        const files = [actionFile('main', { agent: 'codex', command: undefined, model: 'GPT 5.5', prompt: 'Run {{file}}', type: 'agent' })]
        const { agentRunnerService, runner } = createRunner(files)
        agentRunnerService.start.mockImplementation(async (_project, _request, _onEvent, onComplete) => {
            completion.promise.then(() => onComplete(1, {
                conversation: { id: 'agent-1' }, reference: '.md2-agent-logs/one.json', stderr: '', stdout: '',
            }))

            return { runId: 'agent-1' }
        })
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} })
        await vi.waitFor(() => expect(agentRunnerService.start).toHaveBeenCalled())

        runner.cancel(executionId)
        completion.resolve()
        const result = await runner.wait(executionId)

        expect(agentRunnerService.stop).toHaveBeenCalledWith('agent-1')
        expect(result.status).toBe('cancelled')
    })

    it('keeps project and actions-folder snapshot across linked phases and history writes', async () => {
        const firstRun = createDeferred()
        const commandRunner = vi.fn(async (executionProject, command) => {
            if (command === 'main') await firstRun.promise

            return { command, exitCode: 0, stderr: '', stdout: `[main abcdef1] ${command}` }
        })
        const { localGitService, runner } = createRunner([
            actionFile('main', { onAfter: ['after'] }),
            actionFile('after'),
        ], { commandRunner })
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} })
        await vi.waitFor(() => expect(commandRunner).toHaveBeenCalledTimes(1))

        runner.startProject({ branch: 'other', id: 'other', rootPath: 'C:/other' }, 'other-actions')
        firstRun.resolve()
        await runner.wait(executionId)

        expect(commandRunner.mock.calls.map((call) => call[0])).toEqual([project, project])
        expect(localGitService.appendActionRunHistory.mock.calls.map((call) => ({
            actionsFolder: call[1].actionsFolder,
            project: call[0],
        }))).toEqual([
            { actionsFolder: 'actions', project },
            { actionsFolder: 'actions', project },
        ])
    })

    it('writes command history when output has no commit summary', async () => {
        const { localGitService, runner } = createRunner([actionFile('main')])

        await runToCompletion(runner)

        expect(localGitService.appendActionRunHistory).toHaveBeenCalledWith(project, {
            actionId: 'main', actionsFolder: 'actions', context,
        }, {
            command: 'main', completedAt: expect.any(String), output: 'main', prompt: '', status: 'completed',
        })
    })

    it('applies extra prompt only to root action placeholders', async () => {
        const files = [
            actionFile('before', { command: 'before={{prompt}}' }),
            actionFile('main', { command: 'main={{prompt}}', onBefore: ['before'] }),
        ]
        const { commandRunner, runner } = createRunner(files)

        await runToCompletion(runner, { actionId: 'main', context, runInput: { extraPrompt: 'focus' } })

        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['before=', 'main=focus'])
    })

    it('applies appended extra prompt only to root agent prompt', async () => {
        const agentOverrides = { agent: 'codex', command: undefined, model: 'GPT 5.5', type: 'agent' }
        const files = [
            actionFile('before', { ...agentOverrides, prompt: 'before prompt' }),
            actionFile('main', { ...agentOverrides, onBefore: ['before'], prompt: 'main prompt' }),
        ]
        const { agentRunnerService, runner } = createRunner(files)
        agentRunnerService.start.mockImplementation(async (_project, request, _onEvent, onComplete) => {
            onComplete(0, {
                conversation: { id: request.title }, reference: `.md2-agent-logs/${request.title}.json`, stderr: '', stdout: '',
            })

            return { runId: request.title }
        })

        await runToCompletion(runner, { actionId: 'main', context, runInput: { extraPrompt: 'focus' } })

        expect(agentRunnerService.start.mock.calls.map((call) => call[1].prompt)).toEqual([
            'before prompt',
            'main prompt\n\nfocus',
        ])
    })

    it('continues an agent action with native resume in Electron', async () => {
        const files = [actionFile('main', {
            agent: 'resumable', command: undefined, model: 'default', prompt: 'Initial', type: 'agent',
        })]
        const agentConfigProvider = () => ({
            agent: 'resumable',
            agentProfiles: [{
                command: 'agent start', models: ['default'], name: 'resumable', resumeCommand: 'agent resume {{sessionId}}',
            }],
            model: 'default',
        })
        const { agentRunnerService, localGitService, runner } = createRunner(files, { agentConfigProvider })
        localGitService.loadAgentConversation.mockResolvedValueOnce({
            cardPath: context.file, messages: [], nativeSessionId: 'session-1',
        })
        agentRunnerService.start.mockImplementation(async (_project, request, _onEvent, onComplete) => {
            onComplete(0, { conversation: { id: 'continued' }, reference: 'continued.json', stderr: '', stdout: '' })

            return { runId: 'continued' }
        })

        const result = await runToCompletion(runner, {
            actionId: 'main', context, runInput: { continueFrom: '.md2-agent-logs/source.json' },
        })

        expect(result.status).toBe('completed')
        expect(agentRunnerService.start).toHaveBeenCalledWith(project, expect.objectContaining({
            actionId: 'main', command: 'agent resume session-1', continuedFrom: '.md2-agent-logs/source.json',
            nativeResumeSessionId: 'session-1', prompt: 'continue',
        }), expect.any(Function), expect.any(Function))
    })

    it('uses transcript fallback and rejects an unknown continuation reference', async () => {
        const files = [actionFile('main', {
            agent: 'codex', command: undefined, model: 'GPT 5.5', prompt: 'Initial', type: 'agent',
        })]
        const { agentRunnerService, localGitService, runner } = createRunner(files)
        agentRunnerService.start.mockImplementation(async (_project, request, _onEvent, onComplete) => {
            onComplete(0, { conversation: { id: 'continued' }, reference: 'continued.json', stderr: '', stdout: '' })

            return { runId: 'continued' }
        })

        const result = await runToCompletion(runner, {
            actionId: 'main', context, runInput: { continueFrom: '.md2-agent-logs/source.json' },
        })
        expect(result.status).toBe('completed')
        expect(agentRunnerService.start.mock.calls[0][1].prompt).toContain('stdout: prior output')
        expect(agentRunnerService.start.mock.calls[0][1].prompt).toContain('User instruction: continue')

        localGitService.loadAgentConversation.mockRejectedValueOnce(new Error('Agent log not found'))
        const failed = await runToCompletion(runner, {
            actionId: 'main', context, runInput: { continueFrom: '.md2-agent-logs/missing.json' },
        })
        expect(failed).toMatchObject({ failure: 'Agent log not found', status: 'failed' })
    })

    it('isolates listener and completion-callback failures from action result', async () => {
        const listenerError = new Error('listener failed')
        const callbackError = new Error('scheduler failed')
        const errorReporter = vi.fn()
        const actionCompleted = vi.fn(async () => {
            throw callbackError
        })
        const { runner } = createRunner([actionFile('main')], { actionCompleted, errorReporter })
        runner.subscribe(() => {
            throw listenerError
        })

        const result = await runToCompletion(runner)

        expect(result.status).toBe('completed')
        expect(errorReporter).toHaveBeenCalledWith(listenerError)
        expect(errorReporter).toHaveBeenCalledWith(callbackError)
    })

    it.each([
        ['before', { onBefore: ['parent'] }],
        ['on', { on: [{ actionId: 'parent', condition: 'main' }] }],
    ])('reports nested onAfter failure in root %s subtree as failed', async (_phase, rootOverrides) => {
        const files = [
            actionFile('main', rootOverrides),
            actionFile('parent', { onAfter: ['failure'] }),
            actionFile('failure'),
        ]
        const commandRunner = vi.fn(async (_project, command) => ({
            command,
            exitCode: command === 'failure' ? 1 : 0,
            stderr: '',
            stdout: command,
        }))
        const { runner } = createRunner(files, { commandRunner })

        const result = await runToCompletion(runner)

        expect(result.status).toBe('failed')
    })

    it('reports nested failure in root onAfter subtree as okButNotAfter', async () => {
        const files = [
            actionFile('main', { onAfter: ['parent'] }),
            actionFile('parent', { onAfter: ['failure'] }),
            actionFile('failure'),
        ]
        const commandRunner = vi.fn(async (_project, command) => ({
            command,
            exitCode: command === 'failure' ? 1 : 0,
            stderr: '',
            stdout: command,
        }))
        const { runner } = createRunner(files, { commandRunner })

        const result = await runToCompletion(runner)

        expect(result.status).toBe('okButNotAfter')
    })

    it('emits streamed command output before command completion', async () => {
        const completion = createDeferred()
        const commandRunner = vi.fn(async (_project, command, _signal, onOutput) => {
            onOutput({ stderr: '', stdout: 'first chunk' })
            await completion.promise

            return { command, exitCode: 0, stderr: '', stdout: 'first chunk' }
        })
        const { runner } = createRunner([actionFile('main')], { commandRunner })
        const events = []
        runner.subscribe((event) => events.push(event))
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} })

        await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
            status: 'running', stdout: 'first chunk', type: 'action',
        })))
        completion.resolve()
        await runner.wait(executionId)
    })

    it('emits active-action cancellation before root cancellation', async () => {
        const commandRun = createDeferred()
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await commandRun.promise
            if (signal.aborted) throw new Error('aborted')

            return { command, exitCode: 0, stderr: '', stdout: command }
        })
        const { runner } = createRunner([actionFile('main')], { commandRunner })
        const events = []
        runner.subscribe((event) => events.push(event))
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} })

        runner.cancel(executionId)
        commandRun.resolve()
        await runner.wait(executionId)

        expect(events.slice(-2).map((event) => ({ status: event.status, type: event.type }))).toEqual([
            { status: 'cancelled', type: 'action' },
            { status: 'cancelled', type: 'execution' },
        ])
    })

    it.each([
        ['before', { onBefore: ['target'] }, ['target']],
        ['on', { on: [{ actionId: 'target', condition: 'main' }], onAfter: ['later'] }, ['main', 'target']],
        ['after', { onAfter: ['target', 'later'] }, ['main', 'target']],
    ])('cancels active linked %s action and starts no later action', async (phase, rootOverrides, expectedCommands) => {
        const targetRun = createDeferred()
        const commandRunner = vi.fn(async (_project, command, signal) => {
            if (command === 'target') await targetRun.promise
            if (signal.aborted) throw new Error('aborted')

            return { command, exitCode: 0, stderr: '', stdout: command }
        })
        const files = [actionFile('main', rootOverrides), actionFile('target'), actionFile('later')]
        const { runner } = createRunner(files, { commandRunner })
        const events = []
        runner.subscribe((event) => events.push(event))
        const executionId = await runner.start({ actionId: 'main', context, runInput: {} })
        await vi.waitFor(() => expect(commandRunner).toHaveBeenCalledWith(project, 'target', expect.any(AbortSignal), expect.any(Function)))

        runner.cancel(executionId)
        targetRun.resolve()
        const result = await runner.wait(executionId)

        expect(result.status).toBe('cancelled')
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(expectedCommands)
        expect(events).toContainEqual(expect.objectContaining({ actionId: 'target', phase, status: 'cancelled', type: 'action' }))
    })

    it('runs every matching on rule in order and stops after later failure', async () => {
        const files = [
            actionFile('main', { on: [
                { actionId: 'first', condition: 'main' },
                { actionId: 'failure', condition: 'main' },
                { actionId: 'later', condition: 'main' },
            ] }),
            actionFile('first'),
            actionFile('failure'),
            actionFile('later'),
        ]
        const commandRunner = vi.fn(async (_project, command) => ({
            command,
            exitCode: command === 'failure' ? 1 : 0,
            stderr: '',
            stdout: command,
        }))
        const { runner } = createRunner(files, { commandRunner })

        const result = await runToCompletion(runner)

        expect(result.status).toBe('failed')
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['main', 'first', 'failure'])
    })
})
