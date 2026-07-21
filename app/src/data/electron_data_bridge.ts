import type { ActionFile } from './action_types'
import type { ActionSchedule } from './action_schedule_types'
import type {
    AgentConversation,
    BranchReference,
    CommitWorktreeRequest,
    CommitResult,
    CommitRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    MarkdownFile,
    MoveFilesRequest,
    PrepareWorktreeRequest,
    ProjectAsset,
    ProjectConfig,
    ProjectReference,
    ProjectWatchEvent,
    StorageProjectFiles,
    TopLevelFolderReference,
    WorktreeRecord,
    WorktreeOperationRequest,
} from './data_types'

export interface AgentAvailability {
    available: boolean
    error: string | null
}

export interface ElectronDataBridge {
    addWorktree?(project: ProjectReference): Promise<WorktreeRecord[] | null>
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<CommitResult>
    commitWorktree?(request: CommitWorktreeRequest): Promise<WorktreeRecord[]>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    createWorkingFolderFromTemplate(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    deleteFile(request: DeleteFileRequest): Promise<void>
    deleteFolder(request: DeleteFolderRequest): Promise<void>
    discardWorktreeChanges?(request: WorktreeOperationRequest): Promise<WorktreeRecord[]>
    hasPendingPush(project: ProjectReference): Promise<boolean>
    loadAgentAvailability?(): Promise<Record<string, AgentAvailability>>
    loadAgentConversation?(path: string): Promise<AgentConversation>
    loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]>
    loadActionSchedules?(project: ProjectReference, actionsFolder: string): Promise<ActionSchedule[]>
    cancelActionSchedule?(project: ProjectReference, actionsFolder: string, scheduleId: string): Promise<ActionSchedule[]>
    loadProjectAsset?(project: ProjectReference, path: string): Promise<ProjectAsset>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    loadWorktrees?(project: ProjectReference): Promise<WorktreeRecord[]>
    listRepositoryFiles(project: ProjectReference): Promise<string[]>
    listAgentConversationReferences?(project: ProjectReference, projectFolder: string): Promise<string[]>
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]>
    moveFiles(request: MoveFilesRequest): Promise<void>
    openProjectFolder(): Promise<ProjectReference | null>
    parkWorktree?(request: WorktreeOperationRequest): Promise<WorktreeRecord[]>
    prepareWorktree?(request: PrepareWorktreeRequest): Promise<WorktreeRecord[]>
    pullWorktree?(request: WorktreeOperationRequest): Promise<WorktreeRecord[]>
    push(project: ProjectReference): Promise<void>
    pushWorktree?(request: WorktreeOperationRequest): Promise<WorktreeRecord[]>
    resolveProject(project: ProjectReference): Promise<ProjectReference>
    saveActionSchedules?(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    removeWorktree?(project: ProjectReference, folderPath: string): Promise<WorktreeRecord[]>
    stopAgent?(runId: string): Promise<void>
    watchProject(project: ProjectReference, callback: (event: ProjectWatchEvent) => void): () => void
    loadFile(project: ProjectReference, path: string): Promise<MarkdownFile>
}

declare global {
    interface Window {
        md2Data?: ElectronDataBridge
    }
}

export function getElectronDataBridge() {
    return window.md2Data ?? null
}
