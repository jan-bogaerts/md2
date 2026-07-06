import type { ActionFile } from '../data/action_types'
import type {
    BranchReference,
    CommitRequest,
    ContinueAgentConversationRequest,
    ContinueAgentConversationResult,
    AgentConversation,
    AgentRunEvent,
    ProjectConfig,
    ProjectReference,
    ProjectWatchEvent,
    StartAgentConversationRequest,
    StartAgentConversationResult,
    StorageProjectFiles,
    StorageService,
} from '../data/data_types'
import { getElectronDataBridge, type ElectronDataBridge } from '../data/electron_data_bridge'

interface LocalGitStorageDependencies {
    bridge?: ElectronDataBridge
}

export class LocalGitStorageService implements StorageService {
    private bridge: ElectronDataBridge | null

    constructor() {
        this.bridge = null
    }

    init(dependencies: LocalGitStorageDependencies = {}) {
        const bridge = dependencies.bridge ?? getElectronDataBridge()

        if (!bridge) throw new Error('Electron local Git bridge is not available')

        this.bridge = bridge
    }

    async openProjectFolder() {
        return this.requireBridge().openProjectFolder()
    }

    async createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference> {
        return this.requireBridge().createProject(project, workingFolder)
    }

    async loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        return this.requireBridge().loadProject(project, workingFolder)
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]> {
        return this.requireBridge().loadActionFiles(project, actionsFolder)
    }

    async loadAgentConversation(_project: ProjectReference, path: string): Promise<AgentConversation> {
        const bridge = this.requireBridge()
        if (!bridge.loadAgentConversation) throw new Error('Electron local Git bridge cannot load agent conversations')

        return bridge.loadAgentConversation(path)
    }

    async continueAgentConversation(
        _project: ProjectReference,
        request: ContinueAgentConversationRequest,
    ): Promise<ContinueAgentConversationResult> {
        const bridge = this.requireBridge()
        if (!bridge.continueAgentConversation) throw new Error('Electron local Git bridge cannot continue agent conversations')

        return bridge.continueAgentConversation(request)
    }

    async startAgentConversation(
        _project: ProjectReference,
        request: StartAgentConversationRequest,
        onEvent: (event: AgentRunEvent) => void,
    ): Promise<StartAgentConversationResult> {
        const bridge = this.requireBridge()
        if (!bridge.startAgentConversation) throw new Error('Electron local Git bridge cannot start agent conversations')

        return bridge.startAgentConversation(request, onEvent)
    }

    async sendAgentInput(_project: ProjectReference, runId: string, input: string): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.sendAgentInput) throw new Error('Electron local Git bridge cannot send agent input')

        await bridge.sendAgentInput(runId, input)
    }

    async stopAgent(_project: ProjectReference, runId: string): Promise<void> {
        const bridge = this.requireBridge()
        if (!bridge.stopAgent) throw new Error('Electron local Git bridge cannot stop agents')

        await bridge.stopAgent(runId)
    }

    async loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null> {
        return this.requireBridge().loadProjectConfig(project)
    }

    async listBranches(project: ProjectReference): Promise<BranchReference[]> {
        return this.requireBridge().listBranches(project)
    }

    async checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference> {
        return this.requireBridge().checkoutBranch(project, branch)
    }

    async commit(request: CommitRequest): Promise<void> {
        await this.requireBridge().commit(request)
    }

    async push(project: ProjectReference): Promise<void> {
        await this.requireBridge().push(project)
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void> {
        await this.requireBridge().saveProjectConfig(project, config)
    }

    watchProject(project: ProjectReference, onChange: (event: ProjectWatchEvent) => void) {
        return this.requireBridge().watchProject(project, onChange)
    }

    private requireBridge() {
        if (!this.bridge) throw new Error('Local Git storage bridge is not initialized')

        return this.bridge
    }
}
