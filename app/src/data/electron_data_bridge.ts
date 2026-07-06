import type { ActionFile } from './action_types'
import type {
    AgentConversation,
    AgentRunEvent,
    BranchReference,
    CommitResult,
    CommitRequest,
    ContinueAgentConversationRequest,
    ContinueAgentConversationResult,
    DeleteFileRequest,
    MoveFilesRequest,
    ProjectConfig,
    ProjectReference,
    ProjectWatchEvent,
    StartAgentConversationRequest,
    StartAgentConversationResult,
    StorageProjectFiles,
    TopLevelFolderReference,
} from './data_types'

export interface ElectronDataBridge {
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<CommitResult>
    continueAgentConversation?(request: ContinueAgentConversationRequest): Promise<ContinueAgentConversationResult>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    createWorkingFolderFromTemplate(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    deleteFile(request: DeleteFileRequest): Promise<void>
    loadAgentConversation?(path: string): Promise<AgentConversation>
    loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    listRepositoryFiles(project: ProjectReference): Promise<string[]>
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]>
    moveFiles(request: MoveFilesRequest): Promise<void>
    openProjectFolder(): Promise<ProjectReference | null>
    push(project: ProjectReference): Promise<void>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    sendAgentInput?(runId: string, input: string): Promise<void>
    startAgentConversation?(
        request: StartAgentConversationRequest,
        callback: (event: AgentRunEvent) => void,
    ): Promise<StartAgentConversationResult>
    stopAgent?(runId: string): Promise<void>
    watchProject(project: ProjectReference, callback: (event: ProjectWatchEvent) => void): () => void
}

declare global {
    interface Window {
        md2Data?: ElectronDataBridge
    }
}

export function getElectronDataBridge() {
    return window.md2Data ?? null
}
