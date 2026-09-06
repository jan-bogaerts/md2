import type { ActionContext } from './action_context'
import type {
    AgentContextWindowUsage,
    AgentConversation,
    AgentQuestion,
    AgentConversationEventEntry,
    AgentConversationMessageEntry,
    AgentConversationTimer,
    AgentTokenUsage,
} from './data_types'
import type { PermissionMode, ThinkingLevel } from './agent_profiles'
import type { ActionAutoFinish, ActionOutput, ActionType } from './action_types'

export type ActionRunTerminalStatus = 'cancelled' | 'completed' | 'failed' | 'okButNotAfter'
export type ActionRunStatus = ActionRunTerminalStatus | 'queued' | 'running' | 'waitingForInput'
export type ActionRunPhase = 'after' | 'before' | 'main' | 'on'

export interface ActionRunInput {
    agent?: string
    command?: string
    continueFrom?: string
    diagramPath?: string
    extraPrompt?: string
    model?: string
    permissionMode?: PermissionMode
    prompt?: string
    thinkingLevel?: ThinkingLevel
}

export interface ActionPromptRequest {
    actionId: string
    context: ActionContext
}

export interface PreparedActionPrompt {
    diagramPath?: string
    prompt: string
}

export interface ActionQueuedPrompt {
    content: string
    dispatchState: 'dispatching' | 'queued'
    id: string
    revision: number
}

export interface AgentConversationReservation {
    activityPath: string
    conversationId: string
    reference: string
}

export interface ActionStartRequest {
    actionId: string
    conversationReservation?: AgentConversationReservation
    context: ActionContext
    runInput: ActionRunInput
}

export type { AgentQuestion, AgentQuestionOption } from './data_types'

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
    input?: Record<string, unknown> | null
    itemId: string
    kind: 'commandExecution' | 'fileChange' | 'toolUse'
    networkApprovalContext?: { host: string, protocol: AgentNetworkProtocol } | null
    parentItemId?: string | null
    proposedExecpolicyAmendment?: string[] | null
    proposedNetworkPolicyAmendments?: AgentNetworkPolicyAmendment[] | null
    provider?: 'claude' | 'codex'
    permissionSuggestions?: unknown[] | null
    reason?: string | null
    requestId: AgentApprovalRequestId
    startedAtMs: number
    subAgentLabel?: string | null
    threadId?: string
    toolName?: string | null
    turnId?: string
}

interface ActionRunEventBase {
    actionId: string
    actionType?: ActionType
    autoFinish?: ActionAutoFinish | null
    changedPaths?: string[]
    context: ActionContext
    diagramPath?: string
    runId: string
    interactionReady?: boolean
    output?: ActionOutput | null
    phase: ActionRunPhase
    rootActionId: string
    sequence?: number
    streaming?: boolean
}

export type ActionRunUpdate =
    | {
        continued?: boolean
        conversation: AgentConversation
        kind: 'agentStarted'
    }
    | {
        conversation: AgentConversation
        kind: 'agentClosed'
    }
    | {
        kind: 'agentQuestion'
        questions: AgentQuestion[]
        requestId: number | string | null
    }
    | {
        event: AgentConversationEventEntry
        kind: 'agentQuestionDismissed'
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
        kind: 'agentQuestionAnswer'
        requestId: number | string | null
        userMessage: AgentConversationMessageEntry
    }
    | {
        kind: 'agentUserMessage'
        userMessage: AgentConversationMessageEntry
    }
    | {
        entryIndex: number
        event: AgentConversationEventEntry
        kind: 'agentEvent'
    }
    | {
        contextWindowUsage?: AgentContextWindowUsage | null
        kind: 'agentUsage'
        usage: AgentTokenUsage
    }
    | {
        entry: ActionQueuedPrompt
        kind: 'agentPromptQueued' | 'agentPromptEdited'
    }
    | {
        kind: 'agentPromptRemoved'
        promptId: string
        revision: number
    }
    | {
        command?: string
        content: string
        kind: 'error' | 'output'
    }
    | {
        content: string
        entryIndex: number
        kind: 'agentOutput'
        messageId: string
        previousContent?: string
        replace?: boolean
        sequence: number
    }

export type ActionRunEvent =
    | ActionRunEventBase & {
        status: ActionRunStatus
        type: 'run'
    }
    | ActionRunEventBase & {
        command?: string
        conversationId?: string
        runWorktree?: number | null
        message?: string | null
        permissionMode?: PermissionMode
        reference?: string
        status: ActionRunStatus
        thinkingLevel?: ThinkingLevel
        type: 'action'
    }
    | ActionRunEventBase & {
        status: 'running' | 'waitingForInput'
        timer?: AgentConversationTimer
        type: 'agentState'
    }
    | ActionRunEventBase & {
        status: ActionRunStatus
        type: 'update'
        update: ActionRunUpdate
    }

export interface ActionRunLogEntry {
    actionId: string
    actionName: string
    command: string | null
    message: string
    phase: ActionRunPhase
    permissionMode?: PermissionMode
    status: ActionRunStatus
    stderr: string
    stdout: string
    thinkingLevel?: ThinkingLevel
}

export interface ActionRunResult {
    changedPaths: string[]
    diagramPath?: string
    logs: ActionRunLogEntry[]
    status: ActionRunStatus
}
