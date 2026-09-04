import type { ActionFile } from '../../data/action_types'
import type {
    ActionQueuedPrompt,
    ActionRunEvent,
    ActionPromptRequest,
    ActionStartRequest,
    AgentConversationReservation,
    AgentApprovalDecision,
    AgentApprovalRequestId,
    PreparedActionPrompt,
} from '../../data/action_run_types'
import type { ActionSchedule } from '../../data/action_schedule_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    ActionRunRecoverySnapshot,
    ActiveActionRun,
    CardActivityRequest,
    CardActionSettingsRequest,
    DiffRequest,
    DiffResult,
    ElectronActionBridge,
    HistoricalFileContent,
    OpenInEditorRequest,
    ReadFileAtCommitRequest,
    WorktreeDiffRequest,
    WorktreeDiffResult,
} from '../../data/electron_action_bridge'
import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import type {
    CodexRateLimitSnapshot,
    ElectronCodexRuntimeBridge,
} from '../../data/electron_codex_runtime_bridge'
import type {
    ClaudeRateLimitSnapshot,
    ElectronClaudeRuntimeBridge,
} from '../../data/electron_claude_runtime_bridge'
import type { AgentAvailability } from '../../data/electron_data_bridge'
import type {
    AgentConversation,
    AgentRunEvent,
    BranchReference,
    CommitWorktreeRequest,
    CommitRequest,
    CommitResult,
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
    ProjectWatchNotification,
    RepositoryReference,
    StorageProjectFiles,
    StorageService,
    TopLevelFolderReference,
    WorktreeOperationRequest,
    WorktreeRemovalMode,
    WorktreeState,
} from '../../data/data_types'
import { MissingWorkingFolderError } from '../../data/data_types'
import type { BridgeErrorPayload } from '../../../../shared/bridge_errors.mjs'
import { rehydrateBridgeError } from '../../data/bridge_error_rehydration'
import { readRemoteControlConnection, type RemoteControlConnectionSettings } from '../../data/remote_control_connection'
import type {
    MergeConflictPathRequest,
    MergeConflictSession,
    MergeConflictSessionRequest,
    WorktreeOperationOutcome,
} from '../../data/merge_conflict_types'
import type { DesktopConfigValues } from '../config/config_entries'
import type { DesktopConfigTransport } from '../config/desktop_config_transport'

interface RemoteControlRequest {
    id: string
    method: string
    params: unknown[]
}

interface RemoteControlResponse {
    error?: BridgeErrorPayload
    id: string
    result?: unknown
}

interface RemoteControlEvent {
    event: string
    payload: unknown
}

interface PendingRequest {
    method: string
    reject: (error: Error) => void
    resolve: (value: unknown) => void
}

interface ConnectionWaiter {
    promise: Promise<void>
    reject: (error: Error) => void
    resolve: () => void
}

interface AgentRunPayload {
    event: AgentRunEvent
    requestId: string
}

interface WatchProjectPayload {
    event: ProjectWatchNotification
    requestId: string
    subscriptionId: string
}

interface ActionRunPayload {
    event: ActionRunEvent
    requestId: string
    subscriptionId: string
}

interface CodexRateLimitsPayload {
    requestId: string
    snapshot: CodexRateLimitSnapshot
    subscriptionId: string
}

interface ClaudeRateLimitsPayload {
    requestId: string
    snapshot: ClaudeRateLimitSnapshot
    subscriptionId: string
}

interface WorktreesChangedPayload {
    requestId: string
    state: WorktreeState
    subscriptionId: string
}

interface ProjectWatchSubscription {
    onChange: (event: ProjectWatchEvent) => void
    onError: (error: Error) => void
    onRestored: () => void
    project: ProjectReference
    serverSubscriptionId: string | null
    subscribing: boolean
}

interface MergeConflictSessionChangedPayload {
    requestId: string
    session: MergeConflictSession | null
    subscriptionId: string
}

const SOCKET_OPEN_STATE = 1
const WORKTREES_CHANGED_EVENT = 'worktreesChanged'

function createConnectionWaiter(): ConnectionWaiter {
    let reject!: (error: Error) => void
    let resolve!: () => void
    const promise = new Promise<void>((promiseResolve, promiseReject) => {
        reject = promiseReject
        resolve = promiseResolve
    })

    return { promise, reject, resolve }
}

export class RemoteControlConnectionError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'RemoteControlConnectionError'
    }
}

export function isRemoteControlConnectionError(error: unknown): error is RemoteControlConnectionError {
    return error instanceof RemoteControlConnectionError
}

function isResponse(message: RemoteControlResponse | RemoteControlEvent): message is RemoteControlResponse {
    return 'id' in message
}

export class RemoteControlStorageService implements
    StorageService, ElectronActionBridge, ElectronClaudeRuntimeBridge, ElectronCodexRuntimeBridge, DesktopConfigTransport {
    async addWorktree(project: ProjectReference, folderPath: string): Promise<void> {
        await this.request('addWorktree', [project, folderPath])
    }

    private actionRunCallbacks: Map<string, (event: ActionRunEvent) => void>
    private actionRunListeners: Set<(event: ActionRunEvent) => void>
    private actionRunSubscriptions: Map<(event: ActionRunEvent) => void, string>
    private connectPromise: Promise<void> | null
    private connectReject: ((error: Error) => void) | null
    private connectionListeners: Set<(connected: boolean) => void>
    private claudeRateLimitCallbacks: Map<string, (snapshot: ClaudeRateLimitSnapshot) => void>
    private claudeRateLimitListeners: Set<(snapshot: ClaudeRateLimitSnapshot) => void>
    private claudeRateLimitSubscriptions: Map<(snapshot: ClaudeRateLimitSnapshot) => void, string>
    private codexRateLimitCallbacks: Map<string, (snapshot: CodexRateLimitSnapshot) => void>
    private codexRateLimitListeners: Set<(snapshot: CodexRateLimitSnapshot) => void>
    private codexRateLimitSubscriptions: Map<(snapshot: CodexRateLimitSnapshot) => void, string>
    private disconnecting: boolean
    private endpoint: string
    private mergeConflictCallbacks: Map<string, (session: MergeConflictSession | null) => void>
    private mergeConflictListeners: Set<(session: MergeConflictSession | null) => void>
    private mergeConflictSubscriptions: Map<(session: MergeConflictSession | null) => void, string>
    private nextId: number
    private readonly pendingPushBranches: Set<string>
    private pending: Map<string, PendingRequest>
    private requestAgentEvents: Map<string, (event: AgentRunEvent) => void>
    private requestActionRunEvents: Map<string, (event: ActionRunEvent) => void>
    private requestClaudeRateLimitEvents: Map<string, (snapshot: ClaudeRateLimitSnapshot) => void>
    private requestCodexRateLimitEvents: Map<string, (snapshot: CodexRateLimitSnapshot) => void>
    private requestWatchEvents: Map<string, ProjectWatchSubscription>
    private reconnectWaiter: ConnectionWaiter | null
    private reconnecting: boolean
    private retired: boolean
    private requestMergeConflictEvents: Map<string, (session: MergeConflictSession | null) => void>
    private runAgentEvents: Map<string, (event: AgentRunEvent) => void>
    private socket: WebSocket | null
    private readonly watchSubscriptions: Set<ProjectWatchSubscription>
    private watchCallbacks: Map<string, ProjectWatchSubscription>
    private readonly worktreeEvents: EventTarget
    private worktreeListenerCount: number
    private worktreeRequestId: string | null
    private worktreeServerSubscriptionId: string | null

    constructor() {
        this.actionRunCallbacks = new Map()
        this.actionRunListeners = new Set()
        this.actionRunSubscriptions = new Map()
        this.connectPromise = null
        this.connectReject = null
        this.connectionListeners = new Set()
        this.claudeRateLimitCallbacks = new Map()
        this.claudeRateLimitListeners = new Set()
        this.claudeRateLimitSubscriptions = new Map()
        this.codexRateLimitCallbacks = new Map()
        this.codexRateLimitListeners = new Set()
        this.codexRateLimitSubscriptions = new Map()
        this.disconnecting = false
        this.endpoint = ''
        this.mergeConflictCallbacks = new Map()
        this.mergeConflictListeners = new Set()
        this.mergeConflictSubscriptions = new Map()
        this.nextId = 1
        this.pendingPushBranches = new Set()
        this.pending = new Map()
        this.requestAgentEvents = new Map()
        this.requestActionRunEvents = new Map()
        this.requestClaudeRateLimitEvents = new Map()
        this.requestCodexRateLimitEvents = new Map()
        this.requestMergeConflictEvents = new Map()
        this.requestWatchEvents = new Map()
        this.reconnectWaiter = null
        this.reconnecting = false
        this.retired = false
        this.runAgentEvents = new Map()
        this.socket = null
        this.watchSubscriptions = new Set()
        this.watchCallbacks = new Map()
        this.worktreeEvents = new EventTarget()
        this.worktreeListenerCount = 0
        this.worktreeRequestId = null
        this.worktreeServerSubscriptionId = null
    }

    init(settings: Partial<RemoteControlConnectionSettings> = {}) {
        const storedSettings = settings.endpoint
            ? settings as RemoteControlConnectionSettings
            : readRemoteControlConnection()
        this.endpoint = storedSettings.endpoint
        this.retired = false
    }

    async connect(): Promise<void> {
        await this.connectSocket()
    }

    disconnect() {
        this.cancelReconnect(new RemoteControlConnectionError('Remote-control connection closed'))
        this.disconnecting = true
        this.socket?.close()
    }

    retire() {
        this.retired = true
        this.cancelReconnect(new RemoteControlConnectionError('Remote-control connection was replaced'))
        this.socket?.close()
    }

    getConnectionSettings(): RemoteControlConnectionSettings {
        if (this.endpoint.length === 0) throw new Error('Remote-control storage is not initialized')

        return { endpoint: this.endpoint }
    }

    onConnectionChanged(callback: (connected: boolean) => void) {
        this.connectionListeners.add(callback)

        return () => this.connectionListeners.delete(callback)
    }

    async checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference> {
        return this.request<ProjectReference>('checkoutBranch', [project, branch])
    }

    async commit(request: CommitRequest): Promise<CommitResult> {
        const result = await this.request<CommitResult>('commit', [request])
        this.pendingPushBranches.add(request.branch)

        return result
    }

    async createProject(project: ProjectReference, folders: string[]): Promise<ProjectReference> {
        return this.request<ProjectReference>('createProject', [project, folders])
    }

    async deleteFile(request: DeleteFileRequest): Promise<void> {
        await this.request('deleteFile', [request])
        this.pendingPushBranches.add(request.branch)
    }

    async deleteFolder(request: DeleteFolderRequest): Promise<void> {
        await this.request('deleteFolder', [request])
        this.pendingPushBranches.add(request.branch)
    }

    async deleteLocalBranch(project: ProjectReference, branchName: string): Promise<void> {
        await this.request('deleteLocalBranch', [project, branchName])
    }

    /** Returns the project currently open in the connected desktop app, or null if none is loaded. */
    async getActiveProject(): Promise<ProjectReference | null> {
        return this.request<ProjectReference | null>('getActiveProject', [])
    }

    async listBranches(project: ProjectReference): Promise<BranchReference[]> {
        return this.request<BranchReference[]>('listBranches', [project])
    }

    async listRepositories(): Promise<RepositoryReference[]> {
        if (this.endpoint.length === 0) throw new Error('Remote-control storage is not initialized')

        return []
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]> {
        return this.request<ActionFile[]>('loadActionFiles', [project, actionsFolder])
    }

    async loadActionSchedules(project: ProjectReference, actionsFolder: string): Promise<ActionSchedule[]> {
        return this.request<ActionSchedule[]>('loadActionSchedules', [project, actionsFolder])
    }

    async cancelActionSchedule(project: ProjectReference, actionsFolder: string, scheduleId: string): Promise<ActionSchedule[]> {
        return this.request<ActionSchedule[]>('cancelActionSchedule', [project, actionsFolder, scheduleId])
    }

    async loadAgentConversation(_project: ProjectReference, path: string): Promise<AgentConversation> {
        return this.request<AgentConversation>('loadAgentConversation', [path])
    }

    async loadActivityConversations(_project: ProjectReference, path: string): Promise<AgentConversation[]> {
        return this.request<AgentConversation[]>('loadActivityConversations', [path])
    }

    async listAgentConversationReferences(project: ProjectReference, projectFolder: string): Promise<string[]> {
        return this.request<string[]>('listAgentConversationReferences', [project, projectFolder])
    }

    async loadProjectAsset(_project: ProjectReference, path: string): Promise<ProjectAsset> {
        return this.request<ProjectAsset>('loadProjectAsset', [path])
    }

    async loadTextFile(project: ProjectReference, path: string): Promise<MarkdownFile> {
        return this.request<MarkdownFile>('loadTextFile', [project, path])
    }

    async loadProject(
        project: ProjectReference,
        workingFolder: string,
        excludedRootFolder?: string,
    ): Promise<StorageProjectFiles> {
        const params = excludedRootFolder === undefined
            ? [project, workingFolder]
            : [project, workingFolder, excludedRootFolder]

        return this.request<StorageProjectFiles>('loadProject', params)
    }

    async loadFile(project: ProjectReference, path: string): Promise<MarkdownFile> {
        return this.request<MarkdownFile>('loadFile', [project, path])
    }

    async loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        return this.request<StorageProjectFiles>('loadProjectRoot', [project, workingFolder])
    }

    async loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null> {
        return this.request<Partial<ProjectConfig> | null>('loadProjectConfig', [project])
    }

    async listRepositoryFiles(project: ProjectReference): Promise<string[]> {
        return this.request<string[]>('listRepositoryFiles', [project])
    }

    async listTopLevelFolders(project: ProjectReference): Promise<TopLevelFolderReference[]> {
        return this.request<TopLevelFolderReference[]>('listTopLevelFolders', [project])
    }

    async removeWorktree(project: ProjectReference, folderPath: string, mode: WorktreeRemovalMode): Promise<void> {
        await this.request('removeWorktree', [project, folderPath, mode])
    }

    async selectWorktreeFolder(): Promise<string | null> {
        return this.request<string | null>('selectWorktreeFolder', [])
    }

    async loadPendingPush(project: ProjectReference) {
        const hasPendingPush = await this.request<boolean>('hasPendingPush', [project])
        if (hasPendingPush) this.pendingPushBranches.add(project.branch)
        else this.pendingPushBranches.delete(project.branch)
    }

    async moveFiles(request: MoveFilesRequest): Promise<void> {
        await this.request('moveFiles', [request])
        this.pendingPushBranches.add(request.branch)
    }

    async integrateWorktree(request: IntegrateWorktreeRequest): Promise<WorktreeOperationOutcome> {
        const outcome = await this.request<WorktreeOperationOutcome>('integrateWorktree', [request])
        this.pendingPushBranches.add(request.project.branch)

        return outcome
    }

    async abortMergeConflict(request: MergeConflictSessionRequest): Promise<void> {
        await this.request('abortMergeConflict', [request])
    }

    async continueMergeConflict(request: MergeConflictSessionRequest): Promise<WorktreeOperationOutcome> {
        return this.request<WorktreeOperationOutcome>('continueMergeConflict', [request])
    }

    async getMergeConflictSession(): Promise<MergeConflictSession | null> {
        return this.request<MergeConflictSession | null>('getMergeConflictSession', [])
    }

    async launchMergeConflictResolver(request: MergeConflictPathRequest): Promise<void> {
        await this.request('launchMergeConflictResolver', [request])
    }

    async markMergeConflictResolved(request: MergeConflictPathRequest): Promise<MergeConflictSession> {
        return this.request<MergeConflictSession>('markMergeConflictResolved', [request])
    }

    async rescanMergeConflict(request: MergeConflictSessionRequest): Promise<MergeConflictSession> {
        return this.request<MergeConflictSession>('rescanMergeConflict', [request])
    }

    async push(project: ProjectReference): Promise<void> {
        await this.request('push', [project])
        this.pendingPushBranches.delete(project.branch)
    }

    async pull(project: ProjectReference): Promise<void> {
        await this.request('pull', [project])
    }

    async prepareWorktree(request: PrepareWorktreeRequest): Promise<void> {
        await this.request('prepareWorktree', [request])
    }

    async commitWorktree(request: CommitWorktreeRequest): Promise<void> {
        await this.request('commitWorktree', [request])
    }

    async discardWorktreeChanges(request: WorktreeOperationRequest): Promise<void> {
        await this.request('discardWorktreeChanges', [request])
    }

    async parkWorktree(request: WorktreeOperationRequest): Promise<void> {
        await this.request('parkWorktree', [request])
    }

    async pullWorktree(request: WorktreeOperationRequest): Promise<void> {
        await this.request('pullWorktree', [request])
    }

    async rebaseWorktree(request: WorktreeOperationRequest): Promise<WorktreeOperationOutcome> {
        return this.request<WorktreeOperationOutcome>('rebaseWorktree', [request])
    }

    async pushWorktree(request: WorktreeOperationRequest): Promise<void> {
        await this.request('pushWorktree', [request])
    }

    async refreshWorktrees(project: ProjectReference): Promise<void> {
        await this.request('refreshWorktrees', [project])
    }

    async saveActionSchedules(project: ProjectReference, actionsFolder: string, schedules: ActionSchedule[]): Promise<ActionSchedule[]> {
        return this.request<ActionSchedule[]>('saveActionSchedules', [project, actionsFolder, schedules])
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void> {
        await this.request('saveProjectConfig', [project, config])
        this.pendingPushBranches.add(project.branch)
    }

    hasPendingPush(project: ProjectReference) {
        return this.pendingPushBranches.has(project.branch)
    }

    async stopAgent(_project: ProjectReference, runId: string): Promise<void> {
        await this.request('stopAgent', [runId])
    }

    watchProject(
        project: ProjectReference,
        onChange: (event: ProjectWatchEvent) => void,
        onRestored: () => void,
        onError: (error: Error) => void,
    ): () => void {
        const subscription: ProjectWatchSubscription = {
            onChange,
            onError,
            onRestored,
            project,
            serverSubscriptionId: null,
            subscribing: false,
        }
        this.watchSubscriptions.add(subscription)
        void this.subscribeProjectWatch(subscription, false).catch(onError)

        return () => {
            this.watchSubscriptions.delete(subscription)
            for (const [requestId, pendingSubscription] of this.requestWatchEvents) {
                if (pendingSubscription === subscription) this.requestWatchEvents.delete(requestId)
            }
            const { serverSubscriptionId } = subscription
            subscription.serverSubscriptionId = null
            if (!serverSubscriptionId) return

            this.watchCallbacks.delete(serverSubscriptionId)
            this.unsubscribeBestEffort(serverSubscriptionId)
        }
    }

    onWorktreesChanged(callback: (state: WorktreeState) => void): () => void {
        const listener: EventListener = (event) => callback((event as CustomEvent<WorktreeState>).detail)
        let active = true
        this.worktreeEvents.addEventListener(WORKTREES_CHANGED_EVENT, listener)
        this.worktreeListenerCount += 1
        void this.subscribeWorktreesChanged().catch(() => undefined)

        return () => {
            if (!active) return

            active = false
            this.worktreeEvents.removeEventListener(WORKTREES_CHANGED_EVENT, listener)
            this.worktreeListenerCount -= 1
            if (this.worktreeListenerCount > 0) return

            const subscriptionId = this.worktreeServerSubscriptionId
            this.worktreeRequestId = null
            this.worktreeServerSubscriptionId = null
            if (!subscriptionId) return

            this.unsubscribeBestEffort(subscriptionId)
        }
    }

    onMergeConflictSessionChanged(callback: (session: MergeConflictSession | null) => void): () => void {
        this.mergeConflictListeners.add(callback)
        void this.subscribeMergeConflict(callback).catch(() => undefined)

        return () => {
            this.mergeConflictListeners.delete(callback)
            for (const [requestId, pendingCallback] of this.requestMergeConflictEvents) {
                if (pendingCallback === callback) this.requestMergeConflictEvents.delete(requestId)
            }
            const subscriptionId = this.mergeConflictSubscriptions.get(callback)
            if (!subscriptionId) return

            this.mergeConflictSubscriptions.delete(callback)
            this.mergeConflictCallbacks.delete(subscriptionId)
            this.unsubscribeBestEffort(subscriptionId)
        }
    }

    async cancelActionRun(runId: string): Promise<void> {
        await this.request('cancelActionRun', [runId])
    }

    async closeWaitingActionConversation(
        reference: string,
        status: 'cancelled' | 'completed',
    ): Promise<AgentConversation> {
        return this.request<AgentConversation>('closeWaitingActionConversation', [reference, status])
    }

    async updateActionConversationViewed(reference: string, viewed: boolean): Promise<AgentConversation> {
        return this.request<AgentConversation>('updateActionConversationViewed', [reference, viewed])
    }

    async updateCardActionSettings(request: CardActionSettingsRequest): Promise<void> {
        await this.request('updateCardActionSettings', [request])
    }

    async sendActionMessage(runId: string, content: string): Promise<void> {
        await this.request('sendActionMessage', [runId, content])
    }

    async deleteActionQueuedPrompt(runId: string, promptId: string, revision: number): Promise<{ deleted: true }> {
        return this.request('deleteActionQueuedPrompt', [runId, promptId, revision])
    }

    async editActionQueuedPrompt(
        runId: string,
        promptId: string,
        revision: number,
        content: string,
    ): Promise<ActionQueuedPrompt> {
        return this.request('editActionQueuedPrompt', [runId, promptId, revision, content])
    }

    async enqueueActionPrompt(runId: string, content: string): Promise<ActionQueuedPrompt> {
        return this.request('enqueueActionPrompt', [runId, content])
    }

    async answerActionQuestion(
        runId: string,
        requestId: number | string | null,
        answers: Record<string, string[]>,
    ): Promise<void> {
        await this.request('answerActionQuestion', [runId, requestId, answers])
    }

    async dismissActionQuestions(runId: string, requestId: number | string | null): Promise<void> {
        await this.request('dismissActionQuestions', [runId, requestId])
    }

    async answerActionApproval(
        runId: string,
        requestId: AgentApprovalRequestId,
        decision: AgentApprovalDecision,
    ): Promise<void> {
        await this.request('answerActionApproval', [runId, requestId, decision])
    }

    async finishActionRun(runId: string): Promise<void> {
        await this.request('finishActionRun', [runId])
    }

    async listActiveActionRuns(): Promise<ActiveActionRun[]> {
        return this.request<ActiveActionRun[]>('listActiveActionRuns', [])
    }

    async acquireReleaseCardLocks(cardInternalIds: string[]): Promise<string> {
        return this.request<string>('acquireReleaseCardLocks', [cardInternalIds])
    }

    async releaseReleaseCardLocks(leaseId: string): Promise<void> {
        await this.request('releaseReleaseCardLocks', [leaseId])
    }

    async reserveActionConversation(request: ActionStartRequest): Promise<AgentConversationReservation> {
        return this.request<AgentConversationReservation>('reserveActionConversation', [request])
    }

    async restartActionRun(runId: string, request: ActionStartRequest): Promise<string> {
        return this.request<string>('restartActionRun', [runId, request])
    }

    async generateDiff(request: DiffRequest): Promise<DiffResult> {
        return this.request<DiffResult>('generateDiff', [request])
    }

    async generateWorktreeDiff(request: WorktreeDiffRequest): Promise<WorktreeDiffResult> {
        return this.request<WorktreeDiffResult>('generateWorktreeDiff', [request])
    }

    async loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]> {
        return this.request<ActionRunHistoryEntry[]>('loadActionRunHistory', [request])
    }

    async loadActionRunRecoverySnapshot(rendererRunIds: string[]): Promise<ActionRunRecoverySnapshot> {
        return this.request<ActionRunRecoverySnapshot>('loadActionRunRecoverySnapshot', [rendererRunIds])
    }

    async getCodexRateLimits(): Promise<CodexRateLimitSnapshot | null> {
        return this.request<CodexRateLimitSnapshot | null>('getCodexRateLimits', [])
    }

    async getClaudeRateLimits(): Promise<ClaudeRateLimitSnapshot | null> {
        return this.request<ClaudeRateLimitSnapshot | null>('getClaudeRateLimits', [])
    }

    async notifyActionCardStateChange(cardInternalId: string, state: string): Promise<void> {
        await this.request('notifyActionCardStateChange', [cardInternalId, state])
    }

    async loadCardActivity(request: CardActivityRequest): Promise<CardActivityFile> {
        return this.request<CardActivityFile>('loadCardActivity', [request])
    }

    async loadAgentAvailability(): Promise<Record<string, AgentAvailability>> {
        return this.request<Record<string, AgentAvailability>>('loadAgentAvailability', [])
    }

    async loadDesktopConfig(): Promise<DesktopConfigValues> {
        return this.request<DesktopConfigValues>('loadDesktopConfig', [])
    }

    async saveDesktopConfig(values: DesktopConfigValues): Promise<DesktopConfigValues> {
        return this.request<DesktopConfigValues>('saveDesktopConfig', [values])
    }

    onActionRun(callback: (event: ActionRunEvent) => void): () => void {
        this.actionRunListeners.add(callback)
        void this.subscribeActionRun(callback).catch(() => undefined)

        return () => {
            this.actionRunListeners.delete(callback)
            for (const [requestId, pendingCallback] of this.requestActionRunEvents) {
                if (pendingCallback === callback) this.requestActionRunEvents.delete(requestId)
            }
            const subscriptionId = this.actionRunSubscriptions.get(callback)
            if (!subscriptionId) return

            this.actionRunSubscriptions.delete(callback)
            this.actionRunCallbacks.delete(subscriptionId)
            this.unsubscribeBestEffort(subscriptionId)
        }
    }

    onCodexRateLimits(callback: (snapshot: CodexRateLimitSnapshot) => void): () => void {
        this.codexRateLimitListeners.add(callback)
        void this.subscribeCodexRateLimits(callback).catch(() => undefined)

        return () => {
            this.codexRateLimitListeners.delete(callback)
            for (const [requestId, pendingCallback] of this.requestCodexRateLimitEvents) {
                if (pendingCallback === callback) this.requestCodexRateLimitEvents.delete(requestId)
            }
            const subscriptionId = this.codexRateLimitSubscriptions.get(callback)
            if (!subscriptionId) return

            this.codexRateLimitSubscriptions.delete(callback)
            this.codexRateLimitCallbacks.delete(subscriptionId)
            this.unsubscribeBestEffort(subscriptionId)
        }
    }

    onClaudeRateLimits(callback: (snapshot: ClaudeRateLimitSnapshot) => void): () => void {
        this.claudeRateLimitListeners.add(callback)
        void this.subscribeClaudeRateLimits(callback).catch(() => undefined)

        return () => {
            this.claudeRateLimitListeners.delete(callback)
            for (const [requestId, pendingCallback] of this.requestClaudeRateLimitEvents) {
                if (pendingCallback === callback) this.requestClaudeRateLimitEvents.delete(requestId)
            }
            const subscriptionId = this.claudeRateLimitSubscriptions.get(callback)
            if (!subscriptionId) return

            this.claudeRateLimitSubscriptions.delete(callback)
            this.claudeRateLimitCallbacks.delete(subscriptionId)
            this.unsubscribeBestEffort(subscriptionId)
        }
    }

    async openInEditor(request: OpenInEditorRequest): Promise<void> {
        await this.request('openInEditor', [request])
    }

    async prepareActionPrompt(request: ActionPromptRequest): Promise<PreparedActionPrompt> {
        return this.request<PreparedActionPrompt>('prepareActionPrompt', [request])
    }

    async readFileAtCommit(request: ReadFileAtCommitRequest): Promise<HistoricalFileContent> {
        return this.request<HistoricalFileContent>('readFileAtCommit', [request])
    }

    async runSearchRegexpAgent(input: string, callback?: (event: AgentRunEvent) => void): Promise<string> {
        return this.requestWithAgentEvents<string>('runSearchRegexpAgent', [input], callback)
    }

    async startAction(request: ActionStartRequest): Promise<string> {
        return this.request<string>('startAction', [request])
    }

    async startUnattendedAction(request: ActionStartRequest): Promise<string> {
        return this.request<string>('startUnattendedAction', [request])
    }

    private async requestWithAgentEvents<T>(method: string, params: unknown[], onEvent?: (event: AgentRunEvent) => void): Promise<T> {
        if (!onEvent) return this.request<T>(method, params)

        const id = this.createRequestId()
        this.requestAgentEvents.set(id, onEvent)

        try {
            const result = await this.sendRequest<T>({ id, method, params })
            const runId = (result as { runId?: unknown }).runId
            if (typeof runId === 'string') this.runAgentEvents.set(runId, onEvent)

            return result
        } finally {
            this.requestAgentEvents.delete(id)
        }
    }

    private async request<T>(method: string, params: unknown[]): Promise<T> {
        return this.sendRequest<T>({ id: this.createRequestId(), method, params })
    }

    private async sendRequest<T>(request: RemoteControlRequest): Promise<T> {
        await this.ensureConnected()

        return new Promise<T>((resolve, reject) => {
            this.pending.set(request.id, { method: request.method, reject, resolve: resolve as (value: unknown) => void })
            this.requireSocket().send(JSON.stringify(request))
        })
    }

    private createRequestId() {
        const id = `remote-${this.nextId}`
        this.nextId += 1

        return id
    }

    private unsubscribeBestEffort(subscriptionId: string) {
        const socket = this.socket
        if (socket?.readyState !== SOCKET_OPEN_STATE) return

        const request: RemoteControlRequest = { id: this.createRequestId(), method: 'unsubscribe', params: [subscriptionId] }
        try {
            socket.send(JSON.stringify(request))
        } catch {
            // Socket closure already removes the server-side subscription.
        }
    }

    private async ensureConnected() {
        if (this.retired) throw new RemoteControlConnectionError('Remote-control connection was replaced')
        if (this.reconnecting) {
            const waiter = this.reconnectWaiter ?? createConnectionWaiter()
            this.reconnectWaiter = waiter
            await waiter.promise
            if (this.retired) throw new RemoteControlConnectionError('Remote-control connection was replaced')
        }
        if (this.socket?.readyState === SOCKET_OPEN_STATE) return

        await this.connectSocket()
    }

    private connectSocket(): Promise<void> {
        if (this.retired) return Promise.reject(new RemoteControlConnectionError('Remote-control connection was replaced'))
        if (this.socket?.readyState === SOCKET_OPEN_STATE) return Promise.resolve()
        if (this.connectPromise) return this.connectPromise

        this.disconnecting = false
        const socket = new WebSocket(this.endpoint)
        this.socket = socket
        socket.addEventListener('message', (event) => this.handleMessage(socket, event))
        socket.addEventListener('close', () => this.handleClose(socket))
        socket.addEventListener('error', () => this.handleError(socket))
        this.connectPromise = new Promise((resolve, reject) => {
            const handleOpen = () => {
                if (this.socket !== socket) return

                this.connectPromise = null
                this.connectReject = null
                this.reconnecting = false
                this.reconnectWaiter?.resolve()
                this.reconnectWaiter = null
                resolve()
                for (const listener of this.connectionListeners) listener(true)
                void this.restoreActionRunSubscriptions()
                void this.restoreClaudeRateLimitSubscriptions()
                void this.restoreCodexRateLimitSubscriptions()
                void this.restoreMergeConflictSubscriptions()
                void this.restoreProjectWatchSubscriptions()
                void this.restoreWorktreeSubscription()
            }
            const handleError = () => {
                if (this.socket === socket) {
                    this.connectPromise = null
                    this.connectReject = null
                }
                reject(new RemoteControlConnectionError('Remote-control connection failed'))
            }

            this.connectReject = reject
            socket.addEventListener('open', handleOpen, { once: true })
            socket.addEventListener('error', handleError, { once: true })
        })

        return this.connectPromise
    }

    private handleMessage(socket: WebSocket, event: MessageEvent) {
        if (socket !== this.socket) return

        const message = JSON.parse(String(event.data)) as RemoteControlResponse | RemoteControlEvent
        if (isResponse(message)) {
            this.handleResponse(message)
            return
        }

        this.handleEvent(message)
    }

    private handleResponse(response: RemoteControlResponse) {
        const pending = this.pending.get(response.id)
        if (!pending) return

        this.pending.delete(response.id)
        if (response.error) {
            // Rebuild the typed error first, so a marked failure such as a missing working folder
            // stays recognisable instead of arriving as a plain message.
            const cause = rehydrateBridgeError(response.error)
            const failure = new Error(`Remote method ${pending.method} failed: ${response.error.message}`, { cause }) as Error & { code?: string }
            if (response.error.code !== undefined) failure.code = response.error.code
            Object.assign(failure, response.error.fields ?? {})
            pending.reject(cause instanceof MissingWorkingFolderError ? cause : failure)
            return
        }

        pending.resolve(response.result)
    }

    private handleEvent(message: RemoteControlEvent) {
        if (message.event === 'actionRun') {
            this.handleActionRunEvent(message.payload as ActionRunPayload)
            return
        }
        if (message.event === 'codexRateLimits') {
            this.handleCodexRateLimitsEvent(message.payload as CodexRateLimitsPayload)
            return
        }
        if (message.event === 'claudeRateLimits') {
            this.handleClaudeRateLimitsEvent(message.payload as ClaudeRateLimitsPayload)
            return
        }
        if (message.event === 'watchProject') {
            this.handleWatchProjectEvent(message.payload as WatchProjectPayload)
            return
        }
        if (message.event === 'worktreesChanged') {
            this.handleWorktreesChangedEvent(message.payload as WorktreesChangedPayload)
            return
        }
        if (message.event === 'mergeConflictSessionChanged') {
            this.handleMergeConflictSessionChangedEvent(message.payload as MergeConflictSessionChangedPayload)
            return
        }

        if (message.event === 'agentRun') this.handleAgentRunEvent(message.payload as AgentRunPayload)
    }

    private handleActionRunEvent(payload: ActionRunPayload) {
        const callback = this.actionRunCallbacks.get(payload.subscriptionId)
            ?? this.requestActionRunEvents.get(payload.requestId)
        callback?.(payload.event)
    }

    private handleCodexRateLimitsEvent(payload: CodexRateLimitsPayload) {
        const callback = this.codexRateLimitCallbacks.get(payload.subscriptionId)
            ?? this.requestCodexRateLimitEvents.get(payload.requestId)
        callback?.(payload.snapshot)
    }

    private handleClaudeRateLimitsEvent(payload: ClaudeRateLimitsPayload) {
        const callback = this.claudeRateLimitCallbacks.get(payload.subscriptionId)
            ?? this.requestClaudeRateLimitEvents.get(payload.requestId)
        callback?.(payload.snapshot)
    }

    private async restoreActionRunSubscriptions() {
        const pendingCallbacks = new Set(this.requestActionRunEvents.values())
        const callbacks = [...this.actionRunListeners].filter((callback) => !pendingCallbacks.has(callback))
        await Promise.allSettled(callbacks.map((callback) => this.subscribeActionRun(callback)))
    }

    private async subscribeActionRun(callback: (event: ActionRunEvent) => void) {
        const id = this.createRequestId()
        this.requestActionRunEvents.set(id, callback)
        try {
            const result = await this.sendRequest<{ subscriptionId: string }>({
                id,
                method: 'onActionRun',
                params: [],
            })
            if (!this.actionRunListeners.has(callback)) {
                this.unsubscribeBestEffort(result.subscriptionId)
                return
            }
            this.actionRunSubscriptions.set(callback, result.subscriptionId)
            this.actionRunCallbacks.set(result.subscriptionId, callback)
        } finally {
            this.requestActionRunEvents.delete(id)
        }
    }

    private async restoreCodexRateLimitSubscriptions() {
        const pendingCallbacks = new Set(this.requestCodexRateLimitEvents.values())
        const callbacks = [...this.codexRateLimitListeners].filter((callback) => !pendingCallbacks.has(callback))
        await Promise.allSettled(callbacks.map((callback) => this.subscribeCodexRateLimits(callback)))
    }

    private async restoreClaudeRateLimitSubscriptions() {
        const pendingCallbacks = new Set(this.requestClaudeRateLimitEvents.values())
        const callbacks = [...this.claudeRateLimitListeners].filter((callback) => !pendingCallbacks.has(callback))
        await Promise.allSettled(callbacks.map((callback) => this.subscribeClaudeRateLimits(callback)))
    }

    private async restoreProjectWatchSubscriptions() {
        const subscriptions = [...this.watchSubscriptions].filter((subscription) => (
            !subscription.subscribing && subscription.serverSubscriptionId === null
        ))
        await Promise.allSettled(subscriptions.map((subscription) => this.subscribeProjectWatch(subscription, true)))
    }

    private async restoreMergeConflictSubscriptions() {
        const pendingCallbacks = new Set(this.requestMergeConflictEvents.values())
        const callbacks = [...this.mergeConflictListeners].filter((callback) => !pendingCallbacks.has(callback))
        await Promise.allSettled(callbacks.map((callback) => this.subscribeMergeConflict(callback)))
    }

    private async restoreWorktreeSubscription() {
        await this.subscribeWorktreesChanged()
    }

    private async subscribeMergeConflict(callback: (session: MergeConflictSession | null) => void) {
        const id = this.createRequestId()
        this.requestMergeConflictEvents.set(id, callback)
        try {
            const result = await this.sendRequest<{ subscriptionId: string }>({
                id,
                method: 'onMergeConflictSessionChanged',
                params: [],
            })
            if (!this.mergeConflictListeners.has(callback)) {
                this.unsubscribeBestEffort(result.subscriptionId)
                return
            }

            this.mergeConflictSubscriptions.set(callback, result.subscriptionId)
            this.mergeConflictCallbacks.set(result.subscriptionId, callback)
        } finally {
            this.requestMergeConflictEvents.delete(id)
        }
    }

    private async subscribeProjectWatch(subscription: ProjectWatchSubscription, restored: boolean) {
        if (!this.watchSubscriptions.has(subscription) || subscription.subscribing || subscription.serverSubscriptionId) return

        const id = this.createRequestId()
        subscription.subscribing = true
        this.requestWatchEvents.set(id, subscription)
        try {
            const result = await this.sendRequest<{ subscriptionId: string }>({
                id,
                method: 'watchProject',
                params: [subscription.project],
            })
            if (!this.watchSubscriptions.has(subscription)) {
                this.unsubscribeBestEffort(result.subscriptionId)
                return
            }

            subscription.serverSubscriptionId = result.subscriptionId
            this.watchCallbacks.set(result.subscriptionId, subscription)
            if (restored) subscription.onRestored()
        } finally {
            subscription.subscribing = false
            this.requestWatchEvents.delete(id)
        }
    }

    private async subscribeCodexRateLimits(callback: (snapshot: CodexRateLimitSnapshot) => void) {
        const id = this.createRequestId()
        this.requestCodexRateLimitEvents.set(id, callback)
        try {
            const result = await this.sendRequest<{ subscriptionId: string }>({
                id,
                method: 'onCodexRateLimits',
                params: [],
            })
            if (!this.codexRateLimitListeners.has(callback)) {
                this.unsubscribeBestEffort(result.subscriptionId)
                return
            }
            this.codexRateLimitSubscriptions.set(callback, result.subscriptionId)
            this.codexRateLimitCallbacks.set(result.subscriptionId, callback)
        } finally {
            this.requestCodexRateLimitEvents.delete(id)
        }
    }

    private async subscribeClaudeRateLimits(callback: (snapshot: ClaudeRateLimitSnapshot) => void) {
        const id = this.createRequestId()
        this.requestClaudeRateLimitEvents.set(id, callback)
        try {
            const result = await this.sendRequest<{ subscriptionId: string }>({
                id,
                method: 'onClaudeRateLimits',
                params: [],
            })
            if (!this.claudeRateLimitListeners.has(callback)) {
                this.unsubscribeBestEffort(result.subscriptionId)
                return
            }
            this.claudeRateLimitSubscriptions.set(callback, result.subscriptionId)
            this.claudeRateLimitCallbacks.set(result.subscriptionId, callback)
        } finally {
            this.requestClaudeRateLimitEvents.delete(id)
        }
    }

    private async subscribeWorktreesChanged() {
        if (this.worktreeListenerCount === 0 || this.worktreeRequestId || this.worktreeServerSubscriptionId) return

        const id = this.createRequestId()
        this.worktreeRequestId = id
        try {
            const result = await this.sendRequest<{ subscriptionId: string }>({
                id,
                method: 'onWorktreesChanged',
                params: [],
            })
            if (this.worktreeRequestId !== id || this.worktreeListenerCount === 0) {
                this.unsubscribeBestEffort(result.subscriptionId)
                return
            }

            this.worktreeRequestId = null
            this.worktreeServerSubscriptionId = result.subscriptionId
        } finally {
            if (this.worktreeRequestId === id) this.worktreeRequestId = null
        }
    }

    private handleWatchProjectEvent(payload: WatchProjectPayload) {
        const subscription = this.watchCallbacks.get(payload.subscriptionId)
            ?? this.requestWatchEvents.get(payload.requestId)
        if ('error' in payload.event) {
            subscription?.onError(new Error(payload.event.error))
            return
        }

        subscription?.onChange(payload.event)
    }

    private handleWorktreesChangedEvent(payload: WorktreesChangedPayload) {
        const matchesRequest = payload.requestId === this.worktreeRequestId
        const matchesSubscription = payload.subscriptionId === this.worktreeServerSubscriptionId
        if (!matchesRequest && !matchesSubscription) return

        this.worktreeEvents.dispatchEvent(new CustomEvent(WORKTREES_CHANGED_EVENT, { detail: payload.state }))
    }

    private handleMergeConflictSessionChangedEvent(payload: MergeConflictSessionChangedPayload) {
        const callback = this.mergeConflictCallbacks.get(payload.subscriptionId)
            ?? this.requestMergeConflictEvents.get(payload.requestId)
        callback?.(payload.session)
    }

    private handleAgentRunEvent(payload: AgentRunPayload) {
        const callback = this.requestAgentEvents.get(payload.requestId) ?? this.runAgentEvents.get(payload.event.runId)
        callback?.(payload.event)
        if (payload.event.type === 'closed') this.runAgentEvents.delete(payload.event.runId)
    }

    private handleClose(socket: WebSocket) {
        this.closeSocket(socket, new RemoteControlConnectionError('Remote-control connection closed'))
    }

    private handleError(socket: WebSocket) {
        const message = this.connectPromise
            ? 'Remote-control connection failed'
            : 'Remote-control connection closed'
        this.closeSocket(socket, new RemoteControlConnectionError(message))
    }

    private closeSocket(socket: WebSocket, error: RemoteControlConnectionError) {
        if (socket !== this.socket) return

        this.connectReject?.(error)
        this.connectReject = null
        this.reconnecting = !this.retired && !this.disconnecting
        this.disconnecting = false
        for (const listener of this.connectionListeners) listener(false)
        for (const pending of this.pending.values()) pending.reject(error)
        this.pending.clear()
        this.actionRunCallbacks.clear()
        this.actionRunSubscriptions.clear()
        this.claudeRateLimitCallbacks.clear()
        this.claudeRateLimitSubscriptions.clear()
        this.codexRateLimitCallbacks.clear()
        this.codexRateLimitSubscriptions.clear()
        this.mergeConflictCallbacks.clear()
        this.mergeConflictSubscriptions.clear()
        this.requestAgentEvents.clear()
        this.requestActionRunEvents.clear()
        this.requestClaudeRateLimitEvents.clear()
        this.requestCodexRateLimitEvents.clear()
        this.requestMergeConflictEvents.clear()
        this.requestWatchEvents.clear()
        this.runAgentEvents.clear()
        this.watchCallbacks.clear()
        for (const subscription of this.watchSubscriptions) {
            subscription.serverSubscriptionId = null
            subscription.subscribing = false
        }
        this.worktreeRequestId = null
        this.worktreeServerSubscriptionId = null
        this.connectPromise = null
        this.socket = null
    }

    private cancelReconnect(error: RemoteControlConnectionError) {
        this.reconnecting = false
        this.reconnectWaiter?.reject(error)
        this.reconnectWaiter = null
    }

    private requireSocket() {
        if (!this.socket) throw new Error('Remote-control socket is not connected')

        return this.socket
    }
}
