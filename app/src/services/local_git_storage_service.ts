import type {
    BranchReference,
    CommitRequest,
    ProjectConfig,
    ProjectReference,
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

    watchProject(project: ProjectReference, onChange: () => void) {
        return this.requireBridge().watchProject(project, onChange)
    }

    private requireBridge() {
        if (!this.bridge) throw new Error('Local Git storage bridge is not initialized')

        return this.bridge
    }
}
