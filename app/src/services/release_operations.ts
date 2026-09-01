import {
    buildReleaseMoves,
    findArchiveAssetPaths,
    findReleaseActivityPaths,
    splitProjectActivity,
    validateReleaseName,
} from '../data/release_archiving'
import { statusOf } from '../data/card_ordering'
import { projectAccessService } from './project/project_access_service'
import type { MarkdownFile, MoveFile, ProjectAsset, ProjectReference, ProjectSnapshot, ReleaseBranchCandidate } from '../data/data_types'
import { type RequiredDataServiceDependencies } from './data/data_service_context'
import { markdownParsingService } from './data/markdown_parsing_service'
import { telemetryService } from './telemetry/telemetry_service'
import { projectAgentTokenUsageService } from './agents/project_agent_token_usage_service'
import { getElectronActionBridge, type ElectronActionBridge } from '../data/electron_action_bridge'
import { parseActivityFileForMigration } from '../../../shared/card_activity.mjs'
import {
    addSummaryUsage,
    agentTokenUsageFilePath,
    legacySummaryUsage,
    parseAgentTokenUsageSummary,
    parseSummaryUsage,
    serializeAgentTokenUsageSummary,
    type AgentSummaryUsage,
} from '../../../shared/agent_token_usage_summary.mjs'
import {
    calculateActivityStatsFromSources,
    parseProjectStatsFile,
    projectStatsFilePath,
    serializeProjectStats,
} from '../../../shared/project_stats.mjs'
import { activityFilePath, projectActivityFileName } from '../../../shared/activity_paths.mjs'
import { normalizePath } from '../../../shared/path_utils.mjs'
import { mergeStats } from './stats/project_stats_loader'
import { calculateActivityStatsOutsideMainThread } from './stats/project_stats_worker_client'

export interface ReleaseOperationsDeps {
    applyMoves(moves: MoveFile[], workingFolder: string): void
    dispatchChanged(): void
    resetAgentConversations(): void
    files(): MarkdownFile[]
    project(): ProjectReference | null
    requireDependencies(): RequiredDataServiceDependencies
    snapshot(): ProjectSnapshot | null
}

function requireNoAssignedWorktrees(releaseCards: ProjectSnapshot['activeCards']) {
    const assignedCardIds = releaseCards
        .filter((card) => card.header.worktree !== null && card.header.worktree !== undefined)
        .map((card) => card.header.id)
    if (assignedCardIds.length > 0) {
        throw new Error(`Cannot complete release. Unassign worktrees from cards: ${assignedCardIds.join(', ')}.`)
    }
}

/** Refuses a release while any agent run is in flight, whatever card or project it belongs to. */
async function requireNoRunningActions() {
    const bridge = getElectronActionBridge()
    if (!bridge?.listActiveActionRuns) return

    const activeRuns = await bridge.listActiveActionRuns()
    if (activeRuns.length === 0) return

    const labels = activeRuns.map(({ label }) => label).join(', ')
    throw new Error(`Cannot complete release while agent actions are running: ${labels}`)
}

interface ReleaseCardLock {
    bridge: ElectronActionBridge
    leaseId: string
}

async function acquireReleaseCardLock(
    releaseCards: ProjectSnapshot['activeCards'],
    project: ProjectReference,
): Promise<ReleaseCardLock | null> {
    if (!project.rootPath) return null
    const bridge = getElectronActionBridge()
    if (!bridge) return null
    if (!bridge.acquireReleaseCardLocks || !bridge.releaseReleaseCardLocks) {
        throw new Error('Release card locking is not available')
    }
    const cardInternalIds = releaseCards.map((card) => {
        if (!card.header.internalId) throw new Error(`Release card internal ID is missing: ${card.header.id}`)

        return card.header.internalId
    })
    const leaseId = await bridge.acquireReleaseCardLocks(cardInternalIds)

    return { bridge, leaseId }
}

async function releaseCardLock(lock: ReleaseCardLock | null) {
    if (!lock?.bridge.releaseReleaseCardLocks) return
    await lock.bridge.releaseReleaseCardLocks(lock.leaseId)
}

/** Matches the on-disk activity file layout written by the desktop activity writer. */
function serializeActivity(activity: ReturnType<typeof parseActivityFileForMigration>) {
    return `${JSON.stringify(activity, null, 2)}
`
}

function conversationReleaseUsage(conversation: ReturnType<typeof parseActivityFileForMigration>['conversations'][number]): AgentSummaryUsage {
    const usage = conversation.usage
    if (!usage) return legacySummaryUsage(0)
    if (conversation.usageSchemaVersion === undefined) return legacySummaryUsage(usage.totalTokens, usage.costUsd)

    return parseSummaryUsage({
        cachedInputTokens: usage.cachedInputTokens,
        ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
        inputTokens: usage.inputTokens,
        legacyTotalTokens: usage.legacyTotalTokens ?? 0,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
    }, 'release conversation usage')
}

function releaseUsage(activityFiles: MarkdownFile[]) {
    return addSummaryUsage(activityFiles.flatMap((file) => (
        parseActivityFileForMigration(file.content).conversations.map(conversationReleaseUsage)
    )))
}

export class ReleaseOperations {
    private readonly dependencies: ReleaseOperationsDeps
    private readonly flushPendingCommitBatch: () => Promise<void>

    constructor(
        dependencies: ReleaseOperationsDeps,
        flushPendingCommitBatch: () => Promise<void>,
    ) {
        this.dependencies = dependencies
        this.flushPendingCommitBatch = flushPendingCommitBatch
    }

    async getReleaseBranchCandidates(): Promise<ReleaseBranchCandidate[]> {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot load release branches before a project is open')

        const finalState = config.states.at(-1)
        if (!finalState) throw new Error('Cannot complete a release without configured states')
        const activeCards = this.dependencies.snapshot()?.activeCards ?? []
        const releaseCards = activeCards.filter((card) => statusOf(card) === finalState.state)
        requireNoAssignedWorktrees(releaseCards)
        if (!storage.deleteLocalBranch) return []
        const localBranches = new Set((await storage.listBranches(currentProject)).map(({ name }) => name))

        return releaseCards
            .filter((card) => !!card.header.branch && localBranches.has(card.header.branch))
            .filter((card) => card.header.branch !== currentProject.branch && !card.header.branch?.startsWith('md2/parking/'))
            .map((card) => {
                const branchName = card.header.branch
                if (!branchName) throw new Error(`Release branch identity is missing: ${card.header.id}`)

                return { branchName, cardId: card.header.id, cardPath: card.path }
            })
    }

    async completeRelease(releaseName: string, selectedBranchNames: string[], includeProjectActivity = false) {
        projectAccessService.requireWritable()
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot complete a release before a project is open')

        const safeReleaseName = validateReleaseName(releaseName)
        await this.flushPendingCommitBatch()

        const finalState = config.states.at(-1)
        if (!finalState) throw new Error('Cannot complete a release without configured states')

        const activeCards = this.dependencies.snapshot()?.activeCards ?? []
        const releaseCards = activeCards.filter((card) => statusOf(card) === finalState.state)
        requireNoAssignedWorktrees(releaseCards)
        if (releaseCards.length === 0) throw new Error(`Cannot complete a release without cards in the final column: ${finalState.state}`)
        await requireNoRunningActions()
        const releaseLock = await acquireReleaseCardLock(releaseCards, currentProject)

        try {
            const candidates = await this.getReleaseBranchCandidates()
            const candidateByBranch = new Map(candidates.map((candidate) => [candidate.branchName, candidate]))
            const uniqueSelectedBranchNames = [...new Set(selectedBranchNames)]
            const invalidBranch = uniqueSelectedBranchNames.find((branchName) => !candidateByBranch.has(branchName))
            if (invalidBranch) throw new Error(`Branch is not available for this release: ${invalidBranch}`)
            if (uniqueSelectedBranchNames.length > 0 && !storage.deleteLocalBranch) {
                throw new Error('Local branch deletion is not available')
            }

            const repositoryFiles = this.dependencies.snapshot()?.repositoryFiles ?? []
            const files = this.dependencies.files()
            const assetPaths = findArchiveAssetPaths(files, releaseCards)
            const assetFiles = await this.loadReleaseAssets(assetPaths)
            const activityPaths = findReleaseActivityPaths(releaseCards, config.projectFolder, repositoryFiles)
            const activityFiles = await this.loadReleaseActivityFiles(activityPaths)
            const calculatedStats = await calculateActivityStatsOutsideMainThread(
                storage,
                currentProject,
                activityPaths,
                new AbortController().signal,
            )
            if (calculatedStats.warnings.length > 0) {
                throw new Error(`Cannot calculate released stats: ${calculatedStats.warnings.join('; ')}`)
            }
            const archivedProjectActivity = includeProjectActivity
                ? await this.loadArchivedProjectActivity(config.projectFolder, config.releasesFolder, safeReleaseName, repositoryFiles)
                : null
            const moves = buildReleaseMoves(
                [...files, ...assetFiles],
                releaseCards,
                config.projectFolder,
                config.releasesFolder,
                safeReleaseName,
                repositoryFiles,
                activityFiles,
            )
            if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')
            const summaryPath = agentTokenUsageFilePath(config.projectFolder)
            const summaryFile = await storage.loadTextFile(currentProject, summaryPath)
            const summary = parseAgentTokenUsageSummary(summaryFile.content)
            if (Object.hasOwn(summary.releases, safeReleaseName)) throw new Error(`Release already exists: ${safeReleaseName}`)
            const nextSummary = {
                ...summary,
                releases: {
                    ...summary.releases,
                    [safeReleaseName]: releaseUsage([
                        ...activityFiles,
                        ...(archivedProjectActivity ? [archivedProjectActivity.archivedFile] : []),
                    ]),
                },
            }
            const statsPath = projectStatsFilePath(config.projectFolder)
            const existingStatsPath = repositoryFiles.find((path) => path.replace(/\\/gu, '/') === statsPath)
            const statsFile = existingStatsPath ? await storage.loadTextFile(currentProject, statsPath) : null
            const parsedStats = statsFile
                ? parseProjectStatsFile(statsFile.content, statsPath)
                : { releases: {}, warnings: [] }
            if (parsedStats.warnings.length > 0) {
                throw new Error(`Cannot update malformed project stats: ${parsedStats.warnings.join('; ')}`)
            }
            const statsContent = serializeProjectStats({
                ...parsedStats.releases,
                [safeReleaseName]: archivedProjectActivity
                    ? mergeStats([calculatedStats.stats, archivedProjectActivity.stats])
                    : calculatedStats.stats,
            })
            const preparedStatsFile = statsFile ? { ...statsFile, content: statsContent } : { content: statsContent, path: statsPath }
            await storage.commit({
                branch: currentProject.branch,
                files: [
                    { ...summaryFile, content: serializeAgentTokenUsageSummary(nextSummary) },
                    preparedStatsFile,
                    ...(archivedProjectActivity ? [archivedProjectActivity.archivedFile, archivedProjectActivity.keptFile] : []),
                ],
                message: `Complete release ${safeReleaseName}`,
                moves,
            })
            await projectAgentTokenUsageService.refresh()
            if (archivedProjectActivity) this.dependencies.resetAgentConversations()

            if (config.pushMode === 'auto') await storage.push(currentProject)

            const deletedCandidates: ReleaseBranchCandidate[] = []
            const cleanupFailures: string[] = []
            for (const branchName of uniqueSelectedBranchNames) {
                try {
                    if (!storage.deleteLocalBranch) throw new Error('Local branch deletion is not available')
                    await storage.deleteLocalBranch(currentProject, branchName)
                    const candidate = candidateByBranch.get(branchName)
                    if (!candidate) throw new Error(`Release branch candidate disappeared: ${branchName}`)
                    deletedCandidates.push(candidate)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    cleanupFailures.push(`${branchName}: ${message}`)
                }
            }

            let clearedFiles: MarkdownFile[] = []
            if (deletedCandidates.length > 0) {
                try {
                    const preparedClearedFiles = deletedCandidates.map((candidate) => {
                        const move = moves.find(({ fromPath }) => fromPath === candidate.cardPath)
                        if (!move) throw new Error(`Released card move is missing: ${candidate.cardId}`)

                        return { content: markdownParsingService.setBranch(move.content, null), path: move.toPath }
                    })
                    const committedFiles = await storage.commit({
                        branch: currentProject.branch,
                        files: preparedClearedFiles,
                        message: 'Clear deleted release branches',
                    })
                    clearedFiles = committedFiles.length > 0 ? committedFiles : preparedClearedFiles
                    if (config.pushMode === 'auto') await storage.push(currentProject)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    cleanupFailures.push(`branch metadata: ${message}`)
                }
            }

            const clearedFilesByPath = new Map(clearedFiles.map((file) => [file.path, file]))
            const appliedMoves = moves.map((move) => {
                const clearedFile = clearedFilesByPath.get(move.toPath)
                return clearedFile ? { ...move, content: clearedFile.content, sha: clearedFile.sha } : move
            })
            this.dependencies.applyMoves(appliedMoves, config.workingFolder)
            this.dependencies.dispatchChanged()
            telemetryService.trackEvent('complete_release')

            if (cleanupFailures.length > 0) {
                throw new Error(`Release completed, but branch cleanup failed: ${cleanupFailures.join('; ')}`)
            }

            return this.dependencies.snapshot()
        } finally {
            await releaseCardLock(releaseLock)
        }
    }

    private async loadReleaseAssets(assetPaths: string[]) {
        if (assetPaths.length === 0) return []

        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot load release assets before a project is open')
        if (!storage.loadProjectAsset) throw new Error('Project asset loading is not available')

        const assets: ProjectAsset[] = []
        for (const assetPath of assetPaths) {
            assets.push(await storage.loadProjectAsset(currentProject, assetPath))
        }

        return assets.map((asset): MarkdownFile => ({
            content: asset.content,
            encoding: asset.encoding,
            path: asset.path,
        }))
    }

    /**
     * Splits `activity/project.json` into the part the release archives and the part that stays,
     * and returns null when the file is absent or holds nothing archivable.
     */
    private async loadArchivedProjectActivity(
        projectFolder: string,
        releasesFolder: string,
        safeReleaseName: string,
        repositoryFiles: string[],
    ) {
        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot archive project activity before a project is open')
        if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')

        const projectActivityPath = activityFilePath(projectFolder, { kind: 'project' })
        const exists = repositoryFiles.some((path) => normalizePath(path) === normalizePath(projectActivityPath))
        if (!exists) return null

        const projectActivityFile = await storage.loadTextFile(currentProject, projectActivityPath)
        const { archived, hasArchivableActivity, kept } = splitProjectActivity(
            parseActivityFileForMigration(projectActivityFile.content),
        )
        if (!hasArchivableActivity) return null

        const releaseFolder = normalizePath(releasesFolder).replace(/\/+$/u, '')
        const archivedPath = `${releaseFolder}/${safeReleaseName}/${projectActivityFileName()}`
        const archivedContent = serializeActivity(archived)
        const calculated = calculateActivityStatsFromSources([{ content: archivedContent, path: archivedPath }])
        if (calculated.warnings.length > 0) {
            throw new Error(`Cannot calculate archived project activity stats: ${calculated.warnings.join('; ')}`)
        }

        return {
            archivedFile: { content: archivedContent, path: archivedPath },
            keptFile: { ...projectActivityFile, content: serializeActivity(kept) },
            stats: calculated.stats,
        }
    }

    private async loadReleaseActivityFiles(activityPaths: string[]) {
        if (activityPaths.length === 0) return []

        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot load release activity before a project is open')
        if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')

        const activityFiles: MarkdownFile[] = []
        for (const activityPath of activityPaths) {
            activityFiles.push(await storage.loadTextFile(currentProject, activityPath))
        }

        return activityFiles
    }
}
