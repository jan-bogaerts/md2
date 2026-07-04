import { DEFAULT_COLOR_SCHEME } from '../theme/theme_config'

export const DEFAULT_WORKING_FOLDER = 'design'
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
    cardTypes: CardTypeConfig[]
    pushMode: PushMode
    workingFolder: string
}

export interface MarkdownFile {
    content: string
    path: string
    sha?: string
}

export interface CardHeader {
    affects: string[]
    after: string | null
    id: string
    internalId: string | null
    owner: string | null
    policy: Record<string, string>
    status: string | null
    title: string
}

export interface ProjectCard {
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

export interface StorageProjectFiles {
    files: MarkdownFile[]
    workingFolder: string
}

export interface StorageService {
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<void>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    push(project: ProjectReference): Promise<void>
    watchProject?(project: ProjectReference, onChange: () => void): () => void
}

const BUG_CARD_COLOR = '#d32f2f'

export const DEFAULT_CARD_TYPES: CardTypeConfig[] = [
    { color: DEFAULT_COLOR_SCHEME.primary.regular, idPrefix: 'F', label: 'Feature', type: 'feature' },
    { color: DEFAULT_COLOR_SCHEME.secondary.regular, idPrefix: 'J', label: 'Job', type: 'job' },
    { color: BUG_CARD_COLOR, idPrefix: 'B', label: 'Bug', type: 'bug' },
]

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
    cardTypes: DEFAULT_CARD_TYPES,
    pushMode: 'auto',
    workingFolder: DEFAULT_WORKING_FOLDER,
}
