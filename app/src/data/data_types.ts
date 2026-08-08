import type { ActionFile } from './action_types'
import type { ActionSchedule } from './action_schedule_types'
import { DEFAULT_COLOR_SCHEME } from '../theme/theme_config'
import type { ProjectBackgroundShade } from '../theme/project_background_shade'
import { DEFAULT_CARD_SEPARATOR, type CardSeparator } from './card_identifiers'

export const DEFAULT_WORKING_FOLDER = 'active'
export const DEFAULT_ACTIONS_FOLDER = 'actions'
export const DEFAULT_ARCHIVED_FOLDER = 'archived'
export const DEFAULT_PROJECT_FOLDER = 'design'
export const DEFAULT_RELEASES_FOLDER = 'history'
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
    state: string
}

export interface ProjectConfig {
    actionsFolder: string
    archivedFolder: string
    backgroundShade: ProjectBackgroundShade
    cardBodyTemplate: string
    cardSeparator: CardSeparator
    cardTypes: CardTypeConfig[]
    diffCommand: string
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
    id: string
    internalId: string | null
    owner: string | null
    policy: Record<string, boolean>
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
    bodyIncludesTemplate?: boolean
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

export interface WorktreeRecord {
    branch: string | null
    error: string | null
    parkingBranch: string
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
    branchName: string
    project: ProjectReference
    worktree: number
}

export interface WorktreeOperationRequest {
    project: ProjectReference
    worktree: number
}

export interface CardWorktreeIntegrationRequest extends WorktreeOperationRequest {
    cardInternalId: string
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
    providerItemId?: string
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
    outputTokens: number
    reasoningTokens: number
    totalTokens: number
}

export interface AgentConversation {
    actionId?: string | null
    cardInternalId?: string | null
    cardPath: string | null
    completedAt: string | null
    entries: AgentConversationEntry[]
    hasExplicitTitle: boolean
    id: string
    path: string
    providerSessions: AgentProviderSession[]
    startedAt: string
    status: AgentConversationStatus
    title: string
    usage?: AgentTokenUsage
    viewed: boolean
}

export interface AgentConversationError {
    message: string
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
    addWorktree?(project: ProjectReference): Promise<boolean>
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<CommitResult>
    commitWorktree?(request: CommitWorktreeRequest): Promise<void>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
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
    loadAgentConversation?(project: ProjectReference, path: string): Promise<AgentConversation>
    loadProjectAsset?(project: ProjectReference, path: string): Promise<ProjectAsset>
    loadTextFile?(project: ProjectReference, path: string): Promise<MarkdownFile>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadFile?(project: ProjectReference, path: string): Promise<MarkdownFile>
    loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    onWorktreesChanged?(callback: (state: WorktreeState) => void): () => void
    restorePendingCommits?(project: ProjectReference): Promise<void>
    resolveProject?(project: ProjectReference): Promise<ProjectReference>
    listRepositoryFiles(project: ProjectReference): Promise<string[]>
    listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]>
    loadPendingPush?(project: ProjectReference): Promise<void>
    integrateWorktree?(request: IntegrateWorktreeRequest): Promise<void>
    moveFiles(request: MoveFilesRequest): Promise<void>
    parkWorktree?(request: WorktreeOperationRequest): Promise<void>
    prepareWorktree?(request: PrepareWorktreeRequest): Promise<void>
    pull?(project: ProjectReference): Promise<void>
    pullWorktree?(request: WorktreeOperationRequest): Promise<void>
    rebaseWorktree?(request: WorktreeOperationRequest): Promise<void>
    push(project: ProjectReference): Promise<void>
    pushWorktree?(request: WorktreeOperationRequest): Promise<void>
    refreshWorktrees?(project: ProjectReference): Promise<void>
    saveActionSchedules?(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    removeWorktree?(project: ProjectReference, folderPath: string): Promise<void>
    stopAgent?(project: ProjectReference, runId: string): Promise<void>
    watchProject?(
        project: ProjectReference,
        onChange: (event: ProjectWatchEvent) => void,
        onRestored: () => void,
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

export const DEFAULT_CARD_BODY_TEMPLATE = '# Goal\n\n# Current status\n\n# Details\n\n# Tasks'

function normalizeFolderPath(folderPath: string) {
    return folderPath.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

function joinProjectFolderPath(projectFolder: string, folderPath: string) {
    const normalizedProjectFolder = normalizeFolderPath(projectFolder)
    const normalizedFolderPath = normalizeFolderPath(folderPath)

    return normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/${normalizedFolderPath}` : normalizedFolderPath
}

export function resolveProjectConfigPaths(config: ProjectConfig): ProjectConfig {
    return {
        ...config,
        actionsFolder: joinProjectFolderPath(config.projectFolder, config.actionsFolder),
        archivedFolder: joinProjectFolderPath(config.projectFolder, config.archivedFolder),
        releasesFolder: joinProjectFolderPath(config.projectFolder, config.releasesFolder),
        workingFolder: joinProjectFolderPath(config.projectFolder, config.workingFolder),
    }
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
    actionsFolder: DEFAULT_ACTIONS_FOLDER,
    archivedFolder: DEFAULT_ARCHIVED_FOLDER,
    backgroundShade: 'neutral',
    cardBodyTemplate: DEFAULT_CARD_BODY_TEMPLATE,
    cardSeparator: DEFAULT_CARD_SEPARATOR,
    cardTypes: DEFAULT_CARD_TYPES,
    diffCommand: DEFAULT_DIFF_COMMAND,
    projectFolder: DEFAULT_PROJECT_FOLDER,
    pushMode: 'manual',
    releasesFolder: DEFAULT_RELEASES_FOLDER,
    states: DEFAULT_STATES,
    workingFolder: DEFAULT_WORKING_FOLDER,
}
