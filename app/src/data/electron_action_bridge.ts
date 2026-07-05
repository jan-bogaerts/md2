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

export interface ActionRunHistoryEntry {
    completedAt: string
    output: string
    prompt: string
    status: 'completed' | 'failed'
}

export interface ElectronActionBridge {
    appendActionRunHistory(request: ActionRunHistoryRequest, entry: ActionRunHistoryEntry): Promise<ActionRunHistoryEntry[]>
    loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]>
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
