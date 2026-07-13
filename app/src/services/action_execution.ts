import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    AgentActionExecutionRequest,
    AgentExecutionResult,
    CommandActionExecutionRequest,
    CommandExecutionResult,
    ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { AgentRunEvent, ProjectReference } from '../data/data_types'
import type { DesktopConfigValues } from './config_service'
import { appendAgentHistory, appendCommandHistory } from './action_history'
import { resolveAgentRun } from './action_agent_run'
import { dialogService } from './dialog_service'
import {
    combineOutput,
    createAgentLog,
    createCommandLog,
    createFailureLog,
    type ActionRunLogEntry,
    type RunPhase,
} from './action_run_log'

interface RunState {
    failed: boolean
    logs: ActionRunLogEntry[]
}

export interface RunOptions {
    agent?: string
    extraPrompt: string
    model?: string
    phase: RunPhase
    stack: string[]
    state: RunState
}

export interface ActionExecutionGateway {
    getBridge: () => ElectronActionBridge | null
    runAgent: (
        bridge: ElectronActionBridge,
        request: AgentActionExecutionRequest,
        onEvent?: (event: AgentRunEvent) => void,
    ) => Promise<AgentExecutionResult>
    runCommand: (bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => Promise<CommandExecutionResult>
}

export interface ActionRunRecorder {
    appendHistory: (
        bridge: ElectronActionBridge,
        request: ActionRunHistoryRequest,
        entry: ActionRunHistoryEntry,
    ) => Promise<ActionRunHistoryEntry[]>
    finishRun: (id: string) => void
    linkAgentConversation: (cardPath: string, result: AgentExecutionResult) => Promise<void>
    loadHistory: (bridge: ElectronActionBridge, request: ActionRunHistoryRequest) => Promise<ActionRunHistoryEntry[]>
    recordAgentRunEvent: (cardPath: string, event: AgentRunEvent) => void
    startRun: (label: string) => string
}

export interface ActionEnvironment {
    getActionsFolder: () => string | null
    getAgentConfig: () => DesktopConfigValues
    getProject: () => ProjectReference | null
    refreshProject?: () => Promise<unknown>
}

export interface ActionExecutionDependencies {
    environment: ActionEnvironment
    executionGateway: ActionExecutionGateway
    runRecorder: ActionRunRecorder
}

export function addFailure(action: ActionDefinition, options: RunOptions, message: string) {
    options.state.failed = true
    options.state.logs.push(createFailureLog(action, options.phase, message))
}

export async function runCommandAction(
    dependencies: ActionExecutionDependencies,
    action: ActionDefinition,
    context: ActionContext,
    options: RunOptions,
): Promise<string> {
    const bridge = dependencies.executionGateway.getBridge()
    const project = dependencies.environment.getProject()
    if (!bridge || !project?.rootPath) {
        addFailure(action, options, 'Command actions require Electron local mode')

        return ''
    }

    try {
        const actionsFolder = dependencies.environment.getActionsFolder()
        if (!actionsFolder) throw new Error('Cannot run command action before project config is loaded')

        const request = { actionId: action.id, actionsFolder, context, extraInput: options.extraPrompt }
        const result = await dependencies.executionGateway.runCommand(bridge, request)
        options.state.logs.push(createCommandLog(action, options.phase, result.command, result))
        if (result.exitCode !== 0) options.state.failed = true
        await appendCommandHistory({
            action,
            actionHistoryAppender: dependencies.runRecorder.appendHistory,
            actionsFolder: dependencies.environment.getActionsFolder(),
            bridge,
            command: result.command,
            context,
            project,
            result,
        })

        return combineOutput(result)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Command action failed' })
        addFailure(action, options, error instanceof Error ? error.message : 'Command action failed')

        return ''
    }
}

export async function runAgentAction(
    dependencies: ActionExecutionDependencies,
    action: ActionDefinition,
    context: ActionContext,
    options: RunOptions,
): Promise<string> {
    const bridge = dependencies.executionGateway.getBridge()
    const project = dependencies.environment.getProject()
    if (!bridge || !project?.rootPath) {
        addFailure(action, options, 'Agent actions require Electron local mode')

        return ''
    }

    try {
        const actionsFolder = dependencies.environment.getActionsFolder()
        if (!actionsFolder) throw new Error('Cannot run agent action before project config is loaded')
        const resolvedAgent = resolveAgentRun(
            dependencies.environment.getAgentConfig(),
            action,
            { agent: options.agent, model: options.model },
        )
        const command = resolvedAgent.command
        if (!context.file) throw new Error('Agent actions require a file context')

        const request = {
            actionId: action.id,
            agent: resolvedAgent.agent,
            actionsFolder,
            context,
            extraInput: options.extraPrompt,
            model: resolvedAgent.model,
        }
        const result = await dependencies.executionGateway.runAgent(
            bridge,
            request,
            (event) => dependencies.runRecorder.recordAgentRunEvent(context.file as string, event),
        )
        options.state.logs.push(createAgentLog(action, options.phase, command, result))
        if (result.exitCode !== 0) options.state.failed = true
        await dependencies.runRecorder.linkAgentConversation(context.file, result)
        await appendAgentHistory({
            action,
            actionHistoryAppender: dependencies.runRecorder.appendHistory,
            actionsFolder: dependencies.environment.getActionsFolder(),
            bridge,
            context,
            project: dependencies.environment.getProject(),
            resolvedAgent,
            result,
        })

        return combineOutput(result)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Agent action failed' })
        addFailure(action, options, error instanceof Error ? error.message : 'Agent action failed')

        return ''
    }
}
