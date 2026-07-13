import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    AgentExecutionResult,
    CommandExecutionResult,
    CommitMetadata,
    ElectronActionBridge,
} from '../data/electron_action_bridge'
import type { ProjectReference } from '../data/data_types'
import type { ThinkingLevel } from '../data/agent_profiles'
import { combineOutput, statusFromExitCode } from './action_run_log'

export const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu

const ROOT_COMMIT_SUFFIX = ' (root-commit)'

function executionProject(project: ProjectReference, result: CommandExecutionResult): ProjectReference {
    if (!result.branch) throw new Error('Action result is missing execution branch')
    if (!result.repositoryRoot) throw new Error('Action result is missing execution repository root')

    return { ...project, branch: result.branch, rootPath: result.repositoryRoot }
}

export interface CommitMetadataInput {
    actionId: string
    completedAt: string
    context: ActionContext
    output: string
    project: ProjectReference
}

/** Parse the git commit summary line (`[branch hash] message`) an action reported, if any. */
export function extractCommitMetadata(input: CommitMetadataInput): CommitMetadata | null {
    const match = COMMIT_LINE_PATTERN.exec(input.output)
    if (!match || !input.project.rootPath) return null

    const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1]
    const filePaths = input.context.file ? [input.context.file] : []

    return {
        actionId: input.actionId,
        branch,
        commit: match[2],
        completedAt: input.completedAt,
        filePaths,
        repositoryRoot: input.project.rootPath,
    }
}

export async function defaultActionHistoryAppender(
    bridge: ElectronActionBridge,
    request: ActionRunHistoryRequest,
    entry: ActionRunHistoryEntry,
) {
    return bridge.appendActionRunHistory(request, entry)
}

export async function defaultActionHistoryLoader(bridge: ElectronActionBridge, request: ActionRunHistoryRequest) {
    return bridge.loadActionRunHistory(request)
}

interface LoadActionHistoryInput {
    action: ActionDefinition
    actionHistoryLoader: (bridge: ElectronActionBridge, request: ActionRunHistoryRequest) => Promise<ActionRunHistoryEntry[]>
    actionsFolder: string | null
    bridge: ElectronActionBridge | null
    context: ActionContext
}

export async function loadActionHistory(input: LoadActionHistoryInput): Promise<ActionRunHistoryEntry[]> {
    if (!input.bridge || !input.actionsFolder) return []

    return input.actionHistoryLoader(input.bridge, {
        actionId: input.action.id,
        actionsFolder: input.actionsFolder,
        context: input.context,
    })
}

export interface ResolvedHistoryAgentRun {
    agent: string
    model: string
    thinkingLevel: ThinkingLevel
}

interface AppendAgentHistoryInput {
    action: ActionDefinition
    actionHistoryAppender: (
        bridge: ElectronActionBridge,
        request: ActionRunHistoryRequest,
        entry: ActionRunHistoryEntry,
    ) => Promise<ActionRunHistoryEntry[]>
    actionsFolder: string | null
    bridge: ElectronActionBridge
    context: ActionContext
    project: ProjectReference | null
    resolvedAgent: ResolvedHistoryAgentRun
    result: AgentExecutionResult
}

export async function appendAgentHistory(input: AppendAgentHistoryInput) {
    if (!input.actionsFolder) throw new Error('Cannot store action history before project config is loaded')

    const completedAt = new Date().toISOString()
    const output = combineOutput(input.result)
    const resultProject = input.project
        ? executionProject(input.project, input.result)
        : null
    const commit = resultProject
        ? extractCommitMetadata({ actionId: input.action.id, completedAt, context: input.context, output, project: resultProject })
        : null
    const entry: ActionRunHistoryEntry = {
        agent: input.resolvedAgent.agent,
        completedAt,
        model: input.resolvedAgent.model,
        output,
        prompt: input.result.prompt,
        status: statusFromExitCode(input.result.exitCode),
        thinkingLevel: input.resolvedAgent.thinkingLevel,
        ...(commit ? { commit } : {}),
    }
    const request = { actionId: input.action.id, actionsFolder: input.actionsFolder, context: input.context }
    await input.actionHistoryAppender(input.bridge, request, entry)
}

interface AppendCommandHistoryInput {
    action: ActionDefinition
    actionHistoryAppender: (
        bridge: ElectronActionBridge,
        request: ActionRunHistoryRequest,
        entry: ActionRunHistoryEntry,
    ) => Promise<ActionRunHistoryEntry[]>
    actionsFolder: string | null
    bridge: ElectronActionBridge
    command: string
    context: ActionContext
    project: ProjectReference
    result: CommandExecutionResult
}

/** Persist a command run only when it reported a commit, so the log can expose a diff view. */
export async function appendCommandHistory(input: AppendCommandHistoryInput) {
    const completedAt = new Date().toISOString()
    const output = combineOutput(input.result)
    const commit = extractCommitMetadata({
        actionId: input.action.id,
        completedAt,
        context: input.context,
        output,
        project: executionProject(input.project, input.result),
    })
    if (!commit) return

    if (!input.actionsFolder) throw new Error('Cannot store action history before project config is loaded')

    const entry: ActionRunHistoryEntry = {
        command: input.command,
        commit,
        completedAt,
        output,
        prompt: '',
        status: statusFromExitCode(input.result.exitCode),
    }
    const request = { actionId: input.action.id, actionsFolder: input.actionsFolder, context: input.context }
    await input.actionHistoryAppender(input.bridge, request, entry)
}
