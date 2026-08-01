import type { ActionContext } from './action_context'
import type { AgentConversationEntry, AgentConversationEventEntry, AgentConversationMessageEntry } from './data_types'
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

export type AgentApprovalRequestId = number | string
export type AgentNetworkProtocol = 'http' | 'https' | 'socks5Tcp' | 'socks5Udp'
export type AgentFileSystemPath =
    | { path: string, type: 'path' }
    | { pattern: string, type: 'glob_pattern' }
    | { type: 'special', value: string }
export interface AgentAdditionalPermissions {
    fileSystem: {
        entries?: { access: 'deny' | 'read' | 'write', path: AgentFileSystemPath }[]
        read: string[] | null
        write: string[] | null
    } | null
    network: { enabled: boolean | null } | null
}
export type AgentCommandAction =
    | { command: string, name: string, path: string, type: 'read' }
    | { command: string, path: string | null, type: 'listFiles' }
    | { command: string, path: string | null, query: string | null, type: 'search' }
    | { command: string, type: 'unknown' }
export interface AgentNetworkPolicyAmendment {
    action: 'allow' | 'deny'
    host: string
}
export type AgentApprovalDecision =
    | 'accept'
    | 'acceptForSession'
    | 'cancel'
    | 'decline'
    | { acceptWithExecpolicyAmendment: { execpolicy_amendment: string[] } }
    | { applyNetworkPolicyAmendment: { network_policy_amendment: AgentNetworkPolicyAmendment } }
export interface AgentApproval {
    additionalPermissions?: AgentAdditionalPermissions | null
    approvalId?: string | null
    availableDecisions?: AgentApprovalDecision[] | null
    command?: string | null
    commandActions?: AgentCommandAction[] | null
    cwd?: string | null
    environmentId?: string | null
    filePaths: string[]
    grantRoot?: string | null
    itemId: string
    kind: 'commandExecution' | 'fileChange'
    networkApprovalContext?: { host: string, protocol: AgentNetworkProtocol } | null
    proposedExecpolicyAmendment?: string[] | null
    proposedNetworkPolicyAmendments?: AgentNetworkPolicyAmendment[] | null
    reason?: string | null
    requestId: AgentApprovalRequestId
    startedAtMs: number
    threadId: string
    turnId: string
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
        entries: AgentConversationEntry[]
        kind: 'agentStarted'
        reference: string
        startedAt: string
        title: string
    }
    | {
        kind: 'agentQuestion'
        questions: AgentQuestion[]
        requestId: number | string | null
    }
    | {
        approval: AgentApproval
        kind: 'agentApproval'
    }
    | {
        kind: 'agentApprovalResolved' | 'agentApprovalSubmitted'
        requestId: AgentApprovalRequestId
    }
    | {
        kind: 'agentQuestionAnswer' | 'agentUserMessage'
        userMessage: AgentConversationMessageEntry
    }
    | {
        event: AgentConversationEventEntry
        kind: 'agentEvent'
    }
    | {
        command?: string
        content: string
        kind: 'error' | 'output'
        messageId?: string
        sequence?: number
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
