import type { ActionFile } from './action_types'
import { DEFAULT_COLOR_SCHEME } from '../theme/theme_config'

export const DEFAULT_WORKING_FOLDER = 'design'
export const DEFAULT_ACTIONS_FOLDER = 'actions'
export const DEFAULT_DIFF_COMMAND = 'git show {{commit}}'
export const AUTO_COMMIT_DELAY_MS = 30000

export type CardType = 'feature' | 'job' | 'bug'
export type PushMode = 'auto' | 'manual'

export interface CardTypeConfig {
    color: string
    idPrefix: string
    label: string
    type: CardType
}

export interface ProjectConfig {
    actionsFolder: string
    cardBodyTemplate: string
    cardTypes: CardTypeConfig[]
    diffCommand: string
    pushMode: PushMode
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

export interface CardHeader {
    affects: string[]
    after: string | null
    agentLogReferences: string[]
    author: string | null
    id: string
    internalId: string | null
    owner: string | null
    policy: Record<string, string>
    status: string | null
    title: string
}

export interface ProjectCard {
    agentConversationErrors: AgentConversationError[]
    agentConversations: AgentConversation[]
    content: string
    header: CardHeader
    isActive: boolean
    path: string
    sha?: string
}

export interface ProjectSnapshot {
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
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

export interface BranchReference {
    name: string
}

export interface CommitRequest {
    branch: string
    files: MarkdownFile[]
    message: string
}

export interface ProjectWatchEvent {
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
    events: AgentConversationEvent[]
    id: string
    messages: AgentConversationMessage[]
    path: string
    startedAt: string
    status: AgentConversationStatus
    title: string
}

export interface AgentConversationError {
    message: string
    path: string
}

export interface ContinueAgentConversationRequest {
    cardPath: string
    input: string
    sourcePath: string
}

export interface ContinueAgentConversationResult {
    conversation: AgentConversation
    reference: string
}

export interface StorageProjectFiles {
    files: MarkdownFile[]
    workingFolder: string
}

export interface StorageService {
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<void>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    continueAgentConversation?(
        project: ProjectReference,
        request: ContinueAgentConversationRequest,
    ): Promise<ContinueAgentConversationResult>
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]>
    loadAgentConversation?(project: ProjectReference, path: string): Promise<AgentConversation>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    push(project: ProjectReference): Promise<void>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    watchProject?(project: ProjectReference, onChange: (event: ProjectWatchEvent) => void): () => void
}

const BUG_CARD_COLOR = '#d32f2f'

export const DEFAULT_CARD_TYPES: CardTypeConfig[] = [
    { color: DEFAULT_COLOR_SCHEME.primary.regular, idPrefix: 'F', label: 'Feature', type: 'feature' },
    { color: DEFAULT_COLOR_SCHEME.secondary.regular, idPrefix: 'J', label: 'Job', type: 'job' },
    { color: BUG_CARD_COLOR, idPrefix: 'B', label: 'Bug', type: 'bug' },
]

export const DEFAULT_CARD_BODY_TEMPLATE = '# Goal\n\n# Current status\n\n# Details\n\n# Tasks'

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
    actionsFolder: DEFAULT_ACTIONS_FOLDER,
    cardBodyTemplate: DEFAULT_CARD_BODY_TEMPLATE,
    cardTypes: DEFAULT_CARD_TYPES,
    diffCommand: DEFAULT_DIFF_COMMAND,
    pushMode: 'auto',
    workingFolder: DEFAULT_WORKING_FOLDER,
}
