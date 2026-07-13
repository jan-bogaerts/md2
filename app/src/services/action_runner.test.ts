import { describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type {
    AgentActionExecutionRequest,
    AgentExecutionResult,
    CommandActionExecutionRequest,
    CommandExecutionResult,
    ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { AgentConversation, AgentRunEvent } from '../data/data_types'
import type { ActionEnvironment, ActionExecutionGateway, ActionRunRecorder } from './action_execution'
import { ActionRunner } from './action_runner'
import type { DesktopConfigValues } from './config_service'

function action(name: string, overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        agent: null,
        appliesTo: null,
        builtin: false,
        command: name,
        description: `${name} description`,
        icon: null,
        id: name,
        label: name,
        model: null,
        name,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        prompt: null,
        sourcePath: `actions/${name}.json`,
        thinkingLevel: null,
        type: 'command',
        ...overrides,
    }
}

const bridge: ElectronActionBridge = {
    appendActionRunHistory: vi.fn(async () => []),
    generateDiff: vi.fn(async () => ({ commit: '', files: [], repositoryRoot: 'C:/repo' })),
    loadActionRunHistory: vi.fn(async () => []),
    openInEditor: vi.fn(async () => {}),
    runAgent: vi.fn(),
    runCommand: vi.fn(),
}
const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }
const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const desktopConfig: DesktopConfigValues = {
    agent: 'codex',
    agentSlotCommand: '',
    agentProfiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }],
    model: '',
    projectLocationMode: 'folder',
}

function commandResult(command: string, overrides: Partial<CommandExecutionResult> = {}): CommandExecutionResult {
    return {
        branch: 'main', command, executionWorktree: null, exitCode: 0,
        repositoryRoot: 'C:/repo', stderr: '', stdout: command, ...overrides,
    }
}

function actionPrompt(request: AgentActionExecutionRequest) {
    if (request.actionId === 'custom prompt') return request.extraInput
    if (request.actionId === 'implement') {
        const prompt = 'implement design/F-010.md'

        return request.extraInput ? `${prompt}\n\n${request.extraInput}` : prompt
    }

    return request.actionId
}

function conversation(request: AgentActionExecutionRequest): AgentConversation {
    const prompt = actionPrompt(request)

    return {
        cardPath: request.context.file as string,
        completedAt: '2026-01-01T00:01:00.000Z',
        continuedFrom: null,
        events: [],
        id: 'agent-1',
        messages: [{ content: prompt, id: 'm1', role: 'stdout', timestamp: '2026-01-01T00:01:00.000Z' }],
        nativeSessionId: null,
        path: '.md2-agent-logs/one.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Agent run',
    }
}

function agentResult(request: AgentActionExecutionRequest, overrides: Partial<AgentExecutionResult> = {}): AgentExecutionResult {
    const prompt = actionPrompt(request)

    return {
        agent: request.agent ?? 'codex',
        branch: 'main',
        command: request.agent ?? 'codex',
        conversation: conversation(request),
        executionWorktree: null,
        exitCode: 0,
        model: request.model ?? 'gpt-5',
        prompt,
        reference: '.md2-agent-logs/one.json',
        repositoryRoot: 'C:/repo',
        runId: 'agent-1',
        stderr: '',
        stdout: prompt,
        thinkingLevel: request.thinkingLevel ?? 'none',
        ...overrides,
    }
}

function createDeferred<T>() {
    let resolveDeferred: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => {
        resolveDeferred = resolve
    })

    return { promise, resolve: resolveDeferred }
}

function noopAgentConversationLinker() {
    return Promise.resolve()
}

function environment(overrides: Partial<ActionEnvironment> = {}): ActionEnvironment {
    return {
        getActionsFolder: () => 'actions',
        getAgentConfig: () => desktopConfig,
        getProject: () => project,
        ...overrides,
    }
}

function executionGateway(overrides: Partial<ActionExecutionGateway> = {}): ActionExecutionGateway {
    return {
        getBridge: () => bridge,
        runAgent: vi.fn(async (_bridge: ElectronActionBridge, request: AgentActionExecutionRequest) => agentResult(request)),
        runCommand: vi.fn(async (_bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => (
            commandResult(request.actionId)
        )),
        ...overrides,
    }
}

function runRecorder(overrides: Partial<ActionRunRecorder> = {}): ActionRunRecorder {
    return {
        appendHistory: vi.fn(async () => []),
        finishRun: vi.fn(),
        linkAgentConversation: vi.fn(async () => undefined),
        loadHistory: vi.fn(async () => []),
        recordAgentRunEvent: vi.fn(),
        startRun: vi.fn(() => 'running-1'),
        ...overrides,
    }
}

function runner(
    commandRunner = vi.fn(async (_bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => (
        commandResult(request.actionId)
    )),
) {
    return new ActionRunner({
        environment: environment(),
        executionGateway: executionGateway({ runCommand: commandRunner }),
        runRecorder: runRecorder(),
    })
}

describe('ActionRunner', () => {
    it('registers a running action for the duration of the run', async () => {
        const commandRun = createDeferred<CommandExecutionResult>()
        const agentRunStarter = vi.fn(() => 'running-1')
        const agentRunFinisher = vi.fn()
        const commandRunner = vi.fn(async () => commandRun.promise)
        const runPromise = new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runCommand: commandRunner }),
            runRecorder: runRecorder({ finishRun: agentRunFinisher, startRun: agentRunStarter }),
        }).run(action('implement'), context)

        expect(agentRunStarter).toHaveBeenCalledWith('implement design/F-010.md')
        expect(agentRunFinisher).not.toHaveBeenCalled()

        commandRun.resolve(commandResult('implement'))
        await runPromise

        expect(agentRunFinisher).toHaveBeenCalledWith('running-1')
    })

    it('sends action identity and context instead of raw command text', async () => {
        const commandRunner = vi.fn(async () => (
            commandResult('run C:/repo design/F-010.md')
        ))
        const result = await runner(commandRunner).run(action('implement', { command: 'run {{rootProjectFolder}} {{file}}' }), context)

        expect(result.status).toBe('completed')
        expect(commandRunner).toHaveBeenCalledWith(bridge, { actionId: 'implement', actionsFolder: 'actions', context, extraInput: '' })
        expect(result.logs[0].command).toBe('run C:/repo design/F-010.md')
    })

    it('runs before, main, matching on actions, and after in deterministic order', async () => {
        const before = action('before')
        const onAction = action('on-action')
        const after = action('after')
        const main = action('main', {
            command: 'main', on: [{ action: onAction, actionId: onAction.id, condition: 'trigger' }],
            onAfter: [after], onBefore: [before],
        })
        const commandRunner = vi.fn(async (_bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => (
            commandResult(request.actionId, { stdout: `${request.actionId} trigger` })
        ))

        const result = await runner(commandRunner).run(main, context)

        expect(result.status).toBe('completed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['before', 'main', 'on-action', 'after'])
        expect(result.logs.map((log) => log.phase)).toEqual(['before', 'main', 'on', 'after'])
    })

    it('runs after when the main action fails and reports the failed status', async () => {
        const after = action('after')
        const main = action('main', { onAfter: [after] })
        const commandRunner = vi.fn(async (_bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => (
            request.actionId === 'main'
                ? commandResult(request.actionId, { exitCode: 2, stderr: 'bad' })
                : commandResult(request.actionId)
        ))

        const result = await runner(commandRunner).run(main, context)

        expect(result.status).toBe('failed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['main', 'after'])
        expect(result.logs[0].message).toContain('exit code 2')
    })

    it('does not run on actions when the output does not match', async () => {
        const onAction = action('on-action')
        const main = action('main', { on: [{ action: onAction, actionId: onAction.id, condition: 'trigger' }] })

        const result = await runner().run(main, context)

        expect(result.status).toBe('completed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['main'])
    })

    it('rejects circular calls at run time', async () => {
        const cycle = action('cycle')
        cycle.onBefore = [cycle]

        const result = await runner().run(cycle, context)

        expect(result.status).toBe('failed')
        expect(result.logs.map((log) => log.message)).toContain('Circular action call rejected: cycle -> cycle')
    })

    it('sends only action identity, context, and run input for agent actions', async () => {
        const agentRunner = vi.fn(async (
            _bridge: ElectronActionBridge,
            request: AgentActionExecutionRequest,
            onEvent?: (event: AgentRunEvent) => void,
        ) => {
            onEvent?.({ content: '', conversation: conversation(request), runId: 'agent-1', type: 'started' })

            return agentResult(request)
        })
        const agentRunEventRecorder = vi.fn()
        const actionHistoryAppender = vi.fn(async () => [])
        const agentConversationLinker = vi.fn(async () => undefined)
        const result = await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runAgent: agentRunner }),
            runRecorder: runRecorder({
                appendHistory: actionHistoryAppender,
                linkAgentConversation: agentConversationLinker,
                recordAgentRunEvent: agentRunEventRecorder,
            }),
        }).run(action('implement', { command: null, prompt: 'implement {{file}}', type: 'agent' }), context, { extraPrompt: 'focus tests' })

        expect(result.status).toBe('completed')
        expect(agentRunEventRecorder).toHaveBeenCalledWith('design/F-010.md', expect.objectContaining({ type: 'started' }))
        expect(agentConversationLinker).toHaveBeenCalledWith('design/F-010.md', expect.objectContaining({ reference: '.md2-agent-logs/one.json' }))
        expect(agentRunner).toHaveBeenCalledWith(
            bridge,
            {
                actionId: 'implement', actionsFolder: 'actions', context,
                extraInput: 'focus tests',
            },
            expect.any(Function),
        )
        expect(actionHistoryAppender).toHaveBeenCalledWith(
            bridge,
            { actionId: 'implement', actionsFolder: 'actions', context },
            expect.objectContaining({
                agent: 'codex',
                model: 'gpt-5',
                output: 'implement design/F-010.md\n\nfocus tests',
                prompt: 'implement design/F-010.md\n\nfocus tests',
                thinkingLevel: 'none',
            }),
        )
    })

    it('includes agent stderr detail in failed run logs', async () => {
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentActionExecutionRequest) => (
            agentResult(request, { exitCode: 1, stderr: 'spawn missing-agent ENOENT' })
        ))

        const result = await new ActionRunner({
            environment: environment({
                getAgentConfig: () => ({
                    ...desktopConfig,
                    agent: 'missing',
                    agentProfiles: [{ command: 'missing-agent', models: ['missing-model'], name: 'missing' }],
                }),
            }),
            executionGateway: executionGateway({ runAgent: agentRunner }),
            runRecorder: runRecorder({ linkAgentConversation: noopAgentConversationLinker }),
        }).run(action('implement', { command: null, prompt: 'implement', type: 'agent' }), context)

        expect(result.status).toBe('failed')
        expect(result.logs[0].message).toBe('implement failed with exit code 1: spawn missing-agent ENOENT')
    })

    it('forwards only run-specific agent selections for Electron to resolve', async () => {
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentActionExecutionRequest) => agentResult(request))
        const baseRunner = new ActionRunner({
            environment: environment({
                getAgentConfig: () => ({
                    agent: 'codex',
                    agentSlotCommand: '',
                    agentProfiles: [
                        { command: 'codex', modelArgument: '--model', models: ['gpt-5', 'gpt-5-mini'], name: 'codex', sessionIdPattern: 'Session: (.+)' },
                        { command: 'custom --model {{model}}', models: ['fast'], name: 'custom' },
                    ],
                    model: 'gpt-5',
                    projectLocationMode: 'folder',
                }),
            }),
            executionGateway: executionGateway({ runAgent: agentRunner }),
            runRecorder: runRecorder({ linkAgentConversation: noopAgentConversationLinker }),
        })

        await baseRunner.run(action('global', { command: null, prompt: 'run', type: 'agent' }), context)
        await baseRunner.run(action('action', { agent: 'custom', command: null, model: 'fast', prompt: 'run', type: 'agent' }), context)
        await baseRunner.run(action('run', { agent: 'custom', command: null, model: 'fast', prompt: 'run', type: 'agent' }), context, { agent: 'codex', model: 'gpt-5-mini' })

        expect(agentRunner.mock.calls.map((call) => ({ agent: call[1].agent, model: call[1].model }))).toEqual([
            { agent: undefined, model: undefined },
            { agent: undefined, model: undefined },
            { agent: 'codex', model: 'gpt-5-mini' },
        ])
    })

    it('inserts extra prompt text into the prompt placeholder for custom prompt actions', async () => {
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentActionExecutionRequest) => (
            agentResult(request)
        ))
        const result = await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runAgent: agentRunner }),
            runRecorder: runRecorder({ linkAgentConversation: noopAgentConversationLinker }),
        }).run(action('custom prompt', { command: null, prompt: '{{prompt}}', type: 'agent' }), context, { extraPrompt: 'write docs' })

        expect(result.status).toBe('completed')
        expect(agentRunner).toHaveBeenCalledWith(
            bridge,
            { actionId: 'custom prompt', actionsFolder: 'actions', context, extraInput: 'write docs' },
            expect.any(Function),
        )
    })

    it('runs agent actions through before, on and after chains', async () => {
        const before = action('before')
        const onAction = action('on-action')
        const after = action('after')
        const main = action('main', {
            command: null, on: [{ action: onAction, actionId: onAction.id, condition: 'trigger' }],
            onAfter: [after], onBefore: [before], prompt: 'main', type: 'agent',
        })
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentActionExecutionRequest) => (
            agentResult(request, { stdout: `${actionPrompt(request)} trigger` })
        ))
        const commandRunner = vi.fn(async (_bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => (
            commandResult(request.actionId)
        ))

        const result = await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runAgent: agentRunner, runCommand: commandRunner }),
            runRecorder: runRecorder({ linkAgentConversation: noopAgentConversationLinker }),
        }).run(main, context)

        expect(result.status).toBe('completed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['before', 'main', 'on-action', 'after'])
        expect(result.logs.map((log) => log.phase)).toEqual(['before', 'main', 'on', 'after'])
    })

    it('applies run-specific thinking level only to requested root action', async () => {
        const before = action('before', { command: null, prompt: 'before', thinkingLevel: 'low', type: 'agent' })
        const onAction = action('on-action', { command: null, prompt: 'on', thinkingLevel: 'medium', type: 'agent' })
        const after = action('after', { command: null, prompt: 'after', thinkingLevel: 'max', type: 'agent' })
        const main = action('main', {
            command: null,
            on: [{ action: onAction, actionId: onAction.id, condition: 'trigger' }],
            onAfter: [after],
            onBefore: [before],
            prompt: 'main',
            thinkingLevel: 'none',
            type: 'agent',
        })
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentActionExecutionRequest) => (
            agentResult(request, { stdout: request.actionId === 'main' ? 'trigger' : request.actionId })
        ))

        await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runAgent: agentRunner }),
            runRecorder: runRecorder({ linkAgentConversation: noopAgentConversationLinker }),
        }).run(main, context, { thinkingLevel: 'high' })

        expect(agentRunner.mock.calls.map((call) => ({ actionId: call[1].actionId, thinkingLevel: call[1].thinkingLevel }))).toEqual([
            { actionId: 'before', thinkingLevel: undefined },
            { actionId: 'main', thinkingLevel: 'high' },
            { actionId: 'on-action', thinkingLevel: undefined },
            { actionId: 'after', thinkingLevel: undefined },
        ])
    })

    it('loads agent run history for the same action and context', async () => {
        const history = [{ completedAt: '2026-07-05T10:00:00.000Z', output: 'done', prompt: 'run', status: 'completed' as const }]
        const actionHistoryLoader = vi.fn(async () => history)
        const entries = await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway(),
            runRecorder: runRecorder({ loadHistory: actionHistoryLoader }),
        }).loadHistory(action('implement', { type: 'agent' }), context)

        expect(entries).toEqual(history)
        expect(actionHistoryLoader).toHaveBeenCalledWith(bridge, { actionId: 'implement', actionsFolder: 'actions', context })
    })

    it('stores commit metadata when a command action reports a commit', async () => {
        const actionHistoryAppender = vi.fn(async () => [])
        const commandRunner = vi.fn(async () => (
            commandResult('git commit', { stdout: '[main a1b2c3d] Implement feature\n 1 file changed' })
        ))
        const result = await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runCommand: commandRunner }),
            runRecorder: runRecorder({ appendHistory: actionHistoryAppender }),
        }).run(action('commit', { command: 'git commit' }), context)

        expect(result.status).toBe('completed')
        expect(actionHistoryAppender).toHaveBeenCalledWith(
            bridge,
            { actionId: 'commit', actionsFolder: 'actions', context },
            expect.objectContaining({
                command: 'git commit',
                commit: {
                    actionId: 'commit',
                    branch: 'main',
                    commit: 'a1b2c3d',
                    completedAt: expect.any(String),
                    filePaths: ['design/F-010.md'],
                    repositoryRoot: 'C:/repo',
                },
            }),
        )
    })

    it('does not store history for a command action without a commit', async () => {
        const actionHistoryAppender = vi.fn(async () => [])
        await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runCommand: vi.fn(async () => commandResult('npm run build')) }),
            runRecorder: runRecorder({ appendHistory: actionHistoryAppender, linkAgentConversation: noopAgentConversationLinker }),
        }).run(action('build', { command: 'npm run build' }), context)

        expect(actionHistoryAppender).not.toHaveBeenCalled()
    })

    it('attaches commit metadata to an agent run that reports a commit', async () => {
        const actionHistoryAppender = vi.fn(async () => [])
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentActionExecutionRequest) => (
            agentResult(request, { stdout: 'done\n[feature/x 0f1e2d3c4b5a] Add tests' })
        ))
        await new ActionRunner({
            environment: environment(),
            executionGateway: executionGateway({ runAgent: agentRunner }),
            runRecorder: runRecorder({ appendHistory: actionHistoryAppender, linkAgentConversation: noopAgentConversationLinker }),
        }).run(action('implement', { command: null, prompt: 'implement', type: 'agent' }), context)

        expect(actionHistoryAppender).toHaveBeenCalledWith(
            bridge,
            { actionId: 'implement', actionsFolder: 'actions', context },
            expect.objectContaining({ commit: expect.objectContaining({ branch: 'feature/x', commit: '0f1e2d3c4b5a' }) }),
        )
    })

    it('converts prompt input to a reusable action json file', async () => {
        const actionWriter = vi.fn(async (path: string, content: string) => {
            void path
            void content
        })
        const result = await new ActionRunner({
            actionWriter,
            environment: environment(),
            executionGateway: executionGateway(),
            runRecorder: runRecorder(),
        }).convertPromptToAction({ context, label: 'Review Feature', prompt: 'review {{file}}' })

        expect(result.path).toBe('actions/review-feature.json')
        expect(actionWriter).toHaveBeenCalledWith('actions/review-feature.json', expect.stringContaining('"name": "review-feature"'))
        expect(JSON.parse(actionWriter.mock.calls[0][1])).toEqual({
            appliesTo: { type: 'feature' },
            description: 'Custom prompt action: Review Feature',
            id: expect.any(String),
            label: 'Review Feature',
            name: 'review-feature',
            prompt: 'review {{file}}',
            type: 'agent',
        })
    })
})
