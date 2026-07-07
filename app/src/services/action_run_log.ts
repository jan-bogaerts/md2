import type { ActionDefinition } from '../data/action_types'
import type { AgentExecutionResult, CommandExecutionResult } from '../data/electron_action_bridge'

export type RunStatus = 'completed' | 'failed'
export type RunPhase = 'after' | 'before' | 'main' | 'on'

export interface ActionRunLogEntry {
    actionName: string
    command: string | null
    message: string
    phase: RunPhase
    status: RunStatus
    stderr: string
    stdout: string
}

export function combineOutput(result: CommandExecutionResult | AgentExecutionResult) {
    return `${result.stdout}${result.stderr}`
}

export function statusFromExitCode(exitCode: number): RunStatus {
    return exitCode === 0 ? 'completed' : 'failed'
}

function messageFromCommandResult(action: ActionDefinition, result: CommandExecutionResult) {
    if (result.exitCode === 0) return `${action.label} completed`

    return `${action.label} failed with exit code ${result.exitCode}`
}

function messageFromAgentResult(action: ActionDefinition, result: AgentExecutionResult) {
    if (result.exitCode === 0) return `${action.label} completed`

    const output = (result.stderr.trim() || result.stdout.trim())
    if (output.length === 0) return `${action.label} failed with exit code ${result.exitCode}`

    return `${action.label} failed with exit code ${result.exitCode}: ${output}`
}

export function createFailureLog(action: ActionDefinition, phase: RunPhase, message: string): ActionRunLogEntry {
    return { actionName: action.name, command: null, message, phase, status: 'failed', stderr: message, stdout: '' }
}

export function createCommandLog(
    action: ActionDefinition,
    phase: RunPhase,
    command: string,
    result: CommandExecutionResult,
): ActionRunLogEntry {
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

export function createAgentLog(
    action: ActionDefinition,
    phase: RunPhase,
    command: string,
    result: AgentExecutionResult,
): ActionRunLogEntry {
    return {
        actionName: action.name,
        command,
        message: messageFromAgentResult(action, result),
        phase,
        status: statusFromExitCode(result.exitCode),
        stderr: result.stderr,
        stdout: result.stdout,
    }
}
