import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    AgentExecutionRequest,
    AgentExecutionResult,
    CommandActionExecutionRequest,
    CommandExecutionResult,
    ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { AgentRunEvent, ProjectReference } from '../data/data_types'
import type { DesktopConfigValues } from './config_service'
import { appendAgentHistory, appendCommandHistory } from './action_history'
import { resolveAgentRun } from './action_agent_run'
import { resolveAgentPrompt } from './action_text'
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

export interface ActionExecutionDependencies {
    actionHistoryAppender: (
        bridge: ElectronActionBridge,
        request: ActionRunHistoryRequest,
        entry: ActionRunHistoryEntry,
    ) => Promise<ActionRunHistoryEntry[]>
    actionsFolderProvider: () => string | null
    agentConfigProvider: () => DesktopConfigValues
    agentConversationLinker: (cardPath: string, result: AgentExecutionResult) => Promise<void>
    agentRunEventRecorder: (cardPath: string, event: AgentRunEvent) => void
    agentRunner: (
        bridge: ElectronActionBridge,
        request: AgentExecutionRequest,
        onEvent?: (event: AgentRunEvent) => void,
    ) => Promise<AgentExecutionResult>
    bridgeProvider: () => ElectronActionBridge | null
    commandRunner: (bridge: ElectronActionBridge, request: CommandActionExecutionRequest) => Promise<CommandExecutionResult>
    projectProvider: () => ProjectReference | null
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
    const bridge = dependencies.bridgeProvider()
    const project = dependencies.projectProvider()
    if (!bridge || !project?.rootPath) {
        addFailure(action, options, 'Command actions require Electron local mode')

        return ''
    }

    try {
        const actionsFolder = dependencies.actionsFolderProvider()
        if (!actionsFolder) throw new Error('Cannot run command action before project config is loaded')

        const request = { actionName: action.name, actionsFolder, context, extraInput: options.extraPrompt }
        const result = await dependencies.commandRunner(bridge, request)
        options.state.logs.push(createCommandLog(action, options.phase, result.command, result))
        if (result.exitCode !== 0) options.state.failed = true
        await appendCommandHistory({
            action,
            actionHistoryAppender: dependencies.actionHistoryAppender,
            actionsFolder: dependencies.actionsFolderProvider(),
            bridge,
            command: result.command,
            context,
            project,
            result,
        })

        return combineOutput(result)
    } catch (error) {
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
    const bridge = dependencies.bridgeProvider()
    const project = dependencies.projectProvider()
    if (!bridge || !project?.rootPath) {
        addFailure(action, options, 'Agent actions require Electron local mode')

        return ''
    }

    try {
        const resolvedAgent = resolveAgentRun(dependencies.agentConfigProvider(), action, { agent: options.agent, model: options.model })
        const command = resolvedAgent.command
        const prompt = resolveAgentPrompt(action, context, project, options.extraPrompt)
        if (!context.file) throw new Error('Agent actions require a file context')

        const request = {
            agent: resolvedAgent.agent,
            cardPath: context.file,
            command,
            model: resolvedAgent.model,
            prompt,
            ...(resolvedAgent.sessionIdPattern ? { sessionIdPattern: resolvedAgent.sessionIdPattern } : {}),
            title: action.label,
        }
        const result = await dependencies.agentRunner(
            bridge,
            request,
            (event) => dependencies.agentRunEventRecorder(context.file as string, event),
        )
        options.state.logs.push(createAgentLog(action, options.phase, command, result))
        if (result.exitCode !== 0) options.state.failed = true
        await dependencies.agentConversationLinker(context.file, result)
        await appendAgentHistory({
            action,
            actionHistoryAppender: dependencies.actionHistoryAppender,
            actionsFolder: dependencies.actionsFolderProvider(),
            bridge,
            context,
            project: dependencies.projectProvider(),
            resolvedAgent,
            result,
        })

        return combineOutput(result)
    } catch (error) {
        addFailure(action, options, error instanceof Error ? error.message : 'Agent action failed')

        return ''
    }
}
