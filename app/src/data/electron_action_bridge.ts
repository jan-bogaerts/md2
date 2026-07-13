import type { ActionContext } from './action_context'
import type { ActionScheduleTrigger } from './action_schedule_types'
import type { AgentConversation, AgentRunEvent } from './data_types'
import type { ThinkingLevel } from './agent_profiles'

export interface CommandExecutionResult {
    branch?: string
    command: string
    executionWorktree?: number | null
    exitCode: number
    repositoryRoot?: string
    stderr: string
    stdout: string
}

export interface AgentExecutionRequest {
    cardPath: string
    command: string
    prompt: string
    agent?: string
    model?: string
    sessionIdPattern?: string
    title?: string
}

export interface AgentActionExecutionRequest {
    actionId: string
    actionsFolder: string
    context: ActionContext
    extraInput: string
    agent?: string
    model?: string
    thinkingLevel?: ThinkingLevel
}

export type AgentRunRequest = AgentActionExecutionRequest | AgentExecutionRequest

export interface CommandActionExecutionRequest {
    actionId: string
    actionsFolder: string
    context: ActionContext
    extraInput: string
}

export interface AgentExecutionResult extends CommandExecutionResult {
    agent?: string
    conversation: AgentConversation
    model?: string
    prompt: string
    reference: string
    runId: string
    thinkingLevel?: ThinkingLevel
}

export interface ActionRunHistoryRequest {
    actionId: string
    actionsFolder: string
    context: ActionContext
}

export interface ActionScheduleRegistrationRequest {
    actionId: string
    context: ActionContext
    trigger: ActionScheduleTrigger
}

/** Commit produced by an action run; presence enables the diff view for a log entry. */
export interface CommitMetadata {
    actionId: string
    branch: string
    commit: string
    completedAt: string
    filePaths: string[]
    repositoryRoot: string
}

export interface ActionRunHistoryEntry {
    agent?: string | null
    command?: string
    commit?: CommitMetadata
    completedAt: string
    model?: string
    output: string
    prompt: string
    status: 'completed' | 'failed'
    thinkingLevel?: ThinkingLevel
}

/** Request to render a commit's diff through the configured Electron command template. */
export interface DiffRequest {
    branch: string
    commit: string
    filePath: string
    repositoryRoot: string
    template: string
}

/**
 * One changed file in a diff. `oldValue`/`newValue` are the reconstructed sides fed to the viewer;
 * `oldLineNumbers`/`newLineNumbers` map each rendered side line back to its real file line.
 */
export interface DiffFile {
    newLineNumbers: number[]
    newValue: string
    oldLineNumbers: number[]
    oldValue: string
    path: string
}

export interface DiffResult {
    commit: string
    files: DiffFile[]
    repositoryRoot?: string
}

/** Request to open VS Code at a project file and line clicked in the diff view. */
export interface OpenInEditorRequest {
    line: number
    path: string
    repositoryRoot?: string
}

export interface ElectronActionBridge {
    appendActionRunHistory(request: ActionRunHistoryRequest, entry: ActionRunHistoryEntry): Promise<ActionRunHistoryEntry[]>
    generateDiff(request: DiffRequest): Promise<DiffResult>
    loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]>
    notifyActionCompleted?(actionId: string): Promise<void>
    onScheduledActionRun?(callback: (event: AgentRunEvent) => void): () => void
    openInEditor(request: OpenInEditorRequest): Promise<void>
    registerActionSchedule?(request: ActionScheduleRegistrationRequest): Promise<void>
    runAgent(request: AgentRunRequest, callback?: (event: AgentRunEvent) => void): Promise<AgentExecutionResult>
    runCommand(request: CommandActionExecutionRequest): Promise<CommandExecutionResult>
}

declare global {
    interface Window {
        md2Actions?: ElectronActionBridge
    }
}

let actionBridgeOverride: ElectronActionBridge | null = null

export function setActionBridgeOverride(bridge: ElectronActionBridge | null) {
    actionBridgeOverride = bridge
}

export function getElectronActionBridge() {
    if (actionBridgeOverride) return actionBridgeOverride

    return window.md2Actions ?? null
}
