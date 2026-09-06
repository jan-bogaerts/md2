import type { ActionFile } from '../../data/action_types'
import type { ActionSchedule } from '../../data/action_schedule_types'
import type {
    BranchReference,
    CommitWorktreeRequest,
    CommitResult,
    CommitRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    AgentConversation,
    IntegrateWorktreeRequest,
    MoveFilesRequest,
    PrepareWorktreeRequest,
    ProjectConfig,
    ProjectReference,
    RepositoryReference,
    ProjectWatchEvent,
    ProjectWatchNotification,
    StorageProjectFiles,
    StorageService,
    TopLevelFolderReference,
    WorktreeOperationRequest,
    WorktreeRemovalMode,
    WorktreeState,
} from '../../data/data_types'
import { withBridgeErrorRehydration } from '../../data/bridge_error_rehydration'
import { getElectronDataBridge, type ElectronDataBridge } from '../../data/electron_data_bridge'
import type {
    MergeConflictPathRequest,
    MergeConflictSession,
    MergeConflictSessionRequest,
    WorktreeOperationOutcome,
} from '../../data/merge_conflict_types'

interface LocalGitStorageDependencies {
    bridge?: ElectronDataBridge
}

export class LocalGitStorageService implements StorageService {
    calculateActivityStats?: StorageService['calculateActivityStats']
    cancelActivityStatsCalculation?: StorageService['cancelActivityStatsCalculation']
    private bridge: ElectronDataBridge | null
    private readonly pendingPushBranches: Set<string>

    constructor() {
        this.bridge = null
        this.pendingPushBranches = new Set()
    }

    async addWorktree(project: ProjectReference, folderPath: string): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.addWorktree) throw new Error('Electron local Git bridge cannot add worktrees')

        await bridge.addWorktree(project, folderPath)
    }

    init(dependencies: LocalGitStorageDependencies = {}) {
        const providedBridge = dependencies.bridge ?? getElectronDataBridge()

        if (!providedBridge) throw new Error('Electron local Git bridge is not available')

        // Failures cross Electron IPC as an envelope; rehydrate them here so marked errors stay typed.
        const bridge = withBridgeErrorRehydration(providedBridge)

        this.bridge = bridge
        this.calculateActivityStats = bridge.calculateActivityStats
            ? (project, paths, calculationId) => bridge.calculateActivityStats!(project, paths, calculationId)
            : undefined
        this.cancelActivityStatsCalculation = bridge.cancelActivityStatsCalculation
            ? (calculationId) => bridge.cancelActivityStatsCalculation!(calculationId)
            : undefined
    }

    async openProjectFolder() {
        return this.requireBridge().openProjectFolder()
    }

    async resolveProject(project: ProjectReference) {
        return this.requireBridge().resolveProject(project)
    }

    async createProject(project: ProjectReference, folders: string[]): Promise<ProjectReference> {
        return this.requireBridge().createProject(project, folders)
    }

    async loadProject(
        project: ProjectReference,
        workingFolder: string,
        excludedRootFolder?: string,
    ): Promise<StorageProjectFiles> {
        const bridge = this.requireBridge()
        if (excludedRootFolder === undefined) return bridge.loadProject(project, workingFolder)

        return bridge.loadProject(project, workingFolder, excludedRootFolder)
    }

    async loadFile(project: ProjectReference, path: string) {
        return this.requireBridge().loadFile(project, path)
    }

    async loadProjectAsset(project: ProjectReference, path: string) {
        const bridge = this.requireBridge()
        if (!bridge.loadProjectAsset) throw new Error('Electron local Git bridge cannot load project assets')

        return bridge.loadProjectAsset(project, path)
    }

    async loadTextFile(project: ProjectReference, path: string) {
        const bridge = this.requireBridge()
        if (!bridge.loadTextFile) throw new Error('Electron local Git bridge cannot load text files')

        return bridge.loadTextFile(project, path)
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

    async loadActivityConversations(_project: ProjectReference, path: string): Promise<AgentConversation[]> {
        const bridge = this.requireBridge()
        if (!bridge.loadActivityConversations) throw new Error('Electron local Git bridge cannot load activity conversations')

        return bridge.loadActivityConversations(path)
    }

    async stopAgent(_project: ProjectReference, runId: string): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.stopAgent) throw new Error('Electron local Git bridge cannot stop agents')

        await bridge.stopAgent(runId)
    }

    async loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null> {
        return this.requireBridge().loadProjectConfig(project)
    }

    onWorktreesChanged(callback: (state: WorktreeState) => void) {
        const bridge = this.requireBridge()
        if (!bridge.onWorktreesChanged) throw new Error('Electron local Git bridge cannot subscribe to worktrees')

        return bridge.onWorktreesChanged(callback)
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

    async integrateWorktree(request: IntegrateWorktreeRequest): Promise<WorktreeOperationOutcome> {
        const bridge = this.requireBridge()
        if (!bridge.integrateWorktree) throw new Error('Electron local Git bridge cannot integrate worktrees')

        const outcome = await bridge.integrateWorktree(request)
        this.pendingPushBranches.add(request.project.branch)

        return outcome
    }

    async abortMergeConflict(request: MergeConflictSessionRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.abortMergeConflict) throw new Error('Electron local Git bridge cannot abort merge conflicts')

        await bridge.abortMergeConflict(request)
    }

    async continueMergeConflict(request: MergeConflictSessionRequest): Promise<WorktreeOperationOutcome> {
        const bridge = this.requireBridge()
        if (!bridge.continueMergeConflict) throw new Error('Electron local Git bridge cannot continue merge conflicts')

        return bridge.continueMergeConflict(request)
    }

    async getMergeConflictSession(): Promise<MergeConflictSession | null> {
        const bridge = this.requireBridge()
        if (!bridge.getMergeConflictSession) throw new Error('Electron local Git bridge cannot load merge conflicts')

        return bridge.getMergeConflictSession()
    }

    async launchMergeConflictResolver(request: MergeConflictPathRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.launchMergeConflictResolver) throw new Error('Electron local Git bridge cannot launch merge conflict resolver')

        await bridge.launchMergeConflictResolver(request)
    }

    async markMergeConflictResolved(request: MergeConflictPathRequest): Promise<MergeConflictSession> {
        const bridge = this.requireBridge()
        if (!bridge.markMergeConflictResolved) throw new Error('Electron local Git bridge cannot mark merge conflicts resolved')

        return bridge.markMergeConflictResolved(request)
    }

    onMergeConflictSessionChanged(callback: (session: MergeConflictSession | null) => void) {
        const bridge = this.requireBridge()
        if (!bridge.onMergeConflictSessionChanged) throw new Error('Electron local Git bridge cannot subscribe to merge conflicts')

        return bridge.onMergeConflictSessionChanged(callback)
    }

    async rescanMergeConflict(request: MergeConflictSessionRequest): Promise<MergeConflictSession> {
        const bridge = this.requireBridge()
        if (!bridge.rescanMergeConflict) throw new Error('Electron local Git bridge cannot rescan merge conflicts')

        return bridge.rescanMergeConflict(request)
    }

    async checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference> {
        return this.requireBridge().checkoutBranch(project, branch)
    }

    async commit(request: CommitRequest): Promise<CommitResult> {
        await this.requireBridge().commit(request)
        this.pendingPushBranches.add(request.branch)

        return []
    }

    async commitWorktree(request: CommitWorktreeRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.commitWorktree) throw new Error('Electron local Git bridge cannot commit worktree changes')

        await bridge.commitWorktree(request)
    }

    async deleteFile(request: DeleteFileRequest): Promise<void> {
        await this.requireBridge().deleteFile(request)
        this.pendingPushBranches.add(request.branch)
    }

    async deleteFolder(request: DeleteFolderRequest): Promise<void> {
        await this.requireBridge().deleteFolder(request)
        this.pendingPushBranches.add(request.branch)
    }

    async deleteLocalBranch(project: ProjectReference, branchName: string): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.deleteLocalBranch) throw new Error('Electron local Git bridge cannot delete local branches')

        await bridge.deleteLocalBranch(project, branchName)
    }

    async discardWorktreeChanges(request: WorktreeOperationRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.discardWorktreeChanges) throw new Error('Electron local Git bridge cannot discard worktree changes')

        await bridge.discardWorktreeChanges(request)
    }

    async moveFiles(request: MoveFilesRequest): Promise<void> {
        await this.requireBridge().moveFiles(request)
        this.pendingPushBranches.add(request.branch)
    }

    async push(project: ProjectReference): Promise<void> {
        await this.requireBridge().push(project)
        this.pendingPushBranches.delete(project.branch)
    }

    async pull(project: ProjectReference): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.pull) throw new Error('Electron local Git bridge cannot pull the primary worktree')

        await bridge.pull(project)
    }

    async prepareWorktree(request: PrepareWorktreeRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.prepareWorktree) throw new Error('Electron local Git bridge cannot prepare worktrees')

        await bridge.prepareWorktree(request)
    }

    async parkWorktree(request: WorktreeOperationRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.parkWorktree) throw new Error('Electron local Git bridge cannot park worktrees')

        await bridge.parkWorktree(request)
    }

    async pullWorktree(request: WorktreeOperationRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.pullWorktree) throw new Error('Electron local Git bridge cannot pull worktrees')

        await bridge.pullWorktree(request)
    }

    async rebaseWorktree(request: WorktreeOperationRequest): Promise<WorktreeOperationOutcome> {
        const bridge = this.requireBridge()
        if (!bridge.rebaseWorktree) throw new Error('Electron local Git bridge cannot rebase worktrees')

        return bridge.rebaseWorktree(request)
    }

    async pushWorktree(request: WorktreeOperationRequest): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.pushWorktree) throw new Error('Electron local Git bridge cannot push worktrees')

        await bridge.pushWorktree(request)
    }

    async refreshWorktrees(project: ProjectReference): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.refreshWorktrees) throw new Error('Electron local Git bridge cannot refresh worktrees')

        await bridge.refreshWorktrees(project)
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void> {
        await this.requireBridge().saveProjectConfig(project, config)
        this.pendingPushBranches.add(project.branch)
    }

    async selectWorktreeFolder(): Promise<string | null> {
        const bridge = this.requireBridge()
        if (!bridge.selectWorktreeFolder) throw new Error('Electron local Git bridge cannot select worktree folders')

        return bridge.selectWorktreeFolder()
    }

    async removeWorktree(project: ProjectReference, folderPath: string, mode: WorktreeRemovalMode): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.removeWorktree) throw new Error('Electron local Git bridge cannot remove worktrees')

        await bridge.removeWorktree(project, folderPath, mode)
    }

    hasPendingPush(project: ProjectReference) {
        return this.pendingPushBranches.has(project.branch)
    }

    watchProject(
        project: ProjectReference,
        onChange: (event: ProjectWatchEvent) => void,
        _onRestored: () => void,
        onError: (error: Error) => void,
    ) {
        const handleNotification = (notification: ProjectWatchNotification) => {
            if ('error' in notification) {
                onError(new Error(notification.error))
                return
            }

            onChange(notification)
        }

        return this.requireBridge().watchProject(project, handleNotification)
    }

    private requireBridge() {
        if (!this.bridge) throw new Error('Local Git storage bridge is not initialized')

        return this.bridge
    }
}
