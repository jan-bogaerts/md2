import type { ActionContext } from '../data/action_context'
import type { ActionDefinition, OnRule } from '../data/action_types'
import { getElectronActionBridge, type CommandExecutionResult, type ElectronActionBridge } from '../data/electron_action_bridge'
import type { ProjectReference } from '../data/data_types'
import { dataService } from './data_service'

type RunStatus = 'completed' | 'failed'
type RunPhase = 'after' | 'before' | 'main' | 'on'

export interface ActionRunLogEntry {
    actionName: string
    command: string | null
    message: string
    phase: RunPhase
    status: RunStatus
    stderr: string
    stdout: string
}

export interface ActionRunResult {
    logs: ActionRunLogEntry[]
    status: RunStatus
}

interface ActionRunnerDependencies {
    bridgeProvider?: () => ElectronActionBridge | null
    commandRunner?: (bridge: ElectronActionBridge, command: string) => Promise<CommandExecutionResult>
    projectProvider?: () => ProjectReference | null
}

interface RunState {
    failed: boolean
    logs: ActionRunLogEntry[]
}

interface RunOptions {
    phase: RunPhase
    stack: string[]
    state: RunState
}

const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|file)\s*\}\}/gu

function combineOutput(result: CommandExecutionResult) {
    return `${result.stdout}${result.stderr}`
}

function statusFromExitCode(exitCode: number): RunStatus {
    return exitCode === 0 ? 'completed' : 'failed'
}

function messageFromCommandResult(action: ActionDefinition, result: CommandExecutionResult) {
    if (result.exitCode === 0) return `${action.label} completed`

    return `${action.label} failed with exit code ${result.exitCode}`
}

function createFailureLog(action: ActionDefinition, phase: RunPhase, message: string): ActionRunLogEntry {
    return { actionName: action.name, command: null, message, phase, status: 'failed', stderr: message, stdout: '' }
}

function createCommandLog(action: ActionDefinition, phase: RunPhase, command: string, result: CommandExecutionResult): ActionRunLogEntry {
    return {
        actionName: action.name,
        command,
        message: messageFromCommandResult(action, result),
        phase,
        status: statusFromExitCode(result.exitCode),
        stderr: result.stderr,
        stdout: result.stdout,
    }
}

function addFailure(action: ActionDefinition, options: RunOptions, message: string) {
    options.state.failed = true
    options.state.logs.push(createFailureLog(action, options.phase, message))
}

function resolvePlaceholders(text: string, context: ActionContext, project: ProjectReference): string {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
        if (name === 'rootProjectFolder') {
            if (!project.rootPath) throw new Error('Cannot resolve rootProjectFolder without a local project rootPath')

            return project.rootPath
        }

        if (!context.file) throw new Error('Cannot resolve file placeholder without a file context')

        return context.file
    })
}

function matchingOnRules(rules: OnRule[], output: string): OnRule[] {
    return rules.filter((rule) => new RegExp(rule.condition, 'u').test(output))
}

function defaultProjectProvider() {
    return dataService.getState().project
}

async function defaultCommandRunner(bridge: ElectronActionBridge, command: string) {
    return bridge.runCommand(command)
}

export class ActionRunner {
    private bridgeProvider: () => ElectronActionBridge | null
    private commandRunner: (bridge: ElectronActionBridge, command: string) => Promise<CommandExecutionResult>
    private projectProvider: () => ProjectReference | null

    constructor(dependencies: ActionRunnerDependencies = {}) {
        this.bridgeProvider = dependencies.bridgeProvider ?? getElectronActionBridge
        this.commandRunner = dependencies.commandRunner ?? defaultCommandRunner
        this.projectProvider = dependencies.projectProvider ?? defaultProjectProvider
    }

    async run(action: ActionDefinition, context: ActionContext): Promise<ActionRunResult> {
        const state: RunState = { failed: false, logs: [] }

        await this.runAction(action, context, { phase: 'main', stack: [], state })

        return { logs: state.logs, status: state.failed ? 'failed' : 'completed' }
    }

    private async runAction(action: ActionDefinition, context: ActionContext, options: RunOptions): Promise<string> {
        if (options.stack.includes(action.name)) {
            addFailure(action, options, `Circular action call rejected: ${[...options.stack, action.name].join(' -> ')}`)

            return ''
        }

        const stack = [...options.stack, action.name]

        for (const beforeAction of action.before) {
            await this.runAction(beforeAction, context, { phase: 'before', stack, state: options.state })
        }

        const output = await this.runMain(action, context, { ...options, stack })
        await this.runOnMatches(action, context, output, { ...options, stack })

        for (const afterAction of action.after) {
            await this.runAction(afterAction, context, { phase: 'after', stack, state: options.state })
        }

        return output
    }

    private async runMain(action: ActionDefinition, context: ActionContext, options: RunOptions): Promise<string> {
        if (action.type !== 'cmd') {
            addFailure(action, options, `Action "${action.name}" is not a cmd action`)

            return ''
        }

        const bridge = this.bridgeProvider()
        const project = this.projectProvider()
        if (!bridge || !project?.rootPath) {
            addFailure(action, options, 'Command actions require Electron local mode')

            return ''
        }

        try {
            const command = resolvePlaceholders(action.text, context, project)
            const result = await this.commandRunner(bridge, command)
            options.state.logs.push(createCommandLog(action, options.phase, command, result))
            if (result.exitCode !== 0) options.state.failed = true

            return combineOutput(result)
        } catch (error) {
            addFailure(action, options, error instanceof Error ? error.message : 'Command action failed')

            return ''
        }
    }

    private async runOnMatches(action: ActionDefinition, context: ActionContext, output: string, options: RunOptions) {
        let matches: OnRule[] = []
        try {
            matches = matchingOnRules(action.on, output)
        } catch (error) {
            addFailure(action, options, error instanceof Error ? error.message : 'Invalid on condition')

            return
        }

        for (const rule of matches) {
            await this.runAction(rule.action, context, { phase: 'on', stack: options.stack, state: options.state })
        }
    }

}

export const actionRunner = new ActionRunner()
