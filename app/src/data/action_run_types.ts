import type { ActionContext } from './action_context'
import type { AgentConversation, AgentRunEvent } from './data_types'
import type { ThinkingLevel } from './agent_profiles'

export type ActionRunStatus = 'cancelled' | 'completed' | 'failed' | 'okButNotAfter'
export type ActionExecutionStatus = ActionRunStatus | 'running'
export type ActionRunPhase = 'after' | 'before' | 'main' | 'on'

export interface ActionRunInput {
    agent?: string
    continueFrom?: string
    extraPrompt?: string
    model?: string
    thinkingLevel?: ThinkingLevel
}

export interface ActionStartRequest {
    actionId: string
    context: ActionContext
    runInput: ActionRunInput
}

export interface ActionExecutionEvent {
    actionId: string
    agentEvent?: AgentRunEvent
    command?: string
    conversation?: AgentConversation
    context: ActionContext
    executionId: string
    executionWorktree?: number | null
    message?: string | null
    phase: ActionRunPhase
    reference?: string
    rootActionId: string
    runId?: string
    status: ActionExecutionStatus
    stderr?: string
    stdout?: string
    thinkingLevel?: ThinkingLevel
    type: 'action' | 'agent' | 'execution'
}

export interface ActionRunLogEntry {
    actionName: string
    command: string | null
    message: string
    phase: ActionRunPhase
    status: ActionExecutionStatus
    stderr: string
    stdout: string
    thinkingLevel?: ThinkingLevel
}

export interface ActionRunResult {
    logs: ActionRunLogEntry[]
    status: ActionRunStatus
}
