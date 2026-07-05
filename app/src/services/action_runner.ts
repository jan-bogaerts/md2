import type { ActionContext } from '../data/action_context'
import type { ActionDefinition, OnRule, RawActionDefinition } from '../data/action_types'
import {
    type ActionRunHistoryEntry,
    type ActionRunHistoryRequest,
    type AgentExecutionResult,
    type AgentExecutionRequest,
    getElectronActionBridge,
    type CommandExecutionResult,
    type ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { ProjectReference } from '../data/data_types'
import { dataService } from './data_service'
import { configService } from './config_service'

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
    agentCommandProvider?: () => string
    agentRunner?: (bridge: ElectronActionBridge, request: AgentExecutionRequest) => Promise<AgentExecutionResult>
    actionHistoryAppender?: (
        bridge: ElectronActionBridge,
        request: ActionRunHistoryRequest,
        entry: ActionRunHistoryEntry,
    ) => Promise<ActionRunHistoryEntry[]>
    actionHistoryLoader?: (bridge: ElectronActionBridge, request: ActionRunHistoryRequest) => Promise<ActionRunHistoryEntry[]>
    actionWriter?: (path: string, content: string) => Promise<void>
    actionsFolderProvider?: () => string | null
    bridgeProvider?: () => ElectronActionBridge | null
    commandRunner?: (bridge: ElectronActionBridge, command: string) => Promise<CommandExecutionResult>
    projectProvider?: () => ProjectReference | null
}

interface RunState {
    failed: boolean
    logs: ActionRunLogEntry[]
}

interface RunOptions {
    extraPrompt: string
    phase: RunPhase
    stack: string[]
    state: RunState
}

export interface ActionRunInput {
    extraPrompt?: string
}

export interface ConvertPromptToActionInput {
    context: ActionContext
    description?: string
    label: string
    prompt: string
}

const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|file|prompt)\s*\}\}/gu
const PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*prompt\s*\}\}/u
const ACTION_FILE_EXTENSION = '.json'

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

function createAgentLog(action: ActionDefinition, phase: RunPhase, command: string, result: AgentExecutionResult): ActionRunLogEntry {
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

function resolvePlaceholders(text: string, context: ActionContext, project: ProjectReference, extraPrompt: string): string {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
        if (name === 'rootProjectFolder') {
            if (!project.rootPath) throw new Error('Cannot resolve rootProjectFolder without a local project rootPath')

            return project.rootPath
        }

        if (name === 'prompt') return extraPrompt

        if (!context.file) throw new Error('Cannot resolve file placeholder without a file context')

        return context.file
    })
}

function resolveAgentPrompt(action: ActionDefinition, context: ActionContext, project: ProjectReference, extraPrompt: string): string {
    const resolvedText = resolvePlaceholders(action.text, context, project, extraPrompt)
    if (PROMPT_PLACEHOLDER_PATTERN.test(action.text)) return resolvedText
    if (extraPrompt.trim().length === 0) return resolvedText

    return `${resolvedText}\n\n${extraPrompt}`
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

async function defaultAgentRunner(bridge: ElectronActionBridge, request: AgentExecutionRequest) {
    return bridge.runAgent(request)
}

async function defaultActionHistoryAppender(bridge: ElectronActionBridge, request: ActionRunHistoryRequest, entry: ActionRunHistoryEntry) {
    return bridge.appendActionRunHistory(request, entry)
}

async function defaultActionHistoryLoader(bridge: ElectronActionBridge, request: ActionRunHistoryRequest) {
    return bridge.loadActionRunHistory(request)
}

async function defaultActionWriter(path: string, content: string) {
    await dataService.saveProjectFile({ content, path }, `Create ${path}`)
}

function defaultAgentCommandProvider() {
    return configService.get('desktop.agent') as string
}

function defaultActionsFolderProvider() {
    return dataService.getConfig()?.actionsFolder ?? null
}

function toActionName(label: string) {
    const name = label.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
    if (name.length === 0) throw new Error('Missing action label')

    return name
}

function actionFilePath(actionsFolder: string, name: string) {
    return `${actionsFolder}/${name}${ACTION_FILE_EXTENSION}`
}

function createActionDefinition(input: ConvertPromptToActionInput): RawActionDefinition {
    const name = toActionName(input.label)
    const description = input.description?.trim()

    return {
        appliesTo: input.context.type ? { type: input.context.type } : undefined,
        description: description && description.length > 0 ? description : `Custom prompt action: ${input.label.trim()}`,
        label: input.label.trim(),
        name,
        text: input.prompt,
        type: 'agent',
    }
}

export class ActionRunner {
    private actionHistoryAppender: (
        bridge: ElectronActionBridge,
        request: ActionRunHistoryRequest,
        entry: ActionRunHistoryEntry,
    ) => Promise<ActionRunHistoryEntry[]>
    private actionHistoryLoader: (bridge: ElectronActionBridge, request: ActionRunHistoryRequest) => Promise<ActionRunHistoryEntry[]>
    private actionWriter: (path: string, content: string) => Promise<void>
    private actionsFolderProvider: () => string | null
    private agentCommandProvider: () => string
    private agentRunner: (bridge: ElectronActionBridge, request: AgentExecutionRequest) => Promise<AgentExecutionResult>
    private bridgeProvider: () => ElectronActionBridge | null
    private commandRunner: (bridge: ElectronActionBridge, command: string) => Promise<CommandExecutionResult>
    private projectProvider: () => ProjectReference | null

    constructor(dependencies: ActionRunnerDependencies = {}) {
        this.actionHistoryAppender = dependencies.actionHistoryAppender ?? defaultActionHistoryAppender
        this.actionHistoryLoader = dependencies.actionHistoryLoader ?? defaultActionHistoryLoader
        this.actionWriter = dependencies.actionWriter ?? defaultActionWriter
        this.actionsFolderProvider = dependencies.actionsFolderProvider ?? defaultActionsFolderProvider
        this.agentCommandProvider = dependencies.agentCommandProvider ?? defaultAgentCommandProvider
        this.agentRunner = dependencies.agentRunner ?? defaultAgentRunner
        this.bridgeProvider = dependencies.bridgeProvider ?? getElectronActionBridge
        this.commandRunner = dependencies.commandRunner ?? defaultCommandRunner
        this.projectProvider = dependencies.projectProvider ?? defaultProjectProvider
    }

    async run(action: ActionDefinition, context: ActionContext, input: ActionRunInput = {}): Promise<ActionRunResult> {
        const state: RunState = { failed: false, logs: [] }

        await this.runAction(action, context, { extraPrompt: input.extraPrompt ?? '', phase: 'main', stack: [], state })

        return { logs: state.logs, status: state.failed ? 'failed' : 'completed' }
    }

    async loadHistory(action: ActionDefinition, context: ActionContext): Promise<ActionRunHistoryEntry[]> {
        const bridge = this.bridgeProvider()
        const actionsFolder = this.actionsFolderProvider()
        if (!bridge || !actionsFolder) return []

        return this.actionHistoryLoader(bridge, { actionName: action.name, actionsFolder, context })
    }

    async convertPromptToAction(input: ConvertPromptToActionInput) {
        const actionsFolder = this.actionsFolderProvider()
        if (!actionsFolder) throw new Error('Cannot convert prompt before project config is loaded')

        const definition = createActionDefinition(input)
        const content = `${JSON.stringify(definition, null, 2)}\n`
        const path = actionFilePath(actionsFolder, definition.name as string)
        await this.actionWriter(path, content)

        return { definition, path }
    }

    private async runAction(action: ActionDefinition, context: ActionContext, options: RunOptions): Promise<string> {
        if (options.stack.includes(action.name)) {
            addFailure(action, options, `Circular action call rejected: ${[...options.stack, action.name].join(' -> ')}`)

            return ''
        }

        const stack = [...options.stack, action.name]

        for (const beforeAction of action.before) {
            await this.runAction(beforeAction, context, { ...options, phase: 'before', stack })
        }

        const output = await this.runMain(action, context, { ...options, stack })
        await this.runOnMatches(action, context, output, { ...options, stack })

        for (const afterAction of action.after) {
            await this.runAction(afterAction, context, { ...options, phase: 'after', stack })
        }

        return output
    }

    private async runMain(action: ActionDefinition, context: ActionContext, options: RunOptions): Promise<string> {
        if (action.type === 'agent') return this.runAgentAction(action, context, options)
        if (action.type !== 'cmd') return ''

        const bridge = this.bridgeProvider()
        const project = this.projectProvider()
        if (!bridge || !project?.rootPath) {
            addFailure(action, options, 'Command actions require Electron local mode')

            return ''
        }

        try {
            const command = resolvePlaceholders(action.text, context, project, options.extraPrompt)
            const result = await this.commandRunner(bridge, command)
            options.state.logs.push(createCommandLog(action, options.phase, command, result))
            if (result.exitCode !== 0) options.state.failed = true

            return combineOutput(result)
        } catch (error) {
            addFailure(action, options, error instanceof Error ? error.message : 'Command action failed')

            return ''
        }
    }

    private async runAgentAction(action: ActionDefinition, context: ActionContext, options: RunOptions): Promise<string> {
        const bridge = this.bridgeProvider()
        const project = this.projectProvider()
        if (!bridge || !project?.rootPath) {
            addFailure(action, options, 'Agent actions require Electron local mode')

            return ''
        }

        try {
            const command = this.agentCommandProvider()
            const prompt = resolveAgentPrompt(action, context, project, options.extraPrompt)
            const result = await this.agentRunner(bridge, { command, prompt })
            options.state.logs.push(createAgentLog(action, options.phase, command, result))
            if (result.exitCode !== 0) options.state.failed = true
            await this.appendAgentHistory(bridge, action, context, result)

            return combineOutput(result)
        } catch (error) {
            addFailure(action, options, error instanceof Error ? error.message : 'Agent action failed')

            return ''
        }
    }

    private async appendAgentHistory(
        bridge: ElectronActionBridge,
        action: ActionDefinition,
        context: ActionContext,
        result: AgentExecutionResult,
    ) {
        const actionsFolder = this.actionsFolderProvider()
        if (!actionsFolder) throw new Error('Cannot store action history before project config is loaded')

        const entry: ActionRunHistoryEntry = {
            completedAt: new Date().toISOString(),
            output: combineOutput(result),
            prompt: result.prompt,
            status: statusFromExitCode(result.exitCode),
        }
        const request = { actionName: action.name, actionsFolder, context }
        await this.actionHistoryAppender(bridge, request, entry)
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
            await this.runAction(rule.action, context, { ...options, phase: 'on', stack: options.stack })
        }
    }

}

export const actionRunner = new ActionRunner()
