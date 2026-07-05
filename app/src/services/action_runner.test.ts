import { describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { CommandExecutionResult, ElectronActionBridge } from '../data/electron_action_bridge'
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

const bridge: ElectronActionBridge = { runCommand: vi.fn() }
const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }

function commandResult(command: string, overrides: Partial<CommandExecutionResult> = {}): CommandExecutionResult {
    return { command, exitCode: 0, stderr: '', stdout: command, ...overrides }
}

function runner(commandRunner = vi.fn(async (_bridge: ElectronActionBridge, command: string) => commandResult(command))) {
    return new ActionRunner({
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
})
