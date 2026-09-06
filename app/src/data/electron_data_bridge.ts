import type { ActionFile } from './action_types'
import type { ActionSchedule } from './action_schedule_types'
import type { ActivityStatsCalculationResult } from '../../../shared/project_stats.mjs'
import type {
    AgentConversation,
    BranchReference,
    CommitWorktreeRequest,
    CommitResult,
    CommitRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    MarkdownFile,
    IntegrateWorktreeRequest,
    MoveFilesRequest,
    PrepareWorktreeRequest,
    ProjectAsset,
    ProjectConfig,
    ProjectReference,
    ProjectWatchNotification,
    StorageProjectFiles,
    TopLevelFolderReference,
    WorktreeOperationRequest,
    WorktreeRemovalMode,
    WorktreeState,
} from './data_types'
import type {
    MergeConflictPathRequest,
    MergeConflictSession,
    MergeConflictSessionRequest,
    WorktreeOperationOutcome,
} from './merge_conflict_types'

export interface AgentAvailability {
    available: boolean
    error: string | null
}

export interface ElectronDataBridge {
    abortMergeConflict?(request: MergeConflictSessionRequest): Promise<void>
    addWorktree?(project: ProjectReference, folderPath: string): Promise<void>
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<CommitResult>
    commitWorktree?(request: CommitWorktreeRequest): Promise<void>
    createProject(project: ProjectReference, folders: string[]): Promise<ProjectReference>
    deleteFile(request: DeleteFileRequest): Promise<void>
    deleteFolder(request: DeleteFolderRequest): Promise<void>
    discardWorktreeChanges?(request: WorktreeOperationRequest): Promise<void>
    deleteLocalBranch?(project: ProjectReference, branchName: string): Promise<void>
    hasPendingPush(project: ProjectReference): Promise<boolean>
    continueMergeConflict?(request: MergeConflictSessionRequest): Promise<WorktreeOperationOutcome>
    getMergeConflictSession?(): Promise<MergeConflictSession | null>
    integrateWorktree?(request: IntegrateWorktreeRequest): Promise<WorktreeOperationOutcome>
    launchMergeConflictResolver?(request: MergeConflictPathRequest): Promise<void>
    loadAgentAvailability?(): Promise<Record<string, AgentAvailability>>
    loadAgentConversation?(path: string): Promise<AgentConversation>
    loadActivityConversations?(path: string): Promise<AgentConversation[]>
    loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]>
    loadActionSchedules?(project: ProjectReference, actionsFolder: string): Promise<ActionSchedule[]>
    cancelActionSchedule?(project: ProjectReference, actionsFolder: string, scheduleId: string): Promise<ActionSchedule[]>
    calculateActivityStats?(project: ProjectReference, paths: string[], calculationId: string): Promise<ActivityStatsCalculationResult>
    cancelActivityStatsCalculation?(calculationId: string): Promise<void>
    loadProjectAsset?(project: ProjectReference, path: string): Promise<ProjectAsset>
    loadTextFile?(project: ProjectReference, path: string): Promise<MarkdownFile>
    loadProject(project: ProjectReference, workingFolder: string, excludedRootFolder?: string): Promise<StorageProjectFiles>
    loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    onWorktreesChanged?(callback: (state: WorktreeState) => void): () => void
    markMergeConflictResolved?(request: MergeConflictPathRequest): Promise<MergeConflictSession>
    onMergeConflictSessionChanged?(callback: (session: MergeConflictSession | null) => void): () => void
    listRepositoryFiles(project: ProjectReference): Promise<string[]>
    listAgentConversationReferences?(project: ProjectReference, projectFolder: string): Promise<string[]>
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]>
    moveFiles(request: MoveFilesRequest): Promise<void>
    openProjectFolder(): Promise<ProjectReference | null>
    parkWorktree?(request: WorktreeOperationRequest): Promise<void>
    prepareWorktree?(request: PrepareWorktreeRequest): Promise<void>
    pull?(project: ProjectReference): Promise<void>
    pullWorktree?(request: WorktreeOperationRequest): Promise<void>
    rebaseWorktree?(request: WorktreeOperationRequest): Promise<WorktreeOperationOutcome>
    rescanMergeConflict?(request: MergeConflictSessionRequest): Promise<MergeConflictSession>
    push(project: ProjectReference): Promise<void>
    pushWorktree?(request: WorktreeOperationRequest): Promise<void>
    refreshWorktrees?(project: ProjectReference): Promise<void>
    resolveProject(project: ProjectReference): Promise<ProjectReference>
    saveActionSchedules?(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    selectProjectSubFolder?(rootPath: string): Promise<string | null>
    selectWorktreeFolder?(): Promise<string | null>
    removeWorktree?(project: ProjectReference, folderPath: string, mode: WorktreeRemovalMode): Promise<void>
    stopAgent?(runId: string): Promise<void>
    watchProject(project: ProjectReference, callback: (notification: ProjectWatchNotification) => void): () => void
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
