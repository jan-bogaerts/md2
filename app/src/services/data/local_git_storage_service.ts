import type { ActionFile } from '../../data/action_types'
import type { ActionSchedule } from '../../data/action_schedule_types'
import type {
    BranchReference,
    CommitResult,
    CommitRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    AgentConversation,
    MoveFilesRequest,
    ProjectConfig,
    ProjectReference,
    RepositoryReference,
    ProjectWatchEvent,
    StorageProjectFiles,
    StorageService,
    TopLevelFolderReference,
    WorktreeRecord,
} from '../../data/data_types'
import { getElectronDataBridge, type ElectronDataBridge } from '../../data/electron_data_bridge'

interface LocalGitStorageDependencies {
    bridge?: ElectronDataBridge
}

export class LocalGitStorageService implements StorageService {
    private bridge: ElectronDataBridge | null
    private readonly pendingPushBranches: Set<string>

    constructor() {
        this.bridge = null
        this.pendingPushBranches = new Set()
    }

    init(dependencies: LocalGitStorageDependencies = {}) {
        const bridge = dependencies.bridge ?? getElectronDataBridge()

        if (!bridge) throw new Error('Electron local Git bridge is not available')

        this.bridge = bridge
    }

    async openProjectFolder() {
        return this.requireBridge().openProjectFolder()
    }

    async resolveProject(project: ProjectReference) {
        return this.requireBridge().resolveProject(project)
    }

    async createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference> {
        return this.requireBridge().createProject(project, workingFolder)
    }

    async createWorkingFolderFromTemplate(project: ProjectReference, workingFolder: string): Promise<ProjectReference> {
        return this.requireBridge().createWorkingFolderFromTemplate(project, workingFolder)
    }

    async loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        return this.requireBridge().loadProject(project, workingFolder)
    }

    async loadFile(project: ProjectReference, path: string) {
        return this.requireBridge().loadFile(project, path)
    }

    async loadProjectAsset(project: ProjectReference, path: string) {
        const bridge = this.requireBridge()
        if (!bridge.loadProjectAsset) throw new Error('Electron local Git bridge cannot load project assets')

        return bridge.loadProjectAsset(project, path)
    }

    async loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        return this.requireBridge().loadProjectRoot(project, workingFolder)
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]> {
        return this.requireBridge().loadActionFiles(project, actionsFolder)
    }

    async loadActionSchedules(project: ProjectReference, actionsFolder: string): Promise<ActionSchedule[]> {
        const bridge = this.requireBridge()
        if (!bridge.loadActionSchedules) throw new Error('Electron local Git bridge cannot load action schedules')

        return bridge.loadActionSchedules(project, actionsFolder)
    }

    async saveActionSchedules(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]> {
        const bridge = this.requireBridge()
        if (!bridge.saveActionSchedules) throw new Error('Electron local Git bridge cannot save action schedules')

        return bridge.saveActionSchedules(project, actionsFolder, schedules)
    }

    async cancelActionSchedule(project: ProjectReference, actionsFolder: string, scheduleId: string): Promise<ActionSchedule[]> {
        const bridge = this.requireBridge()
        if (!bridge.cancelActionSchedule) throw new Error('Electron local Git bridge cannot cancel action schedules')

        return bridge.cancelActionSchedule(project, actionsFolder, scheduleId)
    }

    async loadAgentConversation(_project: ProjectReference, path: string): Promise<AgentConversation> {
        const bridge = this.requireBridge()
        if (!bridge.loadAgentConversation) throw new Error('Electron local Git bridge cannot load agent conversations')

        return bridge.loadAgentConversation(path)
    }

    async stopAgent(_project: ProjectReference, runId: string): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.stopAgent) throw new Error('Electron local Git bridge cannot stop agents')

        await bridge.stopAgent(runId)
    }

    async loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null> {
        return this.requireBridge().loadProjectConfig(project)
    }

    async loadWorktrees(project: ProjectReference): Promise<WorktreeRecord[]> {
        const bridge = this.requireBridge()
        if (!bridge.loadWorktrees) throw new Error('Electron local Git bridge cannot load worktrees')

        return bridge.loadWorktrees(project)
    }

    async listBranches(project: ProjectReference): Promise<BranchReference[]> {
        return this.requireBridge().listBranches(project)
    }

    async listRepositories(): Promise<RepositoryReference[]> {
        this.requireBridge()

        return []
    }

    async listRepositoryFiles(project: ProjectReference): Promise<string[]> {
        return this.requireBridge().listRepositoryFiles(project)
    }

    async listAgentConversationReferences(project: ProjectReference, projectFolder: string): Promise<string[]> {
        const bridge = this.requireBridge()
        if (!bridge.listAgentConversationReferences) throw new Error('Electron local Git bridge cannot list agent conversations')

        return bridge.listAgentConversationReferences(project, projectFolder)
    }

    async listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]> {
        return this.requireBridge().listTopLevelFolders(project)
    }

    async loadPendingPush(project: ProjectReference) {
        const hasPendingPush = await this.requireBridge().hasPendingPush(project)
        if (hasPendingPush) this.pendingPushBranches.add(project.branch)
        else this.pendingPushBranches.delete(project.branch)
    }

    async checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference> {
        return this.requireBridge().checkoutBranch(project, branch)
    }

    async commit(request: CommitRequest): Promise<CommitResult> {
        await this.requireBridge().commit(request)
        this.pendingPushBranches.add(request.branch)

        return []
    }

    async deleteFile(request: DeleteFileRequest): Promise<void> {
        await this.requireBridge().deleteFile(request)
        this.pendingPushBranches.add(request.branch)
    }

    async deleteFolder(request: DeleteFolderRequest): Promise<void> {
        await this.requireBridge().deleteFolder(request)
        this.pendingPushBranches.add(request.branch)
    }

    async moveFiles(request: MoveFilesRequest): Promise<void> {
        await this.requireBridge().moveFiles(request)
        this.pendingPushBranches.add(request.branch)
    }

    async push(project: ProjectReference): Promise<void> {
        await this.requireBridge().push(project)
        this.pendingPushBranches.delete(project.branch)
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void> {
        await this.requireBridge().saveProjectConfig(project, config)
        this.pendingPushBranches.add(project.branch)
    }

    async saveWorktrees(project: ProjectReference, folders: string[]): Promise<WorktreeRecord[]> {
        const bridge = this.requireBridge()
        if (!bridge.saveWorktrees) throw new Error('Electron local Git bridge cannot save worktrees')

        return bridge.saveWorktrees(project, folders)
    }

    async selectWorktreeFolder(registeredFolders: string[]): Promise<WorktreeRecord | null> {
        const bridge = this.requireBridge()
        if (!bridge.selectWorktreeFolder) throw new Error('Electron local Git bridge cannot select worktrees')

        return bridge.selectWorktreeFolder(registeredFolders)
    }

    hasPendingPush(project: ProjectReference) {
        return this.pendingPushBranches.has(project.branch)
    }

    watchProject(project: ProjectReference, onChange: (event: ProjectWatchEvent) => void) {
        return this.requireBridge().watchProject(project, onChange)
    }

    private requireBridge() {
        if (!this.bridge) throw new Error('Local Git storage bridge is not initialized')

        return this.bridge
    }
}
