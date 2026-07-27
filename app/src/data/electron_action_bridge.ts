import type { ActionContext } from './action_context'
import type { CardActivityFile } from '../../../shared/card_activity.mjs'
import type { ActionScheduleTrigger } from './action_schedule_types'
import type { AgentRunEvent } from './data_types'
import type { AgentAvailability } from './electron_data_bridge'
import type { ThinkingLevel } from './agent_profiles'
import type { ActionExecutionEvent, ActionPromptRequest, ActionStartRequest, PreparedActionPrompt } from './action_run_types'

export interface ActionRunHistoryRequest {
    actionId: string
    context: ActionContext
}

export interface CardActivityRequest {
    cardInternalId: string
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

export interface ActionRunHistoryEntry {
    agent?: string | null
    command?: string
    commits?: CommitReference[]
    completedAt: string
    model?: string
    output: string
    prompt: string
    status: 'completed' | 'failed'
    thinkingLevel?: ThinkingLevel
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
    repositoryRoot?: string
}

/** Request to open VS Code at a project file and line clicked in the diff view. */
export interface OpenInEditorRequest {
    line: number
    path: string
    repositoryRoot?: string
}

export interface ElectronActionBridge {
    answerActionQuestion?(executionId: string, requestId: number | string | null, answers: Record<string, string[]>): Promise<void>
    cancelActionExecution(executionId: string): Promise<void>
    finishActionExecution?(executionId: string): Promise<void>
    generateDiff(request: DiffRequest): Promise<DiffResult>
    loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]>
    loadActiveActionExecutionEvents?(): Promise<ActionExecutionEvent[]>
    notifyActionCardStateChange?(cardInternalId: string, state: string): Promise<void>
    loadCardActivity?(request: CardActivityRequest): Promise<CardActivityFile>
    loadAgentAvailability?(): Promise<Record<string, AgentAvailability>>
    onActionExecution(callback: (event: ActionExecutionEvent) => void): () => void
    openInEditor(request: OpenInEditorRequest): Promise<void>
    prepareActionPrompt(request: ActionPromptRequest): Promise<PreparedActionPrompt>
    readFileAtCommit?(request: ReadFileAtCommitRequest): Promise<HistoricalFileContent>
    registerActionSchedule?(request: ActionScheduleRegistrationRequest): Promise<void>
    runSearchRegexpAgent(input: string, callback?: (event: AgentRunEvent) => void): Promise<string>
    sendActionMessage?(executionId: string, content: string): Promise<void>
    sendActionQueuedMessage?(executionId: string, revision: number): Promise<void>
    setActionQueuedMessage?(executionId: string, content: string, revision: number): Promise<void>
    startAction(request: ActionStartRequest): Promise<string>
    startUnattendedAction?(request: ActionStartRequest): Promise<string>
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

export function hasExecutionBackend() {
    return getElectronActionBridge() !== null
}
