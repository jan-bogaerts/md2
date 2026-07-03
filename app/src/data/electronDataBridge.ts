import type { BranchReference, CommitRequest, ProjectReference, StorageProjectFiles } from './dataTypes'

export interface ElectronDataBridge {
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<void>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    openProjectFolder(): Promise<ProjectReference | null>
    push(project: ProjectReference): Promise<void>
    watchProject(project: ProjectReference, callback: () => void): () => void
}

declare global {
    interface Window {
        md2Data?: ElectronDataBridge
    }
}

export function getElectronDataBridge() {
    return window.md2Data ?? null
}
