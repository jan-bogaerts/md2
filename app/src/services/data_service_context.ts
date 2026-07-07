import type { CommitBatcher } from '../data/commit_batcher'
import type {
    AgentConversation,
    AgentConversationError,
    MarkdownFile,
    ProjectConfig,
    ProjectReference,
    ProjectSnapshot,
    StorageService,
} from '../data/data_types'
import type { RemarkableBridge } from '../data/remarkable_bridge'
import { configService } from './config_service'
import { telemetryService } from './telemetry_service'

export const WORKSPACE_ERROR_EVENT = 'md2:workspace-error'
export const WORKSPACE_NOTICE_EVENT = 'md2:workspace-notice'

export interface DataServiceDependencies {
    remarkableBridge?: RemarkableBridge
    storage: StorageService
}

export interface RequiredDataServiceDependencies {
    commitBatcher: CommitBatcher
    config: ProjectConfig
    storage: StorageService
}

export interface DataServiceContext {
    getAgentConversationLoadToken(): number
    getConversationsByCardPath(): Map<string, AgentConversation[]>
    getCurrentFiles(): MarkdownFile[]
    getCurrentProject(): ProjectReference | null
    getCurrentSnapshot(): ProjectSnapshot | null
    getErrorsByCardPath(): Map<string, AgentConversationError[]>
    getInFlightCommitPaths(): Set<string>
    getProjectLoadToken(): number
    getStorage(): StorageService | null
    createSnapshot(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]): ProjectSnapshot
    increaseAgentConversationLoadToken(): number
    increaseProjectLoadToken(): number
    refreshSnapshot(): void
    reloadCurrentProjectSnapshot(): Promise<ProjectSnapshot | null>
    requireDependencies(): RequiredDataServiceDependencies
    requireFile(path: string): MarkdownFile
    resetAgentConversations(): void
    setConversationsByCardPath(conversationsByCardPath: Map<string, AgentConversation[]>): void
    setCurrentFiles(files: MarkdownFile[]): void
    setCurrentProject(project: ProjectReference | null): void
    setCurrentSnapshot(snapshot: ProjectSnapshot | null): void
    setErrorsByCardPath(errorsByCardPath: Map<string, AgentConversationError[]>): void
    dispatchChanged(): void
}

export function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export function reportWorkspaceError(message: string) {
    window.dispatchEvent(new CustomEvent<string>(WORKSPACE_ERROR_EVENT, { detail: message }))
}

export function reportWorkspaceNotice(message: string) {
    window.dispatchEvent(new CustomEvent<string>(WORKSPACE_NOTICE_EVENT, { detail: message }))
}

/** Merge committed files into loaded files: replace matching paths, append new paths. */
export function mergeFiles(current: MarkdownFile[], updates: MarkdownFile[]): MarkdownFile[] {
    const updateByPath = new Map(updates.map((file) => [file.path, file]))
    const merged = current.map((file) => updateByPath.get(file.path) ?? file)
    const existingPaths = new Set(current.map((file) => file.path))
    for (const file of updates) {
        if (!existingPaths.has(file.path)) merged.push(file)
    }

    return merged
}

export function removeFilesByPath(files: MarkdownFile[], paths: string[]) {
    const pathSet = new Set(paths)

    return files.filter((file) => !pathSet.has(file.path))
}

export function reportCommitFlushFailure(error: unknown, dispatchChanged: () => void) {
    reportWorkspaceError(errorMessage(error, 'Commit failed'))
    telemetryService.captureError(error)
    dispatchChanged()
}

export function getProjectConfigOrNull(storage: StorageService | null): ProjectConfig | null {
    if (!storage) return null

    return configService.getProjectConfig()
}
