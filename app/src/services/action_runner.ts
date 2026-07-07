import type { ActionContext } from '../data/action_context'
import type { ActionDefinition, OnRule } from '../data/action_types'
import {
    type ActionRunHistoryEntry,
    type ActionRunHistoryRequest,
    type AgentExecutionResult,
    type AgentExecutionRequest,
    type CommandActionExecutionRequest,
    getElectronActionBridge,
    type CommandExecutionResult,
    type ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { AgentRunEvent, ProjectReference } from '../data/data_types'
import { dataService } from './data_service'
import { agentConversationService } from './agent_conversation_service'
import { configService } from './config_service'
import type { DesktopConfigValues } from './config_service'
import {
    defaultActionHistoryAppender,
    defaultActionHistoryLoader,
    loadActionHistory,
} from './action_history'
import { actionFilePath, createActionDefinition, type ConvertPromptToActionInput } from './action_definition_writer'
import {
    type ActionRunLogEntry,
    type RunStatus,
} from './action_run_log'
import { addFailure, runAgentAction, runCommandAction, type ActionExecutionDependencies, type RunOptions } from './action_execution'

export type { ActionRunLogEntry, RunPhase, RunStatus } from './action_run_log'
export type { ConvertPromptToActionInput } from './action_definition_writer'

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
    commandRunner?: (bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => Promise<CommandExecutionResult>
    projectProvider?: () => ProjectReference | null
}

export interface ActionRunInput {
    agent?: string
    extraPrompt?: string
    model?: string
}

function matchingOnRules(rules: OnRule[], output: string): OnRule[] {
    return rules.filter((rule) => new RegExp(rule.condition, 'u').test(output))
}

function defaultProjectProvider() {
    return dataService.getState().project
}

async function defaultCommandRunner(bridge: ElectronActionBridge, request: CommandActionExecutionRequest) {
    return bridge.runCommand(request)
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

async function defaultActionWriter(path: string, content: string) {
    await dataService.saveProjectFile({ content, path }, `Create ${path}`)
}

function defaultAgentCommandProvider() {
    return configService.get('desktop.agent') as string
}

function defaultAgentConfigProvider() {
    return configService.getDesktopValues()
}

function defaultActionsFolderProvider() {
    return dataService.getConfig()?.actionsFolder ?? null
}

function actionRunLabel(action: ActionDefinition, context: ActionContext) {
    if (context.file) return `${action.label} ${context.file}`

    return action.label
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
    private commandRunner: (bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => Promise<CommandExecutionResult>
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
            agentSlotCommand: '',
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
        const state = { failed: false, logs: [] }
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
        return loadActionHistory({
            action,
            actionHistoryLoader: this.actionHistoryLoader,
            actionsFolder: this.actionsFolderProvider(),
            bridge: this.bridgeProvider(),
            context,
        })
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
        if (action.type === 'agent') return runAgentAction(this.executionDependencies(), action, context, options)
        if (action.type === 'cmd') return runCommandAction(this.executionDependencies(), action, context, options)
        if (action.type !== 'cmd') return ''

        return ''
    }

    private executionDependencies(): ActionExecutionDependencies {
        return {
            actionHistoryAppender: this.actionHistoryAppender,
            actionsFolderProvider: this.actionsFolderProvider,
            agentConfigProvider: this.agentConfigProvider,
            agentConversationLinker: this.agentConversationLinker,
            agentRunEventRecorder: this.agentRunEventRecorder,
            agentRunner: this.agentRunner,
            bridgeProvider: this.bridgeProvider,
            commandRunner: this.commandRunner,
            projectProvider: this.projectProvider,
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
