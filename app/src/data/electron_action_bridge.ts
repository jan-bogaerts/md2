import type { ActionContext } from './action_context'
import type { ActionScheduleTrigger } from './action_schedule_types'
import type { AgentConversation, AgentRunEvent } from './data_types'

export interface CommandExecutionResult {
    command: string
    exitCode: number
    stderr: string
    stdout: string
}

export interface AgentExecutionRequest {
    agent?: string
    cardPath: string
    command: string
    model?: string
    prompt: string
    sessionIdPattern?: string
    title?: string
}

export interface CommandActionExecutionRequest {
    actionName: string
    actionsFolder: string
    context: ActionContext
    extraInput: string
}

export interface AgentExecutionResult extends CommandExecutionResult {
    conversation: AgentConversation
    prompt: string
    reference: string
    runId: string
}

export interface ActionRunHistoryRequest {
    actionName: string
    actionsFolder: string
    context: ActionContext
}

export interface ActionScheduleRegistrationRequest {
    actionName: string
    context: ActionContext
    trigger: ActionScheduleTrigger
}

/** Commit produced by an action run; presence enables the diff view for a log entry. */
export interface CommitMetadata {
    branch: string
    commit: string
    completedAt: string
    actionName: string
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
}

/** Request to render a commit's diff through the configured Electron command template. */
export interface DiffRequest {
    branch: string
    commit: string
    filePath: string
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
}

/** Request to open VS Code at a project file and line clicked in the diff view. */
export interface OpenInEditorRequest {
    line: number
    path: string
}

export interface ElectronActionBridge {
    appendActionRunHistory(request: ActionRunHistoryRequest, entry: ActionRunHistoryEntry): Promise<ActionRunHistoryEntry[]>
    generateDiff(request: DiffRequest): Promise<DiffResult>
    loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]>
    notifyActionCompleted?(actionName: string): Promise<void>
    onScheduledActionRun?(callback: (event: AgentRunEvent) => void): () => void
    openInEditor(request: OpenInEditorRequest): Promise<void>
    registerActionSchedule?(request: ActionScheduleRegistrationRequest): Promise<void>
    runAgent(request: AgentExecutionRequest, callback?: (event: AgentRunEvent) => void): Promise<AgentExecutionResult>
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
