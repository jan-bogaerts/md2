import type { ActionContext } from '../data/action_context'
import type { ActionDefinition, OnRule } from '../data/action_types'
import {
    type ActionRunHistoryEntry,
    type AgentExecutionResult,
    type AgentExecutionRequest,
    type CommandActionExecutionRequest,
    getElectronActionBridge,
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
import {
    addFailure,
    type ActionEnvironment,
    type ActionExecutionDependencies,
    type ActionExecutionGateway,
    type ActionRunRecorder,
    runAgentAction,
    runCommandAction,
    type RunOptions,
} from './action_execution'

export type { ActionRunLogEntry, RunPhase, RunStatus } from './action_run_log'
export type { ConvertPromptToActionInput } from './action_definition_writer'

export interface ActionRunResult {
    logs: ActionRunLogEntry[]
    status: RunStatus
}

interface ActionRunnerDependencies {
    actionWriter?: (path: string, content: string) => Promise<void>
    environment?: ActionEnvironment
    executionGateway?: ActionExecutionGateway
    runRecorder?: ActionRunRecorder
}

export interface ActionRunInput {
    agent?: string
    extraPrompt?: string
    model?: string
}

function matchingOnRules(rules: OnRule[], output: string): OnRule[] {
    return rules.filter((rule) => new RegExp(rule.condition, 'u').test(output))
}

function defaultProjectProvider(): ProjectReference | null {
    return dataService.getState().project
}

async function defaultCommandRunner(bridge: ElectronActionBridge, request: CommandActionExecutionRequest) {
    return bridge.runCommand(request)
}

async function defaultAgentRunner(bridge: ElectronActionBridge, request: AgentExecutionRequest, onEvent?: (event: AgentRunEvent) => void) {
    return bridge.runAgent(request, onEvent)
}

async function defaultAgentConversationLinker(cardPath: string, result: AgentExecutionResult) {
    await dataService.agents.linkAgentConversation(cardPath, result.conversation, result.reference)
}

function defaultAgentRunEventRecorder(cardPath: string, event: AgentRunEvent) {
    dataService.agents.recordAgentRunEvent(cardPath, event)
}

function defaultAgentRunStarter(label: string) {
    return agentConversationService.startRunningAgent(label)
}

function defaultAgentRunFinisher(id: string) {
    agentConversationService.finishRunningAgent(id)
}

async function defaultActionWriter(path: string, content: string) {
    await dataService.cards.saveProjectFile({ content, path }, `Create ${path}`)
}

function defaultAgentConfigProvider(): DesktopConfigValues {
    return configService.getDesktopValues()
}

function defaultActionsFolderProvider() {
    return dataService.getConfig()?.actionsFolder ?? null
}

const defaultExecutionGateway: ActionExecutionGateway = {
    getBridge: getElectronActionBridge,
    runAgent: defaultAgentRunner,
    runCommand: defaultCommandRunner,
}

const defaultRunRecorder: ActionRunRecorder = {
    appendHistory: defaultActionHistoryAppender,
    finishRun: defaultAgentRunFinisher,
    linkAgentConversation: defaultAgentConversationLinker,
    loadHistory: defaultActionHistoryLoader,
    recordAgentRunEvent: defaultAgentRunEventRecorder,
    startRun: defaultAgentRunStarter,
}

const defaultEnvironment: ActionEnvironment = {
    getActionsFolder: defaultActionsFolderProvider,
    getAgentConfig: defaultAgentConfigProvider,
    getProject: defaultProjectProvider,
}

function actionRunLabel(action: ActionDefinition, context: ActionContext) {
    if (context.file) return `${action.label} ${context.file}`

    return action.label
}

export class ActionRunner {
    private actionWriter: (path: string, content: string) => Promise<void>
    private environment: ActionEnvironment
    private executionGateway: ActionExecutionGateway
    private runRecorder: ActionRunRecorder

    constructor(dependencies: ActionRunnerDependencies = {}) {
        this.actionWriter = dependencies.actionWriter ?? defaultActionWriter
        this.environment = dependencies.environment ?? defaultEnvironment
        this.executionGateway = dependencies.executionGateway ?? defaultExecutionGateway
        this.runRecorder = dependencies.runRecorder ?? defaultRunRecorder
    }

    async run(action: ActionDefinition, context: ActionContext, input: ActionRunInput = {}): Promise<ActionRunResult> {
        const state = { failed: false, logs: [] }
        const runningAgentId = this.runRecorder.startRun(actionRunLabel(action, context))

        try {
            await this.runAction(action, context, { agent: input.agent, extraPrompt: input.extraPrompt ?? '', model: input.model, phase: 'main', stack: [], state })
            await this.notifyActionCompleted(action.name)

            return { logs: state.logs, status: state.failed ? 'failed' : 'completed' }
        } finally {
            this.runRecorder.finishRun(runningAgentId)
        }
    }

    async loadHistory(action: ActionDefinition, context: ActionContext): Promise<ActionRunHistoryEntry[]> {
        return loadActionHistory({
            action,
            actionHistoryLoader: this.runRecorder.loadHistory,
            actionsFolder: this.environment.getActionsFolder(),
            bridge: this.executionGateway.getBridge(),
            context,
        })
    }

    async convertPromptToAction(input: ConvertPromptToActionInput) {
        const actionsFolder = this.environment.getActionsFolder()
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

        return ''
    }

    private executionDependencies(): ActionExecutionDependencies {
        return {
            environment: this.environment,
            executionGateway: this.executionGateway,
            runRecorder: this.runRecorder,
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
        const bridge = this.executionGateway.getBridge()
        if (!bridge?.notifyActionCompleted) return

        await bridge.notifyActionCompleted(actionName)
    }

}

export const actionRunner = new ActionRunner()
