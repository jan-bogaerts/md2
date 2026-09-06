import type { ActionContext } from './action_context'
import type { ActionSettings, CardActivityFile } from '../../../shared/card_activity.mjs'
import type { ActionScheduleTrigger } from './action_schedule_types'
import type { AgentConversation, AgentRunEvent } from './data_types'
import type { AgentAvailability } from './electron_data_bridge'
import type { PermissionMode, ThinkingLevel } from './agent_profiles'
import type {
    ActionRunEvent,
    ActionRunTerminalStatus,
    ActionQueuedPrompt,
    ActionPromptRequest,
    ActionStartRequest,
    AgentConversationReservation,
    AgentApprovalDecision,
    AgentApprovalRequestId,
    PreparedActionPrompt,
} from './action_run_types'

export interface ActionRunRecoveryTerminalResult {
    changedPaths: string[]
    diagramPath?: string
    failure: string | null
    runId: string
    status: ActionRunTerminalStatus
}

export interface ActionRunRecoverySnapshot {
    activeRunEvents: ActionRunEvent[]
    terminalResults: ActionRunRecoveryTerminalResult[]
}

export interface ActionRunHistoryRequest {
    actionId: string
    context: ActionContext
}

export interface CardActivityRequest {
    cardInternalId: string
}

export interface CardActionSettingsRequest {
    actionId: string
    cardInternalId: string
    settings: ActionSettings
}

export interface ReadFileAtCommitRequest {
    commit: string
    parent: boolean
    path: string
}

export interface HistoricalFileContent {
    content: string
    exists: boolean
}

export interface ActionScheduleRegistrationRequest {
    actionId: string
    context: ActionContext
    trigger: ActionScheduleTrigger
}

/** Commit produced during an action chain and owned by its root run. */
export interface CommitReference {
    actionId: string
    actionName: string
    branch: string
    commit: string
    committedAt: string
    deletions: number
    filePaths: string[]
    filesChanged: number
    insertions: number
    repositoryRoot: string
}

interface ActionRunHistoryEntryBase {
    commits?: CommitReference[]
    completedAt: string
    startedAt: string
    status: 'cancelled' | 'completed' | 'failed' | 'okButNotAfter'
}

export interface AgentActionRunHistoryEntry extends ActionRunHistoryEntryBase {
    agent?: string | null
    model?: string
    permissionMode?: PermissionMode
    rootConversationId: string
    thinkingLevel?: ThinkingLevel
    type: 'agent'
}

export interface CommandActionRunHistoryEntry extends ActionRunHistoryEntryBase {
    command: string
    output: string
    type: 'command'
}

export type ActionRunHistoryEntry = AgentActionRunHistoryEntry | CommandActionRunHistoryEntry

/** Request to render a commit's diff through the configured Electron command template. */
export interface DiffRequest {
    branch: string
    commit: string
    filePath: string
    projectFolder: string
    releasesFolder: string
    template: string
    workingFolder: string
}

/**
 * One changed file in a diff. `oldValue`/`newValue` are the reconstructed sides fed to the viewer;
 * `oldLineNumbers`/`newLineNumbers` map each rendered side line back to its real file line.
 */
export interface DiffFile {
    changeType?: 'added' | 'deleted' | 'modified' | 'renamed'
    newLineNumbers: number[]
    newValue: string
    oldLineNumbers: number[]
    oldPath?: string
    oldValue: string
    path: string
}

export interface DiffResult {
    commit: string
    files: DiffFile[]
    repositoryRoot?: string
}

export interface WorktreeDiffRequest {
    worktree: number
}

export interface WorktreeDiffResult {
    files: DiffFile[]
    repositoryRoot: string
}

/** Request to open a local file in configured external editor. */
export interface OpenInEditorRequest {
    line?: number
    path: string
    repositoryRoot?: string
}

/** In-flight action run reported by the desktop runner while a release asks to start. */
export interface ActiveActionRun {
    label: string
    runId: string
}

export interface ElectronActionBridge {
    acquireReleaseCardLocks?(cardInternalIds: string[]): Promise<string>
    answerActionApproval?(runId: string, requestId: AgentApprovalRequestId, decision: AgentApprovalDecision): Promise<void>
    answerActionQuestion?(runId: string, requestId: number | string | null, answers: Record<string, string[]>): Promise<void>
    cancelActionRun(runId: string): Promise<void>
    closeWaitingActionConversation?(reference: string, status: 'cancelled' | 'completed'): Promise<AgentConversation>
    dismissWaitingActionConversationQuestions?(reference: string): Promise<AgentConversation>
    deleteActionQueuedPrompt?(runId: string, promptId: string, revision: number): Promise<{ deleted: true }>
    dismissActionQuestions?(runId: string, requestId: number | string | null): Promise<void>
    editActionQueuedPrompt?(runId: string, promptId: string, revision: number, content: string): Promise<ActionQueuedPrompt>
    enqueueActionPrompt?(runId: string, content: string): Promise<ActionQueuedPrompt>
    finishActionRun?(runId: string): Promise<void>
    generateDiff(request: DiffRequest): Promise<DiffResult>
    generateWorktreeDiff(request: WorktreeDiffRequest): Promise<WorktreeDiffResult>
    listActiveActionRuns?(): Promise<ActiveActionRun[]>
    loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]>
    loadActionRunRecoverySnapshot?(rendererRunIds: string[]): Promise<ActionRunRecoverySnapshot>
    notifyActionCardStateChange?(cardInternalId: string, state: string): Promise<void>
    loadCardActivity?(request: CardActivityRequest): Promise<CardActivityFile>
    loadAgentAvailability?(): Promise<Record<string, AgentAvailability>>
    onActionRun(callback: (event: ActionRunEvent) => void): () => void
    openInEditor(request: OpenInEditorRequest): Promise<void>
    prepareActionPrompt(request: ActionPromptRequest): Promise<PreparedActionPrompt>
    readFileAtCommit?(request: ReadFileAtCommitRequest): Promise<HistoricalFileContent>
    releaseReleaseCardLocks?(leaseId: string): Promise<void>
    registerActionSchedule?(request: ActionScheduleRegistrationRequest): Promise<void>
    reserveActionConversation?(request: ActionStartRequest): Promise<AgentConversationReservation>
    restartActionRun?(runId: string, request: ActionStartRequest): Promise<string>
    runSearchRegexpAgent(input: string, callback?: (event: AgentRunEvent) => void): Promise<string>
    sendActionMessage?(runId: string, content: string): Promise<void>
    startAction(request: ActionStartRequest): Promise<string>
    startUnattendedAction?(request: ActionStartRequest): Promise<string>
    updateActionConversationViewed?(reference: string, viewed: boolean): Promise<AgentConversation>
    updateCardActionSettings?(request: CardActionSettingsRequest): Promise<void>
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

export function hasActionRunBackend() {
    return getElectronActionBridge() !== null
}
