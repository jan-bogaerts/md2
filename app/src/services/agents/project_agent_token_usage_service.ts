import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { parseActivityFileForMigration } from '../../../../shared/card_activity.mjs'
import {
    addSummaryUsage,
    agentTokenUsageFilePath,
    createAgentTokenUsageSummary,
    emptySummaryUsage,
    legacySummaryUsage,
    parseAgentTokenUsageSummary,
    serializeAgentTokenUsageSummary,
    type AgentTokenUsageSummary,
} from '../../../../shared/agent_token_usage_summary.mjs'
import type { ProjectConfig, ProjectReference, ProjectWatchEvent, StorageService } from '../../data/data_types'

const CARD_ACTIVITY_FILE = /(?:^|\/)card__[^/]+\.json$/u

interface LoadedProjectUsage {
    config: ProjectConfig
    project: ProjectReference
    reportFailure: (error: unknown) => void
    storage: StorageService
}

function releaseNameForActivity(activityPath: string, releasesFolder: string) {
    const normalizedActivityPath = activityPath.replace(/\\/gu, '/')
    const normalizedReleasesFolder = releasesFolder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    const prefix = `${normalizedReleasesFolder}/`
    if (!normalizedActivityPath.startsWith(prefix)) return null
    const releaseName = normalizedActivityPath.slice(prefix.length).split('/')[0]

    return releaseName.length > 0 ? releaseName : null
}

function legacyActivityUsage(activity: CardActivityFile) {
    const hasCost = activity.conversations.some((conversation) => conversation.usage?.costUsd !== undefined)
    const costUsd = activity.conversations.reduce((total, conversation) => total + (conversation.usage?.costUsd ?? 0), 0)
    const totalTokens = activity.conversations.reduce((total, conversation) => total + (conversation.usage?.totalTokens ?? 0), 0)

    return legacySummaryUsage(totalTokens, hasCost ? costUsd : undefined)
}

export function createProjectAgentTokenUsageFile(projectFolder: string) {
    return {
        content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()),
        path: agentTokenUsageFilePath(projectFolder),
    }
}

// TEMPORARY: Internal migration only. Remove after existing internal projects have generated their summary file.
async function migrateProjectSummary(
    project: ProjectReference,
    config: ProjectConfig,
    storage: StorageService,
    repositoryFiles: string[],
) {
    if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')
    const activityPaths = repositoryFiles.filter((path) => CARD_ACTIVITY_FILE.test(path.replace(/\\/gu, '/')))
    const projectUsages = []
    const releaseUsages = new Map<string, ReturnType<typeof emptySummaryUsage>[]>()
    for (const activityPath of activityPaths) {
        let usage
        try {
            const activityFile = await storage.loadTextFile(project, activityPath)
            usage = legacyActivityUsage(parseActivityFileForMigration(activityFile.content))
        } catch {
            continue
        }
        projectUsages.push(usage)
        const releaseName = releaseNameForActivity(activityPath, config.releasesFolder)
        if (!releaseName) continue
        releaseUsages.set(releaseName, [...(releaseUsages.get(releaseName) ?? []), usage])
    }
    const releases = Object.fromEntries(
        [...releaseUsages.entries()].map(([name, usages]) => [name, addSummaryUsage(usages)]),
    )

    return createAgentTokenUsageSummary(addSummaryUsage(projectUsages), releases)
}

export class ProjectAgentTokenUsageService extends EventTarget {
    private loadedProject: LoadedProjectUsage | null = null
    private operationPromise: Promise<void> | null = null
    private pendingRepositoryChange: ProjectWatchEvent['changeKind'] | null = null
    private repositoryChangeInProgress: ProjectWatchEvent['changeKind'] | null = null
    private repositoryRefreshProject: LoadedProjectUsage | null = null
    private repositoryRefreshPromise: Promise<void> | null = null
    private summary: AgentTokenUsageSummary | null = null

    getSnapshot = () => this.summary

    subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    clear() {
        this.loadedProject = null
        this.pendingRepositoryChange = null
        this.setSummary(null)
    }

    async load(
        project: ProjectReference,
        config: ProjectConfig,
        storage: StorageService,
        reportFailure: (error: unknown) => void,
    ) {
        const loadedProject = { config, project, reportFailure, storage }
        this.loadedProject = loadedProject
        this.pendingRepositoryChange = null

        await this.enqueueOperation(loadedProject, () => this.loadOrMigrateSummary(loadedProject))
    }

    async refresh(): Promise<void> {
        const loadedProject = this.loadedProject
        if (!loadedProject) return

        await this.enqueueOperation(loadedProject, () => this.loadOrMigrateSummary(loadedProject))
    }

    handleRepositoryChange(event: ProjectWatchEvent) {
        if (!this.loadedProject) return
        const summaryPath = agentTokenUsageFilePath(this.loadedProject.config.projectFolder)
        if (event.path.replace(/\\/gu, '/') !== summaryPath) return
        if (event.changeKind === 'removed'
            && this.repositoryChangeInProgress === 'removed'
            && this.repositoryRefreshProject === this.loadedProject) return

        this.pendingRepositoryChange = event.changeKind
        if (this.repositoryRefreshPromise && this.repositoryRefreshProject === this.loadedProject) return

        const loadedProject = this.loadedProject
        const refreshPromise = this.refreshFromRepositoryChanges(loadedProject)
        this.repositoryRefreshProject = loadedProject
        this.repositoryRefreshPromise = refreshPromise
        void this.handleRepositoryRefreshResult(loadedProject, refreshPromise)
    }

    private async handleRepositoryRefreshResult(
        loadedProject: LoadedProjectUsage,
        refreshPromise: Promise<void>,
    ) {
        try {
            await refreshPromise
        } catch (error) {
            if (this.isCurrentProject(loadedProject)) this.pendingRepositoryChange = null
            loadedProject.reportFailure(error)
        } finally {
            if (this.repositoryRefreshPromise === refreshPromise) {
                this.repositoryRefreshProject = null
                this.repositoryRefreshPromise = null
            }
        }
    }

    private async loadOrMigrateSummary(loadedProject: LoadedProjectUsage) {
        const { config, project, storage } = loadedProject
        const summaryPath = agentTokenUsageFilePath(config.projectFolder)
        const repositoryFiles = await storage.listRepositoryFiles(project)
        if (!this.isCurrentProject(loadedProject)) return
        if (repositoryFiles.includes(summaryPath)) {
            await this.loadStoredSummary(loadedProject)
            return
        }

        await this.migrateAndCommitSummary(loadedProject, repositoryFiles)
    }

    private async loadStoredSummary(loadedProject: LoadedProjectUsage) {
        const { config, project, storage } = loadedProject
        if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')
        const summaryPath = agentTokenUsageFilePath(config.projectFolder)
        try {
            const summaryFile = await storage.loadTextFile(project, summaryPath)
            const summary = parseAgentTokenUsageSummary(summaryFile.content)
            if (!this.isCurrentProject(loadedProject)) return

            this.setSummary(summary)
        } catch (error) {
            const currentRepositoryFiles = await storage.listRepositoryFiles(project)
            if (!this.isCurrentProject(loadedProject)) return
            if (currentRepositoryFiles.includes(summaryPath)) throw error

            await this.migrateAndCommitSummary(loadedProject, currentRepositoryFiles)
        }
    }

    private async migrateAndCommitSummary(loadedProject: LoadedProjectUsage, repositoryFiles: string[]) {
        const { config, project, storage } = loadedProject
        const summaryPath = agentTokenUsageFilePath(config.projectFolder)
        const summary = await migrateProjectSummary(project, config, storage, repositoryFiles)
        if (!this.isCurrentProject(loadedProject)) return
        await storage.commit({
            branch: project.branch,
            files: [{ content: serializeAgentTokenUsageSummary(summary), path: summaryPath }],
            message: 'Add project agent token usage summary',
        })
        if (config.pushMode === 'auto') await storage.push(project)
        if (!this.isCurrentProject(loadedProject)) return

        this.setSummary(summary)
    }

    private async enqueueOperation(loadedProject: LoadedProjectUsage, operation: () => Promise<void>) {
        while (this.operationPromise) {
            const activeOperation = this.operationPromise
            try {
                await activeOperation
            } catch {
                // A queued operation reports through its own caller. Continue with current work.
            }
            if (this.operationPromise === activeOperation) this.operationPromise = null
        }
        if (!this.isCurrentProject(loadedProject)) return

        const operationPromise = operation()
        this.operationPromise = operationPromise
        try {
            await operationPromise
        } finally {
            if (this.operationPromise === operationPromise) this.operationPromise = null
        }
    }

    private isCurrentProject(loadedProject: LoadedProjectUsage) {
        return this.loadedProject === loadedProject
    }

    private async refreshFromRepositoryChanges(loadedProject: LoadedProjectUsage) {
        while (this.isCurrentProject(loadedProject) && this.pendingRepositoryChange) {
            const changeKind = this.pendingRepositoryChange
            this.pendingRepositoryChange = null
            this.repositoryChangeInProgress = changeKind
            try {
                if (changeKind === 'removed') {
                    await this.enqueueOperation(loadedProject, () => this.loadOrMigrateSummary(loadedProject))
                    continue
                }

                await this.enqueueOperation(loadedProject, () => this.loadOrMigrateSummary(loadedProject))
            } finally {
                this.repositoryChangeInProgress = null
            }
        }
    }

    private setSummary(summary: AgentTokenUsageSummary | null) {
        if (this.summary === summary) return
        this.summary = summary
        this.dispatchEvent(new Event('changed'))
    }
}

export const projectAgentTokenUsageService = new ProjectAgentTokenUsageService()
