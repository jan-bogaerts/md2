import type { ActionContext } from '../data/action_context'
import type { ActionDefinition, OnRule, RawActionDefinition } from '../data/action_types'
import {
    type ActionRunHistoryEntry,
    type ActionRunHistoryRequest,
    type AgentExecutionResult,
    type AgentExecutionRequest,
    type CommitMetadata,
    getElectronActionBridge,
    type CommandExecutionResult,
    type ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { AgentRunEvent, ProjectReference } from '../data/data_types'
import { dataService } from './data_service'
import { agentConversationService } from './agent_conversation_service'
import { configService } from './config_service'
import {
    buildAgentCommand,
    defaultModelForProfile,
    findAgentProfile,
    validateAgentSelection,
} from '../data/agent_profiles'
import type { DesktopConfigValues } from './config_service'

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
    agentConversationLinker?: (cardPath: string, result: AgentExecutionResult) => Promise<void>
    agentConfigProvider?: () => DesktopConfigValues
    agentCommandProvider?: () => string
    agentRunFinisher?: (id: string) => void
    agentRunEventRecorder?: (cardPath: string, event: AgentRunEvent) => void
    agentRunStarter?: (label: string) => string
    agentRunner?: (
        bridge: ElectronActionBridge,
        request: AgentExecutionRequest,
        onEvent?: (event: AgentRunEvent) => void,
    ) => Promise<AgentExecutionResult>
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
    agent?: string
    extraPrompt: string
    model?: string
    phase: RunPhase
    stack: string[]
    state: RunState
}

export interface ActionRunInput {
    agent?: string
    extraPrompt?: string
    model?: string
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
const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu
const ROOT_COMMIT_SUFFIX = ' (root-commit)'

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

interface CommitMetadataInput {
    actionName: string
    completedAt: string
    context: ActionContext
    output: string
    project: ProjectReference
}

/** Parse the git commit summary line (`[branch hash] message`) an action reported, if any. */
function extractCommitMetadata(input: CommitMetadataInput): CommitMetadata | null {
    const match = COMMIT_LINE_PATTERN.exec(input.output)
    if (!match || !input.project.rootPath) return null

    const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1]
    const filePaths = input.context.file ? [input.context.file] : []

    return {
        actionName: input.actionName,
        branch,
        commit: match[2],
        completedAt: input.completedAt,
        filePaths,
        repositoryRoot: input.project.rootPath,
    }
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

async function defaultAgentRunner(bridge: ElectronActionBridge, request: AgentExecutionRequest, onEvent?: (event: AgentRunEvent) => void) {
    return bridge.runAgent(request, onEvent)
}

async function defaultAgentConversationLinker(cardPath: string, result: AgentExecutionResult) {
    await dataService.linkAgentConversation(cardPath, result.conversation, result.reference)
}

function defaultAgentRunEventRecorder(cardPath: string, event: AgentRunEvent) {
    dataService.recordAgentRunEvent(cardPath, event)
}

function defaultAgentRunStarter(label: string) {
    return agentConversationService.startRunningAgent(label)
}

function defaultAgentRunFinisher(id: string) {
    agentConversationService.finishRunningAgent(id)
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

function defaultAgentConfigProvider() {
    return configService.getDesktopValues()
}

interface ResolvedAgentRun {
    agent: string
    command: string
    model: string
}

function resolveAgentRun(config: DesktopConfigValues, action: ActionDefinition, input: ActionRunInput): ResolvedAgentRun {
    const agent = input.agent ?? action.agent ?? config.agent
    const profile = findAgentProfile(config.agentProfiles, agent)
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`)

    const model = (input.model ?? action.model ?? config.model) || defaultModelForProfile(profile)
    validateAgentSelection(config.agentProfiles, { agent, model }, `action "${action.name}"`)

    return { agent, command: buildAgentCommand(profile, model), model }
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

function actionRunLabel(action: ActionDefinition, context: ActionContext) {
    if (context.file) return `${action.label} ${context.file}`

    return action.label
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
    private agentConversationLinker: (cardPath: string, result: AgentExecutionResult) => Promise<void>
    private actionHistoryAppender: (
        bridge: ElectronActionBridge,
        request: ActionRunHistoryRequest,
        entry: ActionRunHistoryEntry,
    ) => Promise<ActionRunHistoryEntry[]>
    private actionHistoryLoader: (bridge: ElectronActionBridge, request: ActionRunHistoryRequest) => Promise<ActionRunHistoryEntry[]>
    private actionWriter: (path: string, content: string) => Promise<void>
    private actionsFolderProvider: () => string | null
    private agentConfigProvider: () => DesktopConfigValues
    private agentCommandProvider: () => string
    private agentRunFinisher: (id: string) => void
    private agentRunEventRecorder: (cardPath: string, event: AgentRunEvent) => void
    private agentRunStarter: (label: string) => string
    private agentRunner: (
        bridge: ElectronActionBridge,
        request: AgentExecutionRequest,
        onEvent?: (event: AgentRunEvent) => void,
    ) => Promise<AgentExecutionResult>
    private bridgeProvider: () => ElectronActionBridge | null
    private commandRunner: (bridge: ElectronActionBridge, command: string) => Promise<CommandExecutionResult>
    private projectProvider: () => ProjectReference | null

    constructor(dependencies: ActionRunnerDependencies = {}) {
        this.agentConversationLinker = dependencies.agentConversationLinker ?? defaultAgentConversationLinker
        this.actionHistoryAppender = dependencies.actionHistoryAppender ?? defaultActionHistoryAppender
        this.actionHistoryLoader = dependencies.actionHistoryLoader ?? defaultActionHistoryLoader
        this.actionWriter = dependencies.actionWriter ?? defaultActionWriter
        this.actionsFolderProvider = dependencies.actionsFolderProvider ?? defaultActionsFolderProvider
        this.agentCommandProvider = dependencies.agentCommandProvider ?? defaultAgentCommandProvider
        this.agentConfigProvider = dependencies.agentConfigProvider ?? (dependencies.agentCommandProvider ? (() => ({
            agent: 'default',
            agentProfiles: [{ command: this.agentCommandProvider(), name: 'default' }],
            model: '',
            projectLocationMode: 'folder',
        })) : defaultAgentConfigProvider)
        this.agentRunFinisher = dependencies.agentRunFinisher ?? defaultAgentRunFinisher
        this.agentRunEventRecorder = dependencies.agentRunEventRecorder ?? defaultAgentRunEventRecorder
        this.agentRunStarter = dependencies.agentRunStarter ?? defaultAgentRunStarter
        this.agentRunner = dependencies.agentRunner ?? defaultAgentRunner
        this.bridgeProvider = dependencies.bridgeProvider ?? getElectronActionBridge
        this.commandRunner = dependencies.commandRunner ?? defaultCommandRunner
        this.projectProvider = dependencies.projectProvider ?? defaultProjectProvider
    }

    async run(action: ActionDefinition, context: ActionContext, input: ActionRunInput = {}): Promise<ActionRunResult> {
        const state: RunState = { failed: false, logs: [] }
        const runningAgentId = this.agentRunStarter(actionRunLabel(action, context))

        try {
            await this.runAction(action, context, { agent: input.agent, extraPrompt: input.extraPrompt ?? '', model: input.model, phase: 'main', stack: [], state })
            await this.notifyActionCompleted(action.name)

            return { logs: state.logs, status: state.failed ? 'failed' : 'completed' }
        } finally {
            this.agentRunFinisher(runningAgentId)
        }
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
            await this.appendCommandHistory(bridge, action, context, project, command, result)

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
            const resolvedAgent = resolveAgentRun(this.agentConfigProvider(), action, {
                agent: options.agent,
                extraPrompt: options.extraPrompt,
                model: options.model,
            })
            const command = resolvedAgent.command
            const prompt = resolveAgentPrompt(action, context, project, options.extraPrompt)
            if (!context.file) throw new Error('Agent actions require a file context')

            const request = { cardPath: context.file, command, prompt, title: action.label }
            const result = await this.agentRunner(bridge, request, (event) => this.agentRunEventRecorder(context.file as string, event))
            options.state.logs.push(createAgentLog(action, options.phase, command, result))
            if (result.exitCode !== 0) options.state.failed = true
            await this.agentConversationLinker(context.file, result)
            await this.appendAgentHistory(bridge, action, context, result, resolvedAgent)

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
        resolvedAgent: ResolvedAgentRun,
    ) {
        const actionsFolder = this.actionsFolderProvider()
        if (!actionsFolder) throw new Error('Cannot store action history before project config is loaded')

        const completedAt = new Date().toISOString()
        const output = combineOutput(result)
        const project = this.projectProvider()
        const commit = project
            ? extractCommitMetadata({ actionName: action.name, completedAt, context, output, project })
            : null
        const entry: ActionRunHistoryEntry = {
            agent: resolvedAgent.agent,
            completedAt,
            model: resolvedAgent.model,
            output,
            prompt: result.prompt,
            status: statusFromExitCode(result.exitCode),
            ...(commit ? { commit } : {}),
        }
        const request = { actionName: action.name, actionsFolder, context }
        await this.actionHistoryAppender(bridge, request, entry)
    }

    /** Persist a command run only when it reported a commit, so the log can expose a diff view. */
    private async appendCommandHistory(
        bridge: ElectronActionBridge,
        action: ActionDefinition,
        context: ActionContext,
        project: ProjectReference,
        command: string,
        result: CommandExecutionResult,
    ) {
        const completedAt = new Date().toISOString()
        const output = combineOutput(result)
        const commit = extractCommitMetadata({ actionName: action.name, completedAt, context, output, project })
        if (!commit) return

        const actionsFolder = this.actionsFolderProvider()
        if (!actionsFolder) throw new Error('Cannot store action history before project config is loaded')

        const entry: ActionRunHistoryEntry = { command, commit, completedAt, output, prompt: '', status: statusFromExitCode(result.exitCode) }
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

    private async notifyActionCompleted(actionName: string) {
        const bridge = this.bridgeProvider()
        if (!bridge?.notifyActionCompleted) return

        await bridge.notifyActionCompleted(actionName)
    }

}

export const actionRunner = new ActionRunner()
