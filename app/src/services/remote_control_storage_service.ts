import type { ActionFile } from '../data/action_types'
import type { ActionExecutionEvent, ActionStartRequest } from '../data/action_run_types'
import type { ActionSchedule } from '../data/action_schedule_types'
import type {
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    DiffRequest,
    DiffResult,
    ElectronActionBridge,
    OpenInEditorRequest,
} from '../data/electron_action_bridge'
import type {
    AgentConversation,
    AgentRunEvent,
    BranchReference,
    CommitRequest,
    CommitResult,
    DeleteFileRequest,
    DeleteFolderRequest,
    MoveFilesRequest,
    ProjectAsset,
    ProjectConfig,
    ProjectReference,
    ProjectWatchEvent,
    RepositoryReference,
    StartAgentConversationRequest,
    StartAgentConversationResult,
    StorageProjectFiles,
    StorageService,
    TopLevelFolderReference,
} from '../data/data_types'
import { readRemoteControlConnection, type RemoteControlConnectionSettings } from '../data/remote_control_connection'

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

const SOCKET_OPEN_STATE = 1

function isResponse(message: RemoteControlResponse | RemoteControlEvent): message is RemoteControlResponse {
    return 'id' in message
}

export class RemoteControlStorageService implements StorageService, ElectronActionBridge {
    private actionExecutionCallbacks: Map<string, (event: ActionExecutionEvent) => void>
    private connectPromise: Promise<void> | null
    private endpoint: string
    private nextId: number
    private readonly pendingPushBranches: Set<string>
    private pending: Map<string, PendingRequest>
    private requestAgentEvents: Map<string, (event: AgentRunEvent) => void>
    private requestActionExecutionEvents: Map<string, (event: ActionExecutionEvent) => void>
    private requestWatchEvents: Map<string, (event: ProjectWatchEvent) => void>
    private runAgentEvents: Map<string, (event: AgentRunEvent) => void>
    private socket: WebSocket | null
    private token: string
    private watchCallbacks: Map<string, (event: ProjectWatchEvent) => void>

    constructor() {
        this.actionExecutionCallbacks = new Map()
        this.connectPromise = null
        this.endpoint = ''
        this.nextId = 1
        this.pendingPushBranches = new Set()
        this.pending = new Map()
        this.requestAgentEvents = new Map()
        this.requestActionExecutionEvents = new Map()
        this.requestWatchEvents = new Map()
        this.runAgentEvents = new Map()
        this.socket = null
        this.token = ''
        this.watchCallbacks = new Map()
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

    async createWorkingFolderFromTemplate(project: ProjectReference, workingFolder: string): Promise<ProjectReference> {
        return this.request<ProjectReference>('createWorkingFolderFromTemplate', [project, workingFolder])
    }

    async deleteFile(request: DeleteFileRequest): Promise<void> {
        await this.request('deleteFile', [request])
        this.pendingPushBranches.add(request.branch)
    }

    async deleteFolder(request: DeleteFolderRequest): Promise<void> {
        await this.request('deleteFolder', [request])
        this.pendingPushBranches.add(request.branch)
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

    async loadPendingPush(project: ProjectReference) {
        const hasPendingPush = await this.request<boolean>('hasPendingPush', [project])
        if (hasPendingPush) this.pendingPushBranches.add(project.branch)
        else this.pendingPushBranches.delete(project.branch)
    }

    async moveFiles(request: MoveFilesRequest): Promise<void> {
        await this.request('moveFiles', [request])
        this.pendingPushBranches.add(request.branch)
    }

    async push(project: ProjectReference): Promise<void> {
        await this.request('push', [project])
        this.pendingPushBranches.delete(project.branch)
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

    async sendAgentInput(_project: ProjectReference, runId: string, input: string): Promise<void> {
        await this.request('sendAgentInput', [runId, input])
    }

    async startAgentConversation(
        _project: ProjectReference,
        request: StartAgentConversationRequest,
        onEvent: (event: AgentRunEvent) => void,
    ): Promise<StartAgentConversationResult> {
        return this.requestWithAgentEvents<StartAgentConversationResult>('startAgentConversation', [request], onEvent)
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

    async cancelActionExecution(executionId: string): Promise<void> {
        await this.request('cancelActionExecution', [executionId])
    }

    async generateDiff(request: DiffRequest): Promise<DiffResult> {
        return this.request<DiffResult>('generateDiff', [request])
    }

    async loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]> {
        return this.request<ActionRunHistoryEntry[]>('loadActionRunHistory', [request])
    }

    onActionExecution(callback: (event: ActionExecutionEvent) => void): () => void {
        const id = this.createRequestId()
        let subscriptionId: string | null = null
        this.requestActionExecutionEvents.set(id, callback)
        void this.sendRequest<{ subscriptionId: string }>({ id, method: 'onActionExecution', params: [] }).then((result) => {
            subscriptionId = result.subscriptionId
            this.actionExecutionCallbacks.set(result.subscriptionId, callback)
            this.requestActionExecutionEvents.delete(id)
        })

        return () => {
            this.requestActionExecutionEvents.delete(id)
            if (!subscriptionId) return

            this.actionExecutionCallbacks.delete(subscriptionId)
            void this.request('unsubscribe', [subscriptionId])
        }
    }

    async openInEditor(request: OpenInEditorRequest): Promise<void> {
        await this.request('openInEditor', [request])
    }

    async runSearchRegexpAgent(input: string, callback?: (event: AgentRunEvent) => void): Promise<string> {
        return this.requestWithAgentEvents<string>('runSearchRegexpAgent', [input], callback)
    }

    async sendActionInput(executionId: string, input: string): Promise<void> {
        await this.request('sendActionInput', [executionId, input])
    }

    async startAction(request: ActionStartRequest): Promise<string> {
        return this.request<string>('startAction', [request])
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
        if (message.event === 'watchProject') {
            this.handleWatchProjectEvent(message.payload as WatchProjectPayload)
            return
        }

        if (message.event === 'agentRun') this.handleAgentRunEvent(message.payload as AgentRunPayload)
    }

    private handleActionExecutionEvent(payload: ActionExecutionPayload) {
        const callback = this.actionExecutionCallbacks.get(payload.subscriptionId)
            ?? this.requestActionExecutionEvents.get(payload.requestId)
        callback?.(payload.event)
    }

    private handleWatchProjectEvent(payload: WatchProjectPayload) {
        const callback = this.watchCallbacks.get(payload.subscriptionId) ?? this.requestWatchEvents.get(payload.requestId)
        callback?.(payload.event)
    }

    private handleAgentRunEvent(payload: AgentRunPayload) {
        const callback = this.requestAgentEvents.get(payload.requestId) ?? this.runAgentEvents.get(payload.event.runId)
        callback?.(payload.event)
        if (payload.event.type === 'closed') this.runAgentEvents.delete(payload.event.runId)
    }

    private handleClose() {
        const error = new Error('Remote-control connection closed')
        for (const pending of this.pending.values()) pending.reject(error)
        this.pending.clear()
        this.actionExecutionCallbacks.clear()
        this.requestAgentEvents.clear()
        this.requestActionExecutionEvents.clear()
        this.requestWatchEvents.clear()
        this.runAgentEvents.clear()
        this.watchCallbacks.clear()
        this.connectPromise = null
        this.socket = null
    }

    private requireSocket() {
        if (!this.socket) throw new Error('Remote-control socket is not connected')

        return this.socket
    }
}
