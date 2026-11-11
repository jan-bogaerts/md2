import type { ActionFile } from '../../data/action_types';
import type { AnySchedule } from '../../data/action_schedule_types';
import type {
    AgentConversation,
    BranchReference,
    CommitPrimaryChangesRequest,
    CommitRequest,
    CommitResult,
    CommitWorktreeRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    IntegrateWorktreeRequest,
    MarkdownFile,
    MoveFilesRequest,
    PrepareWorktreeRequest,
    ProjectAsset,
    ProjectConfig,
    ProjectReference,
    ProjectWatchEvent,
    RepositoryReference,
    StorageProjectFiles,
    StorageService,
    TopLevelFolderReference,
    TrashPrimaryChangeRequest,
    WorktreeOperationRequest,
    WorktreeRemovalMode,
    WorktreeState,
    WriteFilesRequest,
} from '../../data/data_types';
import type {
    MergeConflictPathRequest,
    MergeConflictSession,
    MergeConflictSessionRequest,
    WorktreeOperationOutcome,
} from '../../data/merge_conflict_types';
import type { DirtyPrimaryOutcome, PrimaryChange } from '../../data/primary_change_types';
import { RemoteControlActionBridge } from './remote_control_action_bridge';
import { RemoteControlBroadcastSubscription } from './remote_control_broadcast_subscription';
import {
    startCallbackSubscription,
    type RemoteControlCallbackSubscriptionOptions,
    type RemoteControlSubscriptionPayload,
} from './remote_control_callback_subscription';
import { RemoteControlClaudeRuntimeBridge } from './remote_control_claude_runtime_bridge';
import { RemoteControlClient } from './remote_control_client';
import { RemoteControlCodexRuntimeBridge } from './remote_control_codex_runtime_bridge';
import { RemoteControlDesktopConfigTransport } from './remote_control_desktop_config_transport';
import { RemoteControlProjectWatch } from './remote_control_project_watch';

interface WorktreesChangedPayload extends RemoteControlSubscriptionPayload {
    state: WorktreeState;
}

interface MergeConflictSessionChangedPayload extends RemoteControlSubscriptionPayload {
    session: MergeConflictSession | null;
}

type MergeConflictOptions = RemoteControlCallbackSubscriptionOptions<MergeConflictSessionChangedPayload, MergeConflictSession | null>;

const MERGE_CONFLICT_SUBSCRIPTION: MergeConflictOptions = {
    eventName: 'mergeConflictSessionChanged',
    method: 'onMergeConflictSessionChanged',
    select: (payload) => payload.session,
};

/**
 * Project storage backed by a remote desktop host.
 * Owns one remote-control client per instance and exposes it, for connection lifecycle,
 * together with the action, runtime, and desktop-config adapters sharing it.
 */
export class RemoteControlStorageService implements StorageService {
    readonly client = new RemoteControlClient();
    readonly actionBridge = new RemoteControlActionBridge(this.client);
    readonly claudeRuntimeBridge = new RemoteControlClaudeRuntimeBridge(this.client);
    readonly codexRuntimeBridge = new RemoteControlCodexRuntimeBridge(this.client);
    readonly desktopConfigTransport = new RemoteControlDesktopConfigTransport(this.client);
    private readonly pendingPushBranches = new Set<string>();
    private readonly worktreeSubscription = new RemoteControlBroadcastSubscription(this.client, {
        eventName: 'worktreesChanged',
        method: 'onWorktreesChanged',
        select: (payload: WorktreesChangedPayload) => payload.state,
    });

    /** Returns the project currently open in the connected desktop app, or null if none is loaded. */
    async getActiveProject(): Promise<ProjectReference | null> {
        return this.client.request<ProjectReference | null>('getActiveProject', []);
    }

    async listRepositories(): Promise<RepositoryReference[]> {
        this.client.assertInitialized();

        return [];
    }

    async listBranches(project: ProjectReference): Promise<BranchReference[]> {
        return this.client.request<BranchReference[]>('listBranches', [project]);
    }

    async checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference> {
        return this.client.request<ProjectReference>('checkoutBranch', [project, branch]);
    }

    async deleteLocalBranch(project: ProjectReference, branchName: string): Promise<void> {
        await this.client.request('deleteLocalBranch', [project, branchName]);
    }

    async loadProject(project: ProjectReference, workingFolder: string, excludedRootFolder?: string): Promise<StorageProjectFiles> {
        const params = excludedRootFolder === undefined
            ? [project, workingFolder]
            : [project, workingFolder, excludedRootFolder];

        return this.client.request<StorageProjectFiles>('loadProject', params);
    }

    async loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        return this.client.request<StorageProjectFiles>('loadProjectRoot', [project, workingFolder]);
    }

    async loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null> {
        return this.client.request<Partial<ProjectConfig> | null>('loadProjectConfig', [project]);
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void> {
        await this.client.request('saveProjectConfig', [project, config]);
        this.pendingPushBranches.add(project.branch);
    }

    async loadFile(project: ProjectReference, path: string): Promise<MarkdownFile> {
        return this.client.request<MarkdownFile>('loadFile', [project, path]);
    }

    async loadTextFile(project: ProjectReference, path: string): Promise<MarkdownFile> {
        return this.client.request<MarkdownFile>('loadTextFile', [project, path]);
    }

    async loadProjectAsset(project: ProjectReference, path: string): Promise<ProjectAsset> {
        return this.client.request<ProjectAsset>('loadProjectAsset', [project, path]);
    }

    async loadImageFile(filePath: string): Promise<ProjectAsset> {
        return this.client.request<ProjectAsset>('loadImageFile', [filePath]);
    }

    async listRepositoryFiles(project: ProjectReference): Promise<string[]> {
        return this.client.request<string[]>('listRepositoryFiles', [project]);
    }

    async listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]> {
        return this.client.request<TopLevelFolderReference[]>('listTopLevelFolders', [project]);
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]> {
        return this.client.request<ActionFile[]>('loadActionFiles', [project, actionsFolder]);
    }

    async loadActionSchedules(project: ProjectReference, actionsFolder: string): Promise<AnySchedule[]> {
        return this.client.request<AnySchedule[]>('loadActionSchedules', [project, actionsFolder]);
    }

    async saveActionSchedules(project: ProjectReference, actionsFolder: string, schedules: AnySchedule[]): Promise<AnySchedule[]> {
        return this.client.request<AnySchedule[]>('saveActionSchedules', [project, actionsFolder, schedules]);
    }

    async cancelActionSchedule(project: ProjectReference, actionsFolder: string, scheduleId: string): Promise<AnySchedule[]> {
        return this.client.request<AnySchedule[]>('cancelActionSchedule', [project, actionsFolder, scheduleId]);
    }

    async loadAgentConversation(_project: ProjectReference, path: string): Promise<AgentConversation> {
        return this.client.request<AgentConversation>('loadAgentConversation', [path]);
    }

    async loadActivityConversations(_project: ProjectReference, path: string): Promise<AgentConversation[]> {
        return this.client.request<AgentConversation[]>('loadActivityConversations', [path]);
    }

    async listAgentConversationReferences(project: ProjectReference, projectFolder: string): Promise<string[]> {
        return this.client.request<string[]>('listAgentConversationReferences', [project, projectFolder]);
    }

    async stopAgent(_project: ProjectReference, runId: string): Promise<void> {
        await this.client.request('stopAgent', [runId]);
    }

    async commit(request: CommitRequest): Promise<CommitResult> {
        const result = await this.client.request<CommitResult>('commit', [request]);
        this.pendingPushBranches.add(request.branch);

        return result;
    }

    async writeFiles(request: WriteFilesRequest): Promise<void> {
        await this.client.request('writeFiles', [request]);
    }

    async deleteFile(request: DeleteFileRequest): Promise<void> {
        await this.client.request('deleteFile', [request]);
        this.pendingPushBranches.add(request.branch);
    }

    async deleteFolder(request: DeleteFolderRequest): Promise<void> {
        await this.client.request('deleteFolder', [request]);
        this.pendingPushBranches.add(request.branch);
    }

    async moveFiles(request: MoveFilesRequest): Promise<void> {
        await this.client.request('moveFiles', [request]);
        this.pendingPushBranches.add(request.branch);
    }

    async commitPrimaryChanges(request: CommitPrimaryChangesRequest): Promise<void> {
        await this.client.request('commitPrimaryChanges', [request]);
        this.pendingPushBranches.add(request.project.branch);
    }

    async trashPrimaryChange(request: TrashPrimaryChangeRequest): Promise<PrimaryChange[]> {
        return this.client.request<PrimaryChange[]>('trashPrimaryChange', [request]);
    }

    async push(project: ProjectReference): Promise<void> {
        await this.client.request('push', [project]);
        this.pendingPushBranches.delete(project.branch);
    }

    async pull(project: ProjectReference): Promise<void> {
        await this.client.request('pull', [project]);
    }

    hasPendingPush(project: ProjectReference) {
        return this.pendingPushBranches.has(project.branch);
    }

    async loadPendingPush(project: ProjectReference) {
        const hasPendingPush = await this.client.request<boolean>('hasPendingPush', [project]);
        if (hasPendingPush) this.pendingPushBranches.add(project.branch);
        else this.pendingPushBranches.delete(project.branch);
    }

    async selectWorktreeFolder(): Promise<string | null> {
        return this.client.request<string | null>('selectWorktreeFolder', []);
    }

    async addWorktree(project: ProjectReference, folderPath: string): Promise<void> {
        await this.client.request('addWorktree', [project, folderPath]);
    }

    async removeWorktree(project: ProjectReference, folderPath: string, mode: WorktreeRemovalMode): Promise<void> {
        await this.client.request('removeWorktree', [project, folderPath, mode]);
    }

    async prepareWorktree(request: PrepareWorktreeRequest): Promise<void> {
        await this.client.request('prepareWorktree', [request]);
    }

    async commitWorktree(request: CommitWorktreeRequest): Promise<void> {
        await this.client.request('commitWorktree', [request]);
    }

    async discardWorktreeChanges(request: WorktreeOperationRequest): Promise<void> {
        await this.client.request('discardWorktreeChanges', [request]);
    }

    async parkWorktree(request: WorktreeOperationRequest): Promise<void> {
        await this.client.request('parkWorktree', [request]);
    }

    async pullWorktree(request: WorktreeOperationRequest): Promise<void> {
        await this.client.request('pullWorktree', [request]);
    }

    async rebaseWorktree(request: WorktreeOperationRequest): Promise<WorktreeOperationOutcome> {
        return this.client.request<WorktreeOperationOutcome>('rebaseWorktree', [request]);
    }

    async pushWorktree(request: WorktreeOperationRequest): Promise<void> {
        await this.client.request('pushWorktree', [request]);
    }

    async integrateWorktree(request: IntegrateWorktreeRequest): Promise<WorktreeOperationOutcome | DirtyPrimaryOutcome> {
        const outcome = await this.client.request<WorktreeOperationOutcome | DirtyPrimaryOutcome>('integrateWorktree', [request]);
        this.pendingPushBranches.add(request.project.branch);

        return outcome;
    }

    async refreshWorktrees(project: ProjectReference): Promise<void> {
        await this.client.request('refreshWorktrees', [project]);
    }

    onWorktreesChanged(callback: (state: WorktreeState) => void): () => void {
        return this.worktreeSubscription.addListener(callback);
    }

    async getMergeConflictSession(): Promise<MergeConflictSession | null> {
        return this.client.request<MergeConflictSession | null>('getMergeConflictSession', []);
    }

    async abortMergeConflict(request: MergeConflictSessionRequest): Promise<void> {
        await this.client.request('abortMergeConflict', [request]);
    }

    async continueMergeConflict(request: MergeConflictSessionRequest): Promise<WorktreeOperationOutcome> {
        return this.client.request<WorktreeOperationOutcome>('continueMergeConflict', [request]);
    }

    async launchMergeConflictResolver(request: MergeConflictPathRequest): Promise<void> {
        await this.client.request('launchMergeConflictResolver', [request]);
    }

    async markMergeConflictResolved(request: MergeConflictPathRequest): Promise<MergeConflictSession> {
        return this.client.request<MergeConflictSession>('markMergeConflictResolved', [request]);
    }

    async rescanMergeConflict(request: MergeConflictSessionRequest): Promise<MergeConflictSession> {
        return this.client.request<MergeConflictSession>('rescanMergeConflict', [request]);
    }

    onMergeConflictSessionChanged(callback: (session: MergeConflictSession | null) => void): () => void {
        return startCallbackSubscription(this.client, MERGE_CONFLICT_SUBSCRIPTION, callback);
    }

    watchProject(
        project: ProjectReference,
        onChange: (event: ProjectWatchEvent) => void,
        onRestored: () => void,
        onError: (error: Error) => void,
    ): () => void {
        const callbacks = { onChange, onError, onRestored };
        const watch = new RemoteControlProjectWatch(this.client, project, callbacks);
        watch.start();

        return () => watch.stop();
    }
}
