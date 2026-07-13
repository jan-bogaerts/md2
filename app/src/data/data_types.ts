import type { ActionFile } from './action_types'
import type { ActionSchedule } from './action_schedule_types'
import { DEFAULT_COLOR_SCHEME } from '../theme/theme_config'
import type { ProjectBackgroundShade } from '../theme/project_background_shade'
import { DEFAULT_CARD_SEPARATOR, type CardSeparator } from './card_identifiers'

export const DEFAULT_WORKING_FOLDER = 'active'
export const DEFAULT_ACTIONS_FOLDER = 'actions'
export const DEFAULT_PROJECT_FOLDER = 'design'
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
    backgroundShade: ProjectBackgroundShade
    cardBodyTemplate: string
    cardSeparator: CardSeparator
    cardTypes: CardTypeConfig[]
    diffCommand: string
    projectFolder: string
    pushMode: PushMode
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
    agentLogReferences: string[]
    author: string | null
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

export interface ProjectCard {
    agentConversationErrors: AgentConversationError[]
    agentConversations: AgentConversation[]
    content: string
    header: CardHeader
    /** Raw frontmatter fields as written in the file, including unknown keys. */
    headerFields: Record<string, string | string[] | Record<string, string>>
    isActive: boolean
    path: string
    sha?: string
}

export interface ProjectSnapshot {
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
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

export interface WorktreeRecord {
    branch: string | null
    error: string | null
    path: string
    valid: boolean
}

export interface RepositoryReference extends ProjectReference {
    owner: string
    repository: string
}

export interface BranchReference {
    name: string
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

export type AgentConversationStatus = 'completed' | 'failed' | 'running'
export type AgentMessageRole = 'agent' | 'stderr' | 'stdout' | 'system' | 'user'

export interface AgentConversationMessage {
    content: string
    id: string
    role: AgentMessageRole
    timestamp: string
}

export interface AgentConversationEvent {
    content: string
    id: string
    timestamp: string
    type: string
}

export interface AgentConversation {
    cardPath: string
    completedAt: string | null
    continuedFrom: string | null
    events: AgentConversationEvent[]
    id: string
    messages: AgentConversationMessage[]
    nativeSessionId: string | null
    path: string
    startedAt: string
    status: AgentConversationStatus
    title: string
}

export interface AgentConversationError {
    message: string
    path: string
}

export interface ContinueAgentConversationResult {
    conversation: AgentConversation
    reference: string
}

export interface StartAgentConversationRequest {
    cardPath: string
    continuedFrom?: string
    nativeResumeSessionId?: string
    prompt: string
    title?: string
}

export interface StartAgentConversationResult extends ContinueAgentConversationResult {
    runId: string
}

export interface AgentRunEvent {
    content: string
    conversation: AgentConversation
    runId: string
    type: string
}

export interface StorageProjectFiles {
    files: MarkdownFile[]
    workingFolder: string
}

export interface StorageService {
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<CommitResult>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    createWorkingFolderFromTemplate(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    deleteFile(request: DeleteFileRequest): Promise<void>
    discardPendingCommits?(project: ProjectReference): void
    hasPendingPush?(project: ProjectReference): boolean
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    listRepositories(): Promise<RepositoryReference[]>
    loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]>
    loadActionSchedules?(project: ProjectReference, actionsFolder: string): Promise<ActionSchedule[]>
    cancelActionSchedule?(project: ProjectReference, actionsFolder: string, scheduleId: string): Promise<ActionSchedule[]>
    loadAgentConversation?(project: ProjectReference, path: string): Promise<AgentConversation>
    loadProjectAsset?(project: ProjectReference, path: string): Promise<ProjectAsset>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadFile?(project: ProjectReference, path: string): Promise<MarkdownFile>
    loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    loadWorktrees?(project: ProjectReference): Promise<WorktreeRecord[]>
    restorePendingCommits?(project: ProjectReference): Promise<void>
    resolveProject?(project: ProjectReference): Promise<ProjectReference>
    listRepositoryFiles(project: ProjectReference): Promise<string[]>
    listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]>
    loadPendingPush?(project: ProjectReference): Promise<void>
    moveFiles(request: MoveFilesRequest): Promise<void>
    push(project: ProjectReference): Promise<void>
    saveActionSchedules?(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    saveWorktrees?(project: ProjectReference, folders: string[]): Promise<WorktreeRecord[]>
    selectWorktreeFolder?(registeredFolders: string[]): Promise<WorktreeRecord | null>
    sendAgentInput?(project: ProjectReference, runId: string, input: string): Promise<void>
    startAgentConversation?(
        project: ProjectReference,
        request: StartAgentConversationRequest,
        onEvent: (event: AgentRunEvent) => void,
    ): Promise<StartAgentConversationResult>
    stopAgent?(project: ProjectReference, runId: string): Promise<void>
    watchProject?(project: ProjectReference, onChange: (event: ProjectWatchEvent) => void): () => void
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
    { alwaysVisible: true, color: defaultColumnAccent(3), state: 'in progress' },
    { alwaysVisible: true, color: defaultColumnAccent(4), state: 'done' },
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
        workingFolder: joinProjectFolderPath(config.projectFolder, config.workingFolder),
    }
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
    actionsFolder: DEFAULT_ACTIONS_FOLDER,
    backgroundShade: 'neutral',
    cardBodyTemplate: DEFAULT_CARD_BODY_TEMPLATE,
    cardSeparator: DEFAULT_CARD_SEPARATOR,
    cardTypes: DEFAULT_CARD_TYPES,
    diffCommand: DEFAULT_DIFF_COMMAND,
    projectFolder: DEFAULT_PROJECT_FOLDER,
    pushMode: 'auto',
    states: DEFAULT_STATES,
    workingFolder: DEFAULT_WORKING_FOLDER,
}
