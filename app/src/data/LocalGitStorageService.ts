import type { BranchReference, CommitRequest, ProjectReference, StorageProjectFiles, StorageService } from './dataTypes'
import { getElectronDataBridge, type ElectronDataBridge } from './electronDataBridge'

interface LocalGitStorageDependencies {
    bridge?: ElectronDataBridge
}

export class LocalGitStorageService implements StorageService {
    private readonly bridge: ElectronDataBridge

    constructor(dependencies: LocalGitStorageDependencies = {}) {
        const bridge = dependencies.bridge ?? getElectronDataBridge()

        if (!bridge) throw new Error('Electron local Git bridge is not available')

        this.bridge = bridge
    }

    async openProjectFolder() {
        return this.bridge.openProjectFolder()
    }

    async createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference> {
        return this.bridge.createProject(project, workingFolder)
    }

    async loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        return this.bridge.loadProject(project, workingFolder)
    }

    async listBranches(project: ProjectReference): Promise<BranchReference[]> {
        return this.bridge.listBranches(project)
    }

    async checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference> {
        return this.bridge.checkoutBranch(project, branch)
    }

    async commit(request: CommitRequest): Promise<void> {
        await this.bridge.commit(request)
    }

    async push(project: ProjectReference): Promise<void> {
        await this.bridge.push(project)
    }

    watchProject(project: ProjectReference, onChange: () => void) {
        return this.bridge.watchProject(project, onChange)
    }
}
