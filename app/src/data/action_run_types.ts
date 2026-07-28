import type { ActionContext } from './action_context'
import type { AgentConversationMessage } from './data_types'
import type { ThinkingLevel } from './agent_profiles'
import type { ActionAutoFinish, ActionType } from './action_types'

export type ActionRunStatus = 'cancelled' | 'completed' | 'failed' | 'okButNotAfter'
export type ActionExecutionStatus = ActionRunStatus | 'queued' | 'running' | 'waitingForInput'
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

export interface AgentQuestionOption {
    description?: string
    label: string
}

export interface AgentQuestion {
    header: string
    id: string
    isOther?: boolean
    isSecret?: boolean
    options?: AgentQuestionOption[] | null
    question: string
}

interface ActionExecutionEventBase {
    actionId: string
    actionType?: ActionType
    autoFinish?: ActionAutoFinish | null
    context: ActionContext
    executionId: string
    interactionReady?: boolean
    phase: ActionRunPhase
    rootActionId: string
    sequence?: number
    streaming?: boolean
}

export type ActionExecutionUpdate =
    | {
        continued?: boolean
        conversationId: string
        kind: 'agentStarted'
        reference: string
        startedAt: string
        title: string
        userMessage: AgentConversationMessage
    }
    | {
        kind: 'agentQuestion'
        questions: AgentQuestion[]
        requestId: number | string | null
    }
    | {
        kind: 'agentQuestionAnswer' | 'agentUserMessage'
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
        status: 'running' | 'waitingForInput'
        type: 'agentState'
    }
    | ActionExecutionEventBase & {
        status: 'running' | 'waitingForInput'
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
