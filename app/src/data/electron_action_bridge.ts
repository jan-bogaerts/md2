import type { ActionContext } from './action_context'

export interface CommandExecutionResult {
    command: string
    exitCode: number
    stderr: string
    stdout: string
}

export interface AgentExecutionRequest {
    command: string
    prompt: string
}

export interface AgentExecutionResult extends CommandExecutionResult {
    prompt: string
}

export interface ActionRunHistoryRequest {
    actionName: string
    actionsFolder: string
    context: ActionContext
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
    command?: string
    commit?: CommitMetadata
    completedAt: string
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
    openInEditor(request: OpenInEditorRequest): Promise<void>
    runAgent(request: AgentExecutionRequest): Promise<AgentExecutionResult>
    runCommand(command: string): Promise<CommandExecutionResult>
}

declare global {
    interface Window {
        md2Actions?: ElectronActionBridge
    }
}

export function getElectronActionBridge() {
    return window.md2Actions ?? null
}
