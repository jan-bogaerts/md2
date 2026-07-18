import type { ActionContext } from './action_context'
import type { AgentConversationMessage } from './data_types'
import type { ThinkingLevel } from './agent_profiles'

export type ActionRunStatus = 'cancelled' | 'completed' | 'failed' | 'okButNotAfter'
export type ActionExecutionStatus = ActionRunStatus | 'running'
export type ActionRunPhase = 'after' | 'before' | 'main' | 'on'

export interface ActionRunInput {
    agent?: string
    continueFrom?: string
    extraPrompt?: string
    model?: string
    prompt?: string
    thinkingLevel?: ThinkingLevel
}

export interface ActionPromptRequest {
    actionId: string
    context: ActionContext
}

export interface PreparedActionPrompt {
    prompt: string
}

export interface ActionStartRequest {
    actionId: string
    context: ActionContext
    runInput: ActionRunInput
}

interface ActionExecutionEventBase {
    actionId: string
    context: ActionContext
    executionId: string
    phase: ActionRunPhase
    rootActionId: string
}

export type ActionExecutionUpdate =
    | {
        conversationId: string
        kind: 'agentStarted'
        reference: string
        startedAt: string
        title: string
        userMessage: AgentConversationMessage
    }
    | {
        command?: string
        content: string
        kind: 'error' | 'output'
    }

export type ActionExecutionEvent =
    | ActionExecutionEventBase & {
        status: ActionExecutionStatus
        type: 'execution'
    }
    | ActionExecutionEventBase & {
        command?: string
        executionWorktree?: number | null
        message?: string | null
        reference?: string
        runId?: string
        status: ActionExecutionStatus
        thinkingLevel?: ThinkingLevel
        type: 'action'
    }
    | ActionExecutionEventBase & {
        status: 'running'
        type: 'update'
        update: ActionExecutionUpdate
    }

export interface ActionRunLogEntry {
    actionId: string
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
