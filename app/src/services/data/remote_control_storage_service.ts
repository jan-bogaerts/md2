import type { ActionFile } from '../../data/action_types'
import type {
    ActionExecutionEvent,
    ActionPromptRequest,
    ActionStartRequest,
    AgentApprovalDecision,
    AgentApprovalRequestId,
    PreparedActionPrompt,
} from '../../data/action_run_types'
import type { ActionSchedule } from '../../data/action_schedule_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    CardActivityRequest,
    DiffRequest,
    DiffResult,
    ElectronActionBridge,
    HistoricalFileContent,
    OpenInEditorRequest,
    ReadFileAtCommitRequest,
} from '../../data/electron_action_bridge'
import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import type {
    CodexRateLimitSnapshot,
    ElectronCodexRuntimeBridge,
} from '../../data/electron_codex_runtime_bridge'
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
    WorktreeOperationRequest,
    WorktreeState,
} from '../../data/data_types'
import { readRemoteControlConnection, type RemoteControlConnectionSettings } from '../../data/remote_control_connection'

interface RemoteControlRequest {
    id: string
    method: string
    params: unknown[]
}

interface RemoteControlResponse {
    error?: { message: string }
    id: string
    result?: unknown
}

interface RemoteControlEvent {
    event: string
    payload: unknown
}

interface PendingRequest {
    reject: (error: Error) => void
    resolve: (value: unknown) => void
}

interface AgentRunPayload {
    event: AgentRunEvent
    requestId: string
}

interface WatchProjectPayload {
    event: ProjectWatchEvent
    requestId: string
    subscriptionId: string
}

interface ActionExecutionPayload {
    event: ActionExecutionEvent
    requestId: string
    subscriptionId: string
}

interface CodexRateLimitsPayload {
    requestId: string
    snapshot: CodexRateLimitSnapshot
    subscriptionId: string
}

interface WorktreesChangedPayload {
    requestId: string
    state: WorktreeState
    subscriptionId: string
}

const SOCKET_OPEN_STATE = 1

function isResponse(message: RemoteControlResponse | RemoteControlEvent): message is RemoteControlResponse {
    return 'id' in message
}

export class RemoteControlStorageService implements StorageService, ElectronActionBridge, ElectronCodexRuntimeBridge {
    async addWorktree(project: ProjectReference): Promise<boolean> {
        return this.request<boolean>('addWorktree', [project])
    }

    private actionExecutionCallbacks: Map<string, (event: ActionExecutionEvent) => void>
    private actionExecutionListeners: Set<(event: ActionExecutionEvent) => void>
    private actionExecutionSubscriptions: Map<(event: ActionExecutionEvent) => void, string>
    private connectPromise: Promise<void> | null
    private connectionListeners: Set<(connected: boolean) => void>
    private codexRateLimitCallbacks: Map<string, (snapshot: CodexRateLimitSnapshot) => void>
    private codexRateLimitListeners: Set<(snapshot: CodexRateLimitSnapshot) => void>
    private codexRateLimitSubscriptions: Map<(snapshot: CodexRateLimitSnapshot) => void, string>
    private endpoint: string
    private nextId: number
    private readonly pendingPushBranches: Set<string>
    private pending: Map<string, PendingRequest>
    private requestAgentEvents: Map<string, (event: AgentRunEvent) => void>
    private requestActionExecutionEvents: Map<string, (event: ActionExecutionEvent) => void>
    private requestCodexRateLimitEvents: Map<string, (snapshot: CodexRateLimitSnapshot) => void>
    private requestWatchEvents: Map<string, (event: ProjectWatchEvent) => void>
    private requestWorktreeEvents: Map<string, (state: WorktreeState) => void>
    private runAgentEvents: Map<string, (event: AgentRunEvent) => void>
    private socket: WebSocket | null
    private token: string
    private watchCallbacks: Map<string, (event: ProjectWatchEvent) => void>
    private worktreeCallbacks: Map<string, (state: WorktreeState) => void>

    constructor() {
        this.actionExecutionCallbacks = new Map()
        this.actionExecutionListeners = new Set()
        this.actionExecutionSubscriptions = new Map()
        this.connectPromise = null
        this.connectionListeners = new Set()
        this.codexRateLimitCallbacks = new Map()
        this.codexRateLimitListeners = new Set()
        this.codexRateLimitSubscriptions = new Map()
        this.endpoint = ''
        this.nextId = 1
        this.pendingPushBranches = new Set()
        this.pending = new Map()
        this.requestAgentEvents = new Map()
        this.requestActionExecutionEvents = new Map()
        this.requestCodexRateLimitEvents = new Map()
        this.requestWatchEvents = new Map()
        this.requestWorktreeEvents = new Map()
        this.runAgentEvents = new Map()
        this.socket = null
        this.token = ''
        this.watchCallbacks = new Map()
        this.worktreeCallbacks = new Map()
    }

    init(settings: Partial<RemoteControlConnectionSettings> = {}) {
        const storedSettings = settings.endpoint && settings.token
            ? settings as RemoteControlConnectionSettings
            : readRemoteControlConnection()
        this.endpoint = storedSettings.endpoint
        this.token = storedSettings.token
    }

    async connect(): Promise<void> {
        await this.ensureConnected()
    }

    disconnect() {
        this.socket?.close()
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

    async createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference> {
        return this.request<ProjectReference>('createProject', [project, workingFolder])
    }

    async deleteFile(request: DeleteFileRequest): Promise<void> {
        await this.request('deleteFile', [request])
        this.pendingPushBranches.add(request.branch)
    }

    async deleteFolder(request: DeleteFolderRequest): Promise<void> {
        await this.request('deleteFolder', [request])
        this.pendingPushBranches.add(request.branch)
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

    async listAgentConversationReferences(project: ProjectReference, projectFolder: string): Promise<string[]> {
        return this.request<string[]>('listAgentConversationReferences', [project, projectFolder])
    }

    async loadProjectAsset(_project: ProjectReference, path: string): Promise<ProjectAsset> {
        return this.request<ProjectAsset>('loadProjectAsset', [path])
    }

    async loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        return this.request<StorageProjectFiles>('loadProject', [project, workingFolder])
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

    async removeWorktree(project: ProjectReference, folderPath: string): Promise<void> {
        await this.request('removeWorktree', [project, folderPath])
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

    async integrateWorktree(request: IntegrateWorktreeRequest): Promise<void> {
        await this.request('integrateWorktree', [request])
        this.pendingPushBranches.add(request.project.branch)
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

    async rebaseWorktree(request: WorktreeOperationRequest): Promise<void> {
        await this.request('rebaseWorktree', [request])
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

    watchProject(project: ProjectReference, onChange: (event: ProjectWatchEvent) => void): () => void {
        const id = this.createRequestId()
        let subscriptionId: string | null = null
        this.requestWatchEvents.set(id, onChange)
        void this.sendRequest<{ subscriptionId: string }>({ id, method: 'watchProject', params: [project] }).then((result) => {
            subscriptionId = result.subscriptionId
            this.watchCallbacks.set(result.subscriptionId, onChange)
            this.requestWatchEvents.delete(id)
        })

        return () => {
            this.requestWatchEvents.delete(id)
            if (!subscriptionId) return

            this.watchCallbacks.delete(subscriptionId)
            void this.request('unsubscribe', [subscriptionId])
        }
    }

    onWorktreesChanged(callback: (state: WorktreeState) => void): () => void {
        const id = this.createRequestId()
        let cancelled = false
        let subscriptionId: string | null = null
        this.requestWorktreeEvents.set(id, callback)
        void this.sendRequest<{ subscriptionId: string }>({ id, method: 'onWorktreesChanged', params: [] }).then((result) => {
            subscriptionId = result.subscriptionId
            if (cancelled) {
                void this.request('unsubscribe', [subscriptionId])
                return
            }

            this.worktreeCallbacks.set(result.subscriptionId, callback)
            this.requestWorktreeEvents.delete(id)
        })

        return () => {
            cancelled = true
            this.requestWorktreeEvents.delete(id)
            if (!subscriptionId) return

            this.worktreeCallbacks.delete(subscriptionId)
            void this.request('unsubscribe', [subscriptionId])
        }
    }

    async cancelActionExecution(executionId: string): Promise<void> {
        await this.request('cancelActionExecution', [executionId])
    }

    async sendActionMessage(executionId: string, content: string): Promise<void> {
        await this.request('sendActionMessage', [executionId, content])
    }

    async beginActionPromptDraft(executionId: string): Promise<number> {
        return this.request('beginActionPromptDraft', [executionId])
    }

    async sendActionQueuedMessage(executionId: string, sessionId: number, revision: number): Promise<{ sent: true }> {
        return this.request('sendActionQueuedMessage', [executionId, sessionId, revision])
    }

    async setActionQueuedMessage(
        executionId: string,
        sessionId: number,
        content: string,
        revision: number,
    ): Promise<{ accepted: boolean }> {
        return this.request('setActionQueuedMessage', [executionId, sessionId, content, revision])
    }

    async answerActionQuestion(
        executionId: string,
        requestId: number | string | null,
        answers: Record<string, string[]>,
    ): Promise<void> {
        await this.request('answerActionQuestion', [executionId, requestId, answers])
    }

    async answerActionApproval(
        executionId: string,
        requestId: AgentApprovalRequestId,
        decision: AgentApprovalDecision,
    ): Promise<void> {
        await this.request('answerActionApproval', [executionId, requestId, decision])
    }

    async finishActionExecution(executionId: string): Promise<void> {
        await this.request('finishActionExecution', [executionId])
    }

    async generateDiff(request: DiffRequest): Promise<DiffResult> {
        return this.request<DiffResult>('generateDiff', [request])
    }

    async loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]> {
        return this.request<ActionRunHistoryEntry[]>('loadActionRunHistory', [request])
    }

    async loadActiveActionExecutionEvents(): Promise<ActionExecutionEvent[]> {
        return this.request<ActionExecutionEvent[]>('loadActiveActionExecutionEvents', [])
    }

    async getCodexRateLimits(): Promise<CodexRateLimitSnapshot | null> {
        return this.request<CodexRateLimitSnapshot | null>('getCodexRateLimits', [])
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

    onActionExecution(callback: (event: ActionExecutionEvent) => void): () => void {
        this.actionExecutionListeners.add(callback)
        void this.subscribeActionExecution(callback, false).catch(() => undefined)

        return () => {
            this.actionExecutionListeners.delete(callback)
            for (const [requestId, pendingCallback] of this.requestActionExecutionEvents) {
                if (pendingCallback === callback) this.requestActionExecutionEvents.delete(requestId)
            }
            const subscriptionId = this.actionExecutionSubscriptions.get(callback)
            if (!subscriptionId) return

            this.actionExecutionSubscriptions.delete(callback)
            this.actionExecutionCallbacks.delete(subscriptionId)
            void this.request('unsubscribe', [subscriptionId])
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
            void this.request('unsubscribe', [subscriptionId])
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
            this.pending.set(request.id, { reject, resolve: resolve as (value: unknown) => void })
            this.requireSocket().send(JSON.stringify(request))
        })
    }

    private createRequestId() {
        const id = `remote-${this.nextId}`
        this.nextId += 1

        return id
    }

    private async ensureConnected() {
        if (this.socket?.readyState === SOCKET_OPEN_STATE) return
        if (this.connectPromise) return this.connectPromise

        this.socket = new WebSocket(this.endpoint, this.token)
        this.socket.addEventListener('message', (event) => this.handleMessage(event))
        this.socket.addEventListener('close', () => this.handleClose())
        this.socket.addEventListener('error', () => this.handleClose())
        this.connectPromise = new Promise((resolve, reject) => {
            const handleOpen = () => {
                this.connectPromise = null
                resolve()
                for (const listener of this.connectionListeners) listener(true)
                void this.restoreActionExecutionSubscriptions()
                void this.restoreCodexRateLimitSubscriptions()
            }
            const handleError = () => {
                this.connectPromise = null
                reject(new Error('Remote-control connection failed'))
            }

            this.requireSocket().addEventListener('open', handleOpen, { once: true })
            this.requireSocket().addEventListener('error', handleError, { once: true })
        })

        return this.connectPromise
    }

    private handleMessage(event: MessageEvent) {
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
            pending.reject(new Error(response.error.message))
            return
        }

        pending.resolve(response.result)
    }

    private handleEvent(message: RemoteControlEvent) {
        if (message.event === 'actionExecution') {
            this.handleActionExecutionEvent(message.payload as ActionExecutionPayload)
            return
        }
        if (message.event === 'codexRateLimits') {
            this.handleCodexRateLimitsEvent(message.payload as CodexRateLimitsPayload)
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

        if (message.event === 'agentRun') this.handleAgentRunEvent(message.payload as AgentRunPayload)
    }

    private handleActionExecutionEvent(payload: ActionExecutionPayload) {
        const callback = this.actionExecutionCallbacks.get(payload.subscriptionId)
            ?? this.requestActionExecutionEvents.get(payload.requestId)
        callback?.(payload.event)
    }

    private handleCodexRateLimitsEvent(payload: CodexRateLimitsPayload) {
        const callback = this.codexRateLimitCallbacks.get(payload.subscriptionId)
            ?? this.requestCodexRateLimitEvents.get(payload.requestId)
        callback?.(payload.snapshot)
    }

    private async restoreActionExecutionSubscriptions() {
        const pendingCallbacks = new Set(this.requestActionExecutionEvents.values())
        const callbacks = [...this.actionExecutionListeners].filter((callback) => !pendingCallbacks.has(callback))
        await Promise.allSettled(callbacks.map((callback) => this.subscribeActionExecution(callback, true)))
    }

    private async subscribeActionExecution(callback: (event: ActionExecutionEvent) => void, recover: boolean) {
        const id = this.createRequestId()
        this.requestActionExecutionEvents.set(id, callback)
        try {
            const result = await this.sendRequest<{ subscriptionId: string }>({
                id,
                method: 'onActionExecution',
                params: [],
            })
            if (!this.actionExecutionListeners.has(callback)) {
                await this.request('unsubscribe', [result.subscriptionId])
                return
            }
            this.actionExecutionSubscriptions.set(callback, result.subscriptionId)
            this.actionExecutionCallbacks.set(result.subscriptionId, callback)
            if (!recover) return
            const events = await this.loadActiveActionExecutionEvents()
            for (const event of events) callback(event)
        } finally {
            this.requestActionExecutionEvents.delete(id)
        }
    }

    private async restoreCodexRateLimitSubscriptions() {
        const pendingCallbacks = new Set(this.requestCodexRateLimitEvents.values())
        const callbacks = [...this.codexRateLimitListeners].filter((callback) => !pendingCallbacks.has(callback))
        await Promise.allSettled(callbacks.map((callback) => this.subscribeCodexRateLimits(callback)))
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
                await this.request('unsubscribe', [result.subscriptionId])
                return
            }
            this.codexRateLimitSubscriptions.set(callback, result.subscriptionId)
            this.codexRateLimitCallbacks.set(result.subscriptionId, callback)
        } finally {
            this.requestCodexRateLimitEvents.delete(id)
        }
    }

    private handleWatchProjectEvent(payload: WatchProjectPayload) {
        const callback = this.watchCallbacks.get(payload.subscriptionId) ?? this.requestWatchEvents.get(payload.requestId)
        callback?.(payload.event)
    }

    private handleWorktreesChangedEvent(payload: WorktreesChangedPayload) {
        const callback = this.worktreeCallbacks.get(payload.subscriptionId) ?? this.requestWorktreeEvents.get(payload.requestId)
        callback?.(payload.state)
    }

    private handleAgentRunEvent(payload: AgentRunPayload) {
        const callback = this.requestAgentEvents.get(payload.requestId) ?? this.runAgentEvents.get(payload.event.runId)
        callback?.(payload.event)
        if (payload.event.type === 'closed') this.runAgentEvents.delete(payload.event.runId)
    }

    private handleClose() {
        const error = new Error('Remote-control connection closed')
        for (const listener of this.connectionListeners) listener(false)
        for (const pending of this.pending.values()) pending.reject(error)
        this.pending.clear()
        this.actionExecutionCallbacks.clear()
        this.actionExecutionSubscriptions.clear()
        this.codexRateLimitCallbacks.clear()
        this.codexRateLimitSubscriptions.clear()
        this.requestAgentEvents.clear()
        this.requestActionExecutionEvents.clear()
        this.requestCodexRateLimitEvents.clear()
        this.requestWatchEvents.clear()
        this.requestWorktreeEvents.clear()
        this.runAgentEvents.clear()
        this.watchCallbacks.clear()
        this.worktreeCallbacks.clear()
        this.connectPromise = null
        this.socket = null
    }

    private requireSocket() {
        if (!this.socket) throw new Error('Remote-control socket is not connected')

        return this.socket
    }
}
