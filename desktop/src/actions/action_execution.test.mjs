import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { ActionExecution } = require('./action_execution')

const context = { file: 'design/card.md', kind: 'card' }
const project = { branch: 'main', rootPath: 'C:/repo' }

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
    }
}

function deferred() {
    const { promise, resolve } = Promise.withResolvers()

    return { promise, resolve }
}

function createExecution(rootAction, overrides = {}) {
    const events = []
    const localGitService = {
        appendActionRunHistory: vi.fn(async () => []),
        ...overrides.localGitService,
    }
    const commandRunner = overrides.commandRunner ?? vi.fn(async (_project, command, _signal, onOutput) => {
        onOutput({ stderr: '', stdout: `${command}-chunk` })

        return { command, exitCode: 0, stderr: '', stdout: command }
    })
    const actionWorktreeExecutionService = overrides.actionWorktreeExecutionService ?? {
        execute: vi.fn(async (primaryProject, _action, _context, run) => ({
            ...await run(primaryProject),
            branch: primaryProject.branch,
            executionWorktree: null,
            repositoryRoot: primaryProject.rootPath,
        })),
    }
    const agentRunnerService = overrides.agentRunnerService ?? { stop: vi.fn() }
    const agentExecutor = overrides.agentExecutor ?? { execute: vi.fn() }
    const execution = new ActionExecution({
        actionsFolder: 'actions',
        context,
        executionId: 'execution-1',
        project,
        rootAction,
        runInput: { extraPrompt: '', ...overrides.runInput },
    }, {
        actionWorktreeExecutionService,
        agentExecutor,
        agentRunnerService,
        commandRunner,
        localGitService,
        publisher: (event) => events.push(event),
    })
    execution.start((completion) => completion)

    return { actionWorktreeExecutionService, agentRunnerService, commandRunner, events, execution, localGitService }
}

describe('ActionExecution', () => {
    it('runs before, main, every matching on rule, and after in declaration order', async () => {
        const before = action('before')
        const firstMatch = action('first-match')
        const secondMatch = action('second-match')
        const after = action('after')
        const rootAction = action('main', {
            on: [
                { action: firstMatch, condition: 'main' },
                { action: secondMatch, condition: 'main' },
            ],
            onAfter: [after],
            onBefore: [before],
        })
        const { commandRunner, execution } = createExecution(rootAction)

        await expect(execution.completion).resolves.toMatchObject({ status: 'completed' })
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['before', 'main', 'first-match', 'second-match', 'after'])
    })

    it.each([
        ['before', (failure) => action('main', { onBefore: [failure] }), 'failed'],
        ['main', () => action('main'), 'failed'],
        ['on', (failure) => action('main', { on: [{ action: failure, condition: 'main' }] }), 'failed'],
        ['after', (failure) => action('main', { onAfter: [failure] }), 'okButNotAfter'],
        ['nested after', (failure) => action('main', { onAfter: [action('parent', { onAfter: [failure] })] }), 'okButNotAfter'],
    ])('maps %s failure to %s', async (_phase, createRoot, expectedStatus) => {
        const failure = action(_phase === 'main' ? 'main' : 'failure')
        const rootAction = createRoot(failure)
        const commandRunner = vi.fn(async (_project, command) => ({
            command, exitCode: command === failure.id ? 1 : 0, stderr: '', stdout: command,
        }))
        const { execution } = createExecution(rootAction, { commandRunner })

        await expect(execution.completion).resolves.toMatchObject({ status: expectedStatus })
    })

    it.each([
        ['before', (parent) => action('main', { onBefore: [parent] })],
        ['on', (parent) => action('main', { on: [{ action: parent, condition: 'main' }] })],
    ])('keeps nested after failure in root %s subtree failed', async (_phase, createRoot) => {
        const parent = action('parent', { onAfter: [action('failure')] })
        const commandRunner = vi.fn(async (_project, command) => ({
            command, exitCode: command === 'failure' ? 1 : 0, stderr: '', stdout: command,
        }))
        const { execution } = createExecution(createRoot(parent), { commandRunner })

        await expect(execution.completion).resolves.toMatchObject({ status: 'failed' })
    })

    it('resolves worktree independently for each linked action', async () => {
        const rootAction = action('main', { onAfter: [action('after')], onBefore: [action('before')] })
        const { actionWorktreeExecutionService, execution } = createExecution(rootAction)

        await execution.completion

        expect(actionWorktreeExecutionService.execute.mock.calls.map((call) => call[1].id)).toEqual(['before', 'main', 'after'])
    })

    it('applies root run input only to root action', async () => {
        const rootAction = action('main={{prompt}}', {
            id: 'main',
            onBefore: [action('before={{prompt}}', { id: 'before' })],
        })
        const { commandRunner, execution } = createExecution(rootAction, { runInput: { extraPrompt: 'focus' } })

        await execution.completion

        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(['before=', 'main=focus'])
    })

    it('publishes stream, writes history, then publishes terminal action event', async () => {
        const order = []
        const commandRunner = vi.fn(async (_project, command, _signal, onOutput) => {
            onOutput({ stderr: '', stdout: 'chunk' })
            order.push('process')

            return { command, exitCode: 0, stderr: '', stdout: 'done' }
        })
        const localGitService = { appendActionRunHistory: vi.fn(async () => order.push('history')) }
        const events = []
        const execution = new ActionExecution({
            actionsFolder: 'actions', context, executionId: 'execution-1', project,
            rootAction: action('main'), runInput: { extraPrompt: '' },
        }, {
            actionWorktreeExecutionService: {
                execute: async (primaryProject, _action, _context, run) => run(primaryProject),
            },
            agentExecutor: { execute: vi.fn() },
            agentRunnerService: { stop: vi.fn() },
            commandRunner,
            localGitService,
            publisher: (event) => {
                events.push(event)
                if (event.type === 'action') order.push(`${event.status}:${event.stdout ?? ''}`)
            },
        })
        execution.start((completion) => completion)

        await execution.completion

        expect(order).toEqual(['running:', 'running:chunk', 'process', 'history', 'completed:done'])
        expect(events.every((event) => event.context === context)).toBe(true)
    })

    it('cancels active command before root cancellation and starts no later phase', async () => {
        const commandCompletion = deferred()
        const commandRunner = vi.fn(async (_project, command, signal) => {
            await commandCompletion.promise
            if (signal.aborted) throw new Error('aborted')

            return { command, exitCode: 0, stderr: '', stdout: command }
        })
        const { commandRunner: runner, events, execution } = createExecution(
            action('main', { onAfter: [action('after')] }),
            { commandRunner },
        )
        execution.cancel()
        commandCompletion.resolve()

        await expect(execution.completion).resolves.toMatchObject({ status: 'cancelled' })
        expect(runner).toHaveBeenCalledTimes(1)
        expect(events.slice(-2).map(({ status, type }) => ({ status, type }))).toEqual([
            { status: 'cancelled', type: 'action' },
            { status: 'cancelled', type: 'execution' },
        ])
    })

    it.each([
        ['before', { onBefore: [action('target')] }, ['target']],
        ['on', { on: [{ action: action('target'), condition: 'main' }], onAfter: [action('later')] }, ['main', 'target']],
        ['after', { onAfter: [action('target'), action('later')] }, ['main', 'target']],
    ])('cancels linked %s action and starts no later phase', async (phase, rootOverrides, expectedCommands) => {
        const targetCompletion = deferred()
        const commandRunner = vi.fn(async (_project, command, signal) => {
            if (command === 'target') await targetCompletion.promise
            if (signal.aborted) throw new Error('aborted')

            return { command, exitCode: 0, stderr: '', stdout: command }
        })
        const { events, execution } = createExecution(action('main', rootOverrides), { commandRunner })
        await vi.waitFor(() => expect(commandRunner.mock.calls.map((call) => call[1])).toContain('target'))
        execution.cancel()
        targetCompletion.resolve()

        await expect(execution.completion).resolves.toMatchObject({ status: 'cancelled' })
        expect(commandRunner.mock.calls.map((call) => call[1])).toEqual(expectedCommands)
        expect(events).toContainEqual(expect.objectContaining({ actionId: 'target', phase, status: 'cancelled', type: 'action' }))
    })

    it('stops active agent run through cancel', async () => {
        const agentCompletion = deferred()
        const agentRunnerService = { stop: vi.fn() }
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                input.onActiveRunChange('agent-run')
                await agentCompletion.promise
                input.onActiveRunChange(null)

                return {
                    agent: 'codex', conversation: { id: 'conversation' }, exitCode: 1, model: 'gpt', prompt: 'run',
                    reference: 'run.json', runId: 'conversation', stderr: '', stdout: '', thinkingLevel: 'none',
                }
            }),
        }
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', type: 'agent' })
        const { execution } = createExecution(rootAction, { agentExecutor, agentRunnerService })
        await vi.waitFor(() => expect(agentExecutor.execute).toHaveBeenCalled())
        execution.cancel()
        agentCompletion.resolve()

        await execution.completion

        expect(agentRunnerService.stop).toHaveBeenCalledWith('agent-run')
    })

    it('publishes nested agent events and terminal metadata', async () => {
        const agentExecutor = {
            execute: vi.fn(async (input) => {
                input.onEvent({ content: 'chunk', type: 'stdout' })

                return {
                    agent: 'codex', conversation: { id: 'conversation' }, exitCode: 0, model: 'gpt', prompt: 'run',
                    reference: 'run.json', runId: 'conversation', stderr: '', stdout: 'done', thinkingLevel: 'high',
                }
            }),
        }
        const rootAction = action('main', { agent: 'codex', model: 'gpt', prompt: 'run', type: 'agent' })
        const { events, execution } = createExecution(rootAction, { agentExecutor })

        await execution.completion

        expect(events).toContainEqual(expect.objectContaining({
            agentEvent: { content: 'chunk', type: 'stdout' }, status: 'running', type: 'agent',
        }))
        expect(events).toContainEqual(expect.objectContaining({
            conversation: { id: 'conversation' }, reference: 'run.json', runId: 'conversation',
            status: 'completed', thinkingLevel: 'high', type: 'action',
        }))
    })

    it('fails command continuation with established message', async () => {
        const { commandRunner, execution } = createExecution(action('main'), {
            runInput: { continueFrom: 'source.json' },
        })

        await expect(execution.completion).resolves.toMatchObject({
            failure: 'Conversation continuation requires an agent action', status: 'failed',
        })
        expect(commandRunner).not.toHaveBeenCalled()
    })

    it('turns history failure into action failure before terminal event', async () => {
        const localGitService = { appendActionRunHistory: vi.fn(async () => { throw new Error('history failed') }) }
        const { events, execution } = createExecution(action('main'), { localGitService })

        await expect(execution.completion).resolves.toMatchObject({ failure: 'history failed', status: 'failed' })
        expect(events.filter(({ type }) => type === 'action').at(-1)).toMatchObject({ message: 'history failed', status: 'failed' })
    })
})
