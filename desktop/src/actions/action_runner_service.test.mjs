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
    it('reloads and validates definitions before each execution', async () => {
        const { commandRunner, localGitService, runner } = createRunner([actionFile('main')])

        await runToCompletion(runner)
        localGitService.loadActionFiles.mockResolvedValueOnce([actionFile('renamed')])

        await expect(runner.start({ actionId: 'main', context, runInput: {} })).rejects.toThrow('Unknown action: main')
        expect(commandRunner).toHaveBeenCalledTimes(1)
        expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2)
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
})
