import { buildReleaseMoves, findArchiveAssetPaths, validateReleaseName } from '../data/release_archiving'
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

        const activeCards = this.dependencies.snapshot()?.activeCards ?? []
        if (activeCards.length === 0) throw new Error('Cannot complete a release without active cards')

        const repositoryFiles = this.dependencies.snapshot()?.repositoryFiles ?? []
        const files = this.dependencies.files()
        const assetPaths = findArchiveAssetPaths(files, activeCards)
        const assetFiles = await this.loadReleaseAssets(assetPaths)
        const moves = buildReleaseMoves(
            [...files, ...assetFiles],
            activeCards,
            config.projectFolder,
            config.releasesFolder,
            safeReleaseName,
            repositoryFiles,
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
}
