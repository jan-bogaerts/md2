import type { ActionFile } from './action_types'
import type { ActionSchedule } from './action_schedule_types'
import { DEFAULT_COLOR_SCHEME } from '../theme/theme_config'
import type { ProjectBackgroundShade } from '../theme/project_background_shade'
import type { ActivityStatsCalculationResult } from '../../../shared/project_stats.mjs'
import {
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_ARCHIVED_FOLDER,
    DEFAULT_DIAGRAMS_FOLDER,
    DEFAULT_DIAGRAM_FOOTER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_RELEASES_FOLDER,
    DEFAULT_WORKING_FOLDER,
    joinProjectFolderPath,
} from '../../../shared/project_config_defaults.mjs'
import { DEFAULT_CARD_SEPARATOR, type CardSeparator } from './card_identifiers'
import type {
    MergeConflictPathRequest,
    MergeConflictSession,
    MergeConflictSessionRequest,
    WorktreeOperationOutcome,
} from './merge_conflict_types'

export {
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_ARCHIVED_FOLDER,
    DEFAULT_DIAGRAMS_FOLDER,
    DEFAULT_DIAGRAM_FOOTER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_RELEASES_FOLDER,
    DEFAULT_WORKING_FOLDER,
}
export const DEFAULT_DIFF_COMMAND = 'git show {{commit}}'
export const AUTO_COMMIT_DELAY_MS = 30000

/** Card type id; projects can configure custom types beyond the default feature/job/bug. */
export type CardType = string
export type PushMode = 'auto' | 'manual'

export interface CardTypeConfig {
    color: string
    idPrefix: string
    label: string
    type: CardType
}

export interface StateConfig {
    alwaysVisible: boolean
    color?: string
    defaultActionId?: string
    state: string
}

export interface ProjectConfig {
    actionsFolder: string
    archivedFolder: string
    backgroundShade: ProjectBackgroundShade
    cardSeparator: CardSeparator
    cardTypes: CardTypeConfig[]
    diffCommand: string
    diagramFooter: string
    diagramsFolder: string
    projectFolder: string
    pushMode: PushMode
    releasesFolder: string
    states: StateConfig[]
    workingFolder: string
}

/** How a file's `content` is encoded for the storage write path. Binary assets use base64. */
export type FileEncoding = 'utf-8' | 'base64'

export interface MarkdownFile {
    content: string
    encoding?: FileEncoding
    path: string
    sha?: string
}

export interface ProjectAsset {
    content: string
    contentType: string
    encoding: 'base64'
    path: string
}

export interface CardHeader {
    affects: string[]
    after: string | null
    /** Terminal conversation references inside activity files; the name mirrors the persisted `agents` field. */
    agentLogReferences: string[]
    author: string | null
    branch?: string | null
    changedFiles: string[]
    id: string
    internalId: string | null
    owner: string | null
    policy: Record<string, boolean>
    references: string[]
    sentryBaseUrl?: string
    sentryIssueId?: string
    sentryOrganization?: string
    status: string | null
    title: string
    worktree?: number | null
    worktreeError?: string | null
    worktreeValue?: string | null
}

export interface Card {
    agentConversationErrors: AgentConversationError[]
    agentConversations: AgentConversation[]
    content: string
    hasFrontmatter: boolean
    header: CardHeader
    isActive: boolean
    path: string
    sha?: string
}

export interface ProjectSnapshot {
    activeCards: Card[]
    backgroundCards: Card[]
    repositoryFiles: string[]
    workingFolder: string
}

export interface CardDraft {
    body: string
    title: string
    type: CardType
}

export interface ProjectReference {
    branch: string
    id: string
    owner?: string
    repository?: string
    rootPath?: string
}

/** The disposition of the checkout folder when a linked worktree is removed from Git. */
export type WorktreeRemovalMode = 'files' | 'folder' | 'unregister'

export interface WorktreeRecord {
    branch: string | null
    error: string | null
    /** Null on an invalid record: no Git command is run inside a worktree Git already reports as broken. */
    parkingBranch: string | null
    path: string
    status: WorktreeStatus
    valid: boolean
}

export interface WorktreeState {
    error: string | null
    primaryStatus: WorktreeStatus | null
    project: ProjectReference | null
    records: WorktreeRecord[]
}

export interface WorktreeStatus {
    /** Commits on the worktree branch that the configured upstream lacks; 0 when there is no upstream. */
    ahead: number
    /** Commits on the worktree branch that the project branch lacks. */
    baseAhead: number
    /** Commits on the project branch that the worktree branch lacks; cleared by rebasing. */
    baseBehind: number
    /** Commits on the configured upstream that the worktree branch lacks; 0 when there is no upstream. */
    behind: number
    dirty: boolean
    hasUpstream: boolean
}

export interface PrepareWorktreeRequest {
    branchName?: string
    project: ProjectReference
    worktree: number
}

export interface WorktreeOperationRequest {
    project: ProjectReference
    worktree: number
}

export interface CardWorktreeIntegrationRequest extends WorktreeOperationRequest {
    branchName: string
    cardInternalId: string
    deleteBranch: boolean
    projectFolder: string
}

export type IntegrateWorktreeRequest = CardWorktreeIntegrationRequest | WorktreeOperationRequest

export interface CommitWorktreeRequest extends WorktreeOperationRequest {
    message: string
}

export interface RepositoryReference extends ProjectReference {
    owner: string
    repository: string
}

export interface BranchReference {
    name: string
}

export interface ReleaseBranchCandidate {
    branchName: string
    cardId: string
    cardPath: string
}

export interface TopLevelFolderReference {
    name: string
    path: string
}

export const MISSING_WORKING_FOLDER_ERROR = 'missing-working-folder'

export class MissingWorkingFolderError extends Error {
    code: typeof MISSING_WORKING_FOLDER_ERROR
    workingFolder: string

    constructor(workingFolder: string) {
        super(`Working folder is missing: ${workingFolder}`)
        this.code = MISSING_WORKING_FOLDER_ERROR
        this.workingFolder = workingFolder
    }
}

export function isMissingWorkingFolderError(error: unknown): error is MissingWorkingFolderError {
    if (!error || typeof error !== 'object') return false

    const storageError = error as { code?: unknown; workingFolder?: unknown }

    return storageError.code === MISSING_WORKING_FOLDER_ERROR && typeof storageError.workingFolder === 'string'
}

export interface CommitRequest {
    branch: string
    files: MarkdownFile[]
    message: string
    moves?: MoveFile[]
}

export type CommitResult = MarkdownFile[]

export interface MoveFile {
    content: string
    encoding?: FileEncoding
    fromPath: string
    sha?: string
    toPath: string
}

export interface MoveFilesRequest {
    branch: string
    message: string
    moves: MoveFile[]
}

export interface DeleteFileRequest {
    branch: string
    message: string
    path: string
    sha?: string
}

export interface DeleteFolderRequest {
    branch: string
    message: string
    path: string
}

export type ProjectWatchChangeKind = 'added' | 'changed' | 'removed' | 'unknown'

export interface ProjectWatchEvent {
    changeKind: ProjectWatchChangeKind
    path: string
}

export type ProjectWatchNotification = ProjectWatchEvent | { error: string }

/** A background agent/action currently running against a card or file. */
export interface RunningAgent {
    id: string
    label: string
}

export type AgentConversationStatus = 'cancelled' | 'completed' | 'failed' | 'running' | 'waitingForInput'
export type AgentMessageRole = 'assistant' | 'user'

export interface AgentConversationMessage {
    agent?: string
    content: string
    id: string
    role: AgentMessageRole
    sequence?: number
    timestamp: string
}

export interface AgentProviderSession {
    agent: string
    conversationId: string
    createdAt: string
    lastUsedAt: string
    synchronizedThroughMessageId: string
}

export interface AgentConversationEvent {
    command?: string
    content: string
    deletions?: number
    details?: string[]
    durationMs?: number
    exitCode?: number
    id: string
    insertions?: number
    label?: string
    output?: string
    paths?: string[]
    parentItemId?: string
    providerItemId?: string
    runningSubThreads?: number
    sequence?: number
    status?: string
    summary?: string[]
    timestamp: string
    type: string
    workingDirectory?: string
}

export interface AgentConversationMessageEntry extends AgentConversationMessage {
    kind: 'message'
}

export interface AgentConversationEventEntry extends AgentConversationEvent {
    kind: 'event'
}

export type AgentConversationEntry = AgentConversationMessageEntry | AgentConversationEventEntry

export interface AgentTokenUsage {
    cachedInputTokens: number
    costUsd?: number
    inputTokens: number
    legacyTotalTokens?: number
    outputTokens: number
    reasoningTokens: number
    totalTokens: number
}

export interface AgentContextWindowUsage {
    capacityTokens: number
    usedTokens: number
}

export interface AgentConversationTimer {
    elapsedMs: number
    runningStartedAt: string | null
}

export interface AgentConversation {
    actionId?: string | null
    cardInternalId?: string | null
    cardPath: string | null
    completedAt: string | null
    contextWindowUsage?: AgentContextWindowUsage
    entries: AgentConversationEntry[]
    hasExplicitTitle: boolean
    id: string
    path: string
    providerSessions: AgentProviderSession[]
    startedAt: string
    status: AgentConversationStatus
    timer?: AgentConversationTimer
    title: string
    usage?: AgentTokenUsage
    usageSchemaVersion?: number
    viewed: boolean
}

export interface AgentConversationError {
    /** Set when the failure came from an onState action instead of an activity file load. */
    kind?: 'onStateAction'
    message: string
    /** Activity file that failed to load, or the action id for an onState action failure. */
    path: string
}

export type AgentRunEvent =
    | {
        conversation: AgentConversation
        runId: string
        type: 'started'
    }
    | {
        event: AgentConversationEventEntry
        runId: string
        type: 'agentEvent'
    }
    | {
        content: string
        runId: string
        type: 'error' | 'output'
    }
    | {
        conversation: AgentConversation
        runId: string
        type: 'closed'
    }

export interface StorageProjectFiles {
    files: MarkdownFile[]
    workingFolder: string
}

export interface StorageService {
    addWorktree?(project: ProjectReference, folderPath: string): Promise<void>
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<CommitResult>
    commitWorktree?(request: CommitWorktreeRequest): Promise<void>
    createProject(project: ProjectReference, folders: string[]): Promise<ProjectReference>
    deleteFile(request: DeleteFileRequest): Promise<void>
    deleteFolder(request: DeleteFolderRequest): Promise<void>
    deleteLocalBranch?(project: ProjectReference, branchName: string): Promise<void>
    discardWorktreeChanges?(request: WorktreeOperationRequest): Promise<void>
    discardPendingCommits?(project: ProjectReference): void
    hasPendingPush?(project: ProjectReference): boolean
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    listAgentConversationReferences?(project: ProjectReference, projectFolder: string): Promise<string[]>
    listRepositories(): Promise<RepositoryReference[]>
    loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]>
    loadActionSchedules?(project: ProjectReference, actionsFolder: string): Promise<ActionSchedule[]>
    cancelActionSchedule?(project: ProjectReference, actionsFolder: string, scheduleId: string): Promise<ActionSchedule[]>
    calculateActivityStats?(project: ProjectReference, paths: string[], calculationId: string): Promise<ActivityStatsCalculationResult>
    cancelActivityStatsCalculation?(calculationId: string): Promise<void>
    loadAgentConversation?(project: ProjectReference, path: string): Promise<AgentConversation>
    loadActivityConversations?(project: ProjectReference, path: string): Promise<AgentConversation[]>
    loadProjectAsset?(project: ProjectReference, path: string): Promise<ProjectAsset>
    loadTextFile?(project: ProjectReference, path: string): Promise<MarkdownFile>
    loadProject(project: ProjectReference, workingFolder: string, excludedRootFolder?: string): Promise<StorageProjectFiles>
    loadFile?(project: ProjectReference, path: string): Promise<MarkdownFile>
    loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    onWorktreesChanged?(callback: (state: WorktreeState) => void): () => void
    restorePendingCommits?(project: ProjectReference): Promise<void>
    resolveProject?(project: ProjectReference): Promise<ProjectReference>
    listRepositoryFiles(project: ProjectReference): Promise<string[]>
    listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]>
    loadPendingPush?(project: ProjectReference): Promise<void>
    integrateWorktree?(request: IntegrateWorktreeRequest): Promise<WorktreeOperationOutcome>
    abortMergeConflict?(request: MergeConflictSessionRequest): Promise<void>
    continueMergeConflict?(request: MergeConflictSessionRequest): Promise<WorktreeOperationOutcome>
    getMergeConflictSession?(): Promise<MergeConflictSession | null>
    launchMergeConflictResolver?(request: MergeConflictPathRequest): Promise<void>
    markMergeConflictResolved?(request: MergeConflictPathRequest): Promise<MergeConflictSession>
    onMergeConflictSessionChanged?(callback: (session: MergeConflictSession | null) => void): () => void
    rescanMergeConflict?(request: MergeConflictSessionRequest): Promise<MergeConflictSession>
    moveFiles(request: MoveFilesRequest): Promise<void>
    parkWorktree?(request: WorktreeOperationRequest): Promise<void>
    prepareWorktree?(request: PrepareWorktreeRequest): Promise<void>
    pull?(project: ProjectReference): Promise<void>
    pullWorktree?(request: WorktreeOperationRequest): Promise<void>
    rebaseWorktree?(request: WorktreeOperationRequest): Promise<WorktreeOperationOutcome>
    push(project: ProjectReference): Promise<void>
    pushWorktree?(request: WorktreeOperationRequest): Promise<void>
    refreshWorktrees?(project: ProjectReference): Promise<void>
    saveActionSchedules?(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    selectWorktreeFolder?(): Promise<string | null>
    removeWorktree?(project: ProjectReference, folderPath: string, mode: WorktreeRemovalMode): Promise<void>
    stopAgent?(project: ProjectReference, runId: string): Promise<void>
    watchProject?(
        project: ProjectReference,
        onChange: (event: ProjectWatchEvent) => void,
        onRestored: () => void,
        onError: (error: Error) => void,
    ): () => void
}

const BUG_CARD_COLOR = '#d32f2f'

export const DEFAULT_COLUMN_ACCENTS = ['#9c4dcc', '#29a8e0', '#ed6c02', '#f9a825', '#43a047']

/** Resolve the repeating default accent assigned by configured column position. */
export function defaultColumnAccent(index: number) {
    if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid column index: ${index}`)

    return DEFAULT_COLUMN_ACCENTS[index % DEFAULT_COLUMN_ACCENTS.length]
}

export const DEFAULT_CARD_TYPES: CardTypeConfig[] = [
    { color: DEFAULT_COLOR_SCHEME.primary.regular, idPrefix: 'F', label: 'Feature', type: 'feature' },
    { color: DEFAULT_COLOR_SCHEME.secondary.regular, idPrefix: 'J', label: 'Job', type: 'job' },
    { color: BUG_CARD_COLOR, idPrefix: 'B', label: 'Bug', type: 'bug' },
]

export const DEFAULT_STATES: StateConfig[] = [
    { alwaysVisible: true, color: defaultColumnAccent(0), state: 'new' },
    { alwaysVisible: true, color: defaultColumnAccent(1), state: 'design' },
    { alwaysVisible: true, color: defaultColumnAccent(2), state: 'ready for implementation' },
    { alwaysVisible: true, color: defaultColumnAccent(3), state: 'to fix' },
    { alwaysVisible: true, color: defaultColumnAccent(4), state: 'ready' },
]

export function resolveProjectConfigPaths(config: ProjectConfig): ProjectConfig {
    return {
        ...config,
        actionsFolder: joinProjectFolderPath(config.projectFolder, config.actionsFolder),
        archivedFolder: joinProjectFolderPath(config.projectFolder, config.archivedFolder),
        diagramsFolder: joinProjectFolderPath(config.projectFolder, config.diagramsFolder),
        releasesFolder: joinProjectFolderPath(config.projectFolder, config.releasesFolder),
        workingFolder: joinProjectFolderPath(config.projectFolder, config.workingFolder),
    }
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
    actionsFolder: DEFAULT_ACTIONS_FOLDER,
    archivedFolder: DEFAULT_ARCHIVED_FOLDER,
    backgroundShade: 'neutral',
    cardSeparator: DEFAULT_CARD_SEPARATOR,
    cardTypes: DEFAULT_CARD_TYPES,
    diffCommand: DEFAULT_DIFF_COMMAND,
    diagramFooter: DEFAULT_DIAGRAM_FOOTER,
    diagramsFolder: DEFAULT_DIAGRAMS_FOLDER,
    projectFolder: DEFAULT_PROJECT_FOLDER,
    pushMode: 'manual',
    releasesFolder: DEFAULT_RELEASES_FOLDER,
    states: DEFAULT_STATES,
    workingFolder: DEFAULT_WORKING_FOLDER,
}
