import type { ActionFile } from './action_types'
import type { ActionSchedule } from './action_schedule_types'
import type {
    AgentConversation,
    AgentRunEvent,
    BranchReference,
    CommitResult,
    CommitRequest,
    DeleteFileRequest,
    MarkdownFile,
    MoveFilesRequest,
    ProjectAsset,
    ProjectConfig,
    ProjectReference,
    ProjectWatchEvent,
    StartAgentConversationRequest,
    StartAgentConversationResult,
    StorageProjectFiles,
    TopLevelFolderReference,
    WorktreeRecord,
} from './data_types'

export interface ElectronDataBridge {
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<CommitResult>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    createWorkingFolderFromTemplate(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    deleteFile(request: DeleteFileRequest): Promise<void>
    hasPendingPush(project: ProjectReference): Promise<boolean>
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
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]>
    moveFiles(request: MoveFilesRequest): Promise<void>
    openProjectFolder(): Promise<ProjectReference | null>
    push(project: ProjectReference): Promise<void>
    resolveProject(project: ProjectReference): Promise<ProjectReference>
    saveActionSchedules?(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    saveWorktrees?(project: ProjectReference, folders: string[]): Promise<WorktreeRecord[]>
    selectWorktreeFolder?(registeredFolders: string[]): Promise<WorktreeRecord | null>
    sendAgentInput?(runId: string, input: string): Promise<void>
    startAgentConversation?(
        request: StartAgentConversationRequest,
        callback: (event: AgentRunEvent) => void,
    ): Promise<StartAgentConversationResult>
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
