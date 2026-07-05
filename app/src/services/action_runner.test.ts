import { describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { AgentExecutionRequest, AgentExecutionResult, CommandExecutionResult, ElectronActionBridge } from '../data/electron_action_bridge'
import { ActionRunner } from './action_runner'

function action(name: string, overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        after: [],
        appliesTo: null,
        before: [],
        builtin: false,
        description: `${name} description`,
        icon: null,
        label: name,
        name,
        on: [],
        onState: null,
        text: name,
        type: 'cmd',
        ...overrides,
    }
}

const bridge: ElectronActionBridge = {
    appendActionRunHistory: vi.fn(async () => []),
    loadActionRunHistory: vi.fn(async () => []),
    runAgent: vi.fn(),
    runCommand: vi.fn(),
}
const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }

function commandResult(command: string, overrides: Partial<CommandExecutionResult> = {}): CommandExecutionResult {
    return { command, exitCode: 0, stderr: '', stdout: command, ...overrides }
}

function agentResult(request: AgentExecutionRequest, overrides: Partial<AgentExecutionResult> = {}): AgentExecutionResult {
    return { command: request.command, exitCode: 0, prompt: request.prompt, stderr: '', stdout: request.prompt, ...overrides }
}

function runner(commandRunner = vi.fn(async (_bridge: ElectronActionBridge, command: string) => commandResult(command))) {
    return new ActionRunner({
        actionsFolderProvider: () => 'actions',
        bridgeProvider: () => bridge,
        commandRunner,
        projectProvider: () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' }),
    })
}

describe('ActionRunner', () => {
    it('resolves rootProjectFolder and file placeholders before running a command', async () => {
        const commandRunner = vi.fn(async (_bridge: ElectronActionBridge, command: string) => commandResult(command))
        const result = await runner(commandRunner).run(action('implement', { text: 'run {{rootProjectFolder}} {{file}}' }), context)

        expect(result.status).toBe('completed')
        expect(commandRunner).toHaveBeenCalledWith(bridge, 'run C:/repo design/F-010.md')
        expect(result.logs[0].command).toBe('run C:/repo design/F-010.md')
    })

    it('runs before, main, matching on actions, and after in deterministic order', async () => {
        const before = action('before')
        const onAction = action('on-action')
        const after = action('after')
        const main = action('main', { after: [after], before: [before], on: [{ action: onAction, condition: 'trigger' }], text: 'main' })
        const commandRunner = vi.fn(async (_bridge: ElectronActionBridge, command: string) => commandResult(command, { stdout: `${command} trigger` }))

        const result = await runner(commandRunner).run(main, context)

        expect(result.status).toBe('completed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['before', 'main', 'on-action', 'after'])
        expect(result.logs.map((log) => log.phase)).toEqual(['before', 'main', 'on', 'after'])
    })

    it('runs after when the main action fails and reports the failed status', async () => {
        const after = action('after')
        const main = action('main', { after: [after] })
        const commandRunner = vi.fn(async (_bridge: ElectronActionBridge, command: string) => (
            command === 'main' ? commandResult(command, { exitCode: 2, stderr: 'bad' }) : commandResult(command)
        ))

        const result = await runner(commandRunner).run(main, context)

        expect(result.status).toBe('failed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['main', 'after'])
        expect(result.logs[0].message).toContain('exit code 2')
    })

    it('does not run on actions when the output does not match', async () => {
        const onAction = action('on-action')
        const main = action('main', { on: [{ action: onAction, condition: 'trigger' }] })

        const result = await runner().run(main, context)

        expect(result.status).toBe('completed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['main'])
    })

    it('rejects circular calls at run time', async () => {
        const cycle = action('cycle')
        cycle.before = [cycle]

        const result = await runner().run(cycle, context)

        expect(result.status).toBe('failed')
        expect(result.logs.map((log) => log.message)).toContain('Circular action call rejected: cycle -> cycle')
    })

    it('runs an agent action with resolved placeholders and extra prompt input', async () => {
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentExecutionRequest) => (
            agentResult(request)
        ))
        const actionHistoryAppender = vi.fn(async () => [])
        const result = await new ActionRunner({
            actionHistoryAppender,
            actionsFolderProvider: () => 'actions',
            agentCommandProvider: () => 'codex',
            agentRunner,
            bridgeProvider: () => bridge,
            projectProvider: () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' }),
        }).run(action('implement', { text: 'implement {{file}}', type: 'agent' }), context, { extraPrompt: 'focus tests' })

        expect(result.status).toBe('completed')
        expect(agentRunner).toHaveBeenCalledWith(bridge, { command: 'codex', prompt: 'implement design/F-010.md\n\nfocus tests' })
        expect(actionHistoryAppender).toHaveBeenCalledWith(
            bridge,
            { actionName: 'implement', actionsFolder: 'actions', context },
            expect.objectContaining({ output: 'implement design/F-010.md\n\nfocus tests', prompt: 'implement design/F-010.md\n\nfocus tests' }),
        )
    })

    it('inserts extra prompt text into the prompt placeholder for custom prompt actions', async () => {
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentExecutionRequest) => (
            agentResult(request)
        ))
        const result = await new ActionRunner({
            actionHistoryAppender: vi.fn(async () => []),
            actionsFolderProvider: () => 'actions',
            agentCommandProvider: () => 'codex',
            agentRunner,
            bridgeProvider: () => bridge,
            projectProvider: () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' }),
        }).run(action('custom prompt', { text: '{{prompt}}', type: 'agent' }), context, { extraPrompt: 'write docs' })

        expect(result.status).toBe('completed')
        expect(agentRunner).toHaveBeenCalledWith(bridge, { command: 'codex', prompt: 'write docs' })
    })

    it('runs agent actions through before, on and after chains', async () => {
        const before = action('before', { type: 'agent' })
        const onAction = action('on-action')
        const after = action('after')
        const main = action('main', { after: [after], before: [before], on: [{ action: onAction, condition: 'trigger' }], text: 'main', type: 'agent' })
        const agentRunner = vi.fn(async (_bridge: ElectronActionBridge, request: AgentExecutionRequest) => (
            agentResult(request, { stdout: `${request.prompt} trigger` })
        ))
        const commandRunner = vi.fn(async (_bridge: ElectronActionBridge, command: string) => commandResult(command))

        const result = await new ActionRunner({
            actionHistoryAppender: vi.fn(async () => []),
            actionsFolderProvider: () => 'actions',
            agentCommandProvider: () => 'codex',
            agentRunner,
            bridgeProvider: () => bridge,
            commandRunner,
            projectProvider: () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' }),
        }).run(main, context)

        expect(result.status).toBe('completed')
        expect(result.logs.map((log) => log.actionName)).toEqual(['before', 'main', 'on-action', 'after'])
        expect(result.logs.map((log) => log.phase)).toEqual(['before', 'main', 'on', 'after'])
    })

    it('loads agent run history for the same action and context', async () => {
        const history = [{ completedAt: '2026-07-05T10:00:00.000Z', output: 'done', prompt: 'run', status: 'completed' as const }]
        const actionHistoryLoader = vi.fn(async () => history)
        const entries = await new ActionRunner({
            actionHistoryLoader,
            actionsFolderProvider: () => 'actions',
            bridgeProvider: () => bridge,
            projectProvider: () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' }),
        }).loadHistory(action('implement', { type: 'agent' }), context)

        expect(entries).toEqual(history)
        expect(actionHistoryLoader).toHaveBeenCalledWith(bridge, { actionName: 'implement', actionsFolder: 'actions', context })
    })

    it('converts prompt input to a reusable action json file', async () => {
        const actionWriter = vi.fn(async () => undefined)
        const result = await new ActionRunner({
            actionWriter,
            actionsFolderProvider: () => 'actions',
            bridgeProvider: () => bridge,
            projectProvider: () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' }),
        }).convertPromptToAction({ context, label: 'Review Feature', prompt: 'review {{file}}' })

        expect(result.path).toBe('actions/review-feature.json')
        expect(actionWriter).toHaveBeenCalledWith('actions/review-feature.json', expect.stringContaining('"name": "review-feature"'))
        expect(JSON.parse(actionWriter.mock.calls[0][1])).toEqual({
            appliesTo: { type: 'feature' },
            description: 'Custom prompt action: Review Feature',
            label: 'Review Feature',
            name: 'review-feature',
            text: 'review {{file}}',
            type: 'agent',
        })
    })
})
