import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { parseActivityFile } from '../../../../shared/card_activity.mjs'
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
        const activityFile = await storage.loadTextFile(project, activityPath)
        const usage = legacyActivityUsage(parseActivityFile(activityFile.content))
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
    private refreshPromise: Promise<void> | null = null
    private summary: AgentTokenUsageSummary | null = null

    getSnapshot = () => this.summary

    subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    clear() {
        this.loadedProject = null
        this.refreshPromise = null
        this.setSummary(null)
    }

    async load(project: ProjectReference, config: ProjectConfig, storage: StorageService) {
        this.loadedProject = { config, project, storage }
        const summaryPath = agentTokenUsageFilePath(config.projectFolder)
        if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')
        let summaryFile
        try {
            summaryFile = await storage.loadTextFile(project, summaryPath)
        } catch (loadError) {
            const repositoryFiles = await storage.listRepositoryFiles(project)
            if (repositoryFiles.includes(summaryPath)) throw loadError

            const summary = await migrateProjectSummary(project, config, storage, repositoryFiles)
            await storage.commit({
                branch: project.branch,
                files: [{ content: serializeAgentTokenUsageSummary(summary), path: summaryPath }],
                message: 'Add project agent token usage summary',
            })
            if (config.pushMode === 'auto') await storage.push(project)
            this.setSummary(summary)
            return
        }
        this.setSummary(parseAgentTokenUsageSummary(summaryFile.content))
    }

    async refresh(): Promise<void> {
        if (!this.loadedProject) return
        if (this.refreshPromise) {
            await this.refreshPromise
            return this.refresh()
        }

        const refresh = this.loadStoredSummary(this.loadedProject)
        this.refreshPromise = refresh
        try {
            await refresh
        } finally {
            this.refreshPromise = null
        }
    }

    handleRepositoryChange(event: ProjectWatchEvent) {
        if (!this.loadedProject) return
        const summaryPath = agentTokenUsageFilePath(this.loadedProject.config.projectFolder)
        if (event.path.replace(/\\/gu, '/') !== summaryPath) return

        void this.refresh()
    }

    private async loadStoredSummary({ config, project, storage }: LoadedProjectUsage) {
        if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')
        const summaryFile = await storage.loadTextFile(project, agentTokenUsageFilePath(config.projectFolder))
        this.setSummary(parseAgentTokenUsageSummary(summaryFile.content))
    }

    private setSummary(summary: AgentTokenUsageSummary | null) {
        if (this.summary === summary) return
        this.summary = summary
        this.dispatchEvent(new Event('changed'))
    }
}

export const projectAgentTokenUsageService = new ProjectAgentTokenUsageService()
