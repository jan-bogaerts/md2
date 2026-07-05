import type { ActionFile } from './action_types'
import type { BranchReference, CommitRequest, ProjectConfig, ProjectReference, ProjectWatchEvent, StorageProjectFiles } from './data_types'

export interface ElectronDataBridge {
    checkoutBranch(project: ProjectReference, branch: string): Promise<ProjectReference>
    commit(request: CommitRequest): Promise<void>
    createProject(project: ProjectReference, workingFolder: string): Promise<ProjectReference>
    loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]>
    loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles>
    loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null>
    listBranches(project: ProjectReference): Promise<BranchReference[]>
    openProjectFolder(): Promise<ProjectReference | null>
    push(project: ProjectReference): Promise<void>
    saveProjectConfig(project: ProjectReference, config: ProjectConfig): Promise<void>
    watchProject(project: ProjectReference, callback: (event: ProjectWatchEvent) => void): () => void
}

declare global {
    interface Window {
        md2Data?: ElectronDataBridge
    }
}

export function getElectronDataBridge() {
    return window.md2Data ?? null
}
