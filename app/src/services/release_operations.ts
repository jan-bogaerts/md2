import {
    buildReleaseMoves,
    findArchiveAssetPaths,
    findReleaseActivityPaths,
    validateReleaseName,
} from '../data/release_archiving'
import { statusOf } from '../data/card_ordering'
import type { MarkdownFile, ProjectAsset, ProjectReference, ProjectSnapshot } from '../data/data_types'
import { type RequiredDataServiceDependencies } from './data/data_service_context'
import { telemetryService } from './telemetry/telemetry_service'

export interface ReleaseOperationsDeps {
    files(): MarkdownFile[]
    project(): ProjectReference | null
    reloadCurrentProjectSnapshot(): Promise<ProjectSnapshot | null>
    requireDependencies(): RequiredDataServiceDependencies
    snapshot(): ProjectSnapshot | null
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

    async completeRelease(releaseName: string) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot complete a release before a project is open')

        const safeReleaseName = validateReleaseName(releaseName)
        await this.flushPendingCommitBatch()

        const finalState = config.states.at(-1)
        if (!finalState) throw new Error('Cannot complete a release without configured states')

        const activeCards = this.dependencies.snapshot()?.activeCards ?? []
        const releaseCards = activeCards.filter((card) => statusOf(card) === finalState.state)
        if (releaseCards.length === 0) throw new Error(`Cannot complete a release without cards in the final column: ${finalState.state}`)

        const repositoryFiles = this.dependencies.snapshot()?.repositoryFiles ?? []
        const files = this.dependencies.files()
        const assetPaths = findArchiveAssetPaths(files, releaseCards)
        const assetFiles = await this.loadReleaseAssets(assetPaths)
        const activityPaths = findReleaseActivityPaths(releaseCards, config.projectFolder, repositoryFiles)
        const activityFiles = await this.loadReleaseActivityFiles(activityPaths)
        const moves = buildReleaseMoves(
            [...files, ...assetFiles],
            releaseCards,
            config.projectFolder,
            config.releasesFolder,
            safeReleaseName,
            repositoryFiles,
            activityFiles,
        )
        await storage.moveFiles({
            branch: currentProject.branch,
            message: `Complete release ${safeReleaseName}`,
            moves,
        })

        if (config.pushMode === 'auto') await storage.push(currentProject)

        await this.dependencies.reloadCurrentProjectSnapshot()
        telemetryService.trackEvent('complete_release')

        return this.dependencies.snapshot()
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
