import { buildReleaseMoves } from '../data/release_archiving'
import type { MarkdownFile, ProjectReference, ProjectSnapshot } from '../data/data_types'
import { type RequiredDataServiceDependencies } from './data_service_context'
import { telemetryService } from './telemetry_service'

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

        await this.flushPendingCommitBatch()

        const activeCards = this.dependencies.snapshot()?.activeCards ?? []
        if (activeCards.length === 0) throw new Error('Cannot complete a release without active cards')

        const repositoryFiles = this.dependencies.snapshot()?.repositoryFiles ?? []
        const moves = buildReleaseMoves(this.dependencies.files(), activeCards, config.workingFolder, releaseName, repositoryFiles)
        await storage.moveFiles({
            branch: currentProject.branch,
            message: `Complete release ${releaseName.trim()}`,
            moves,
        })

        if (config.pushMode === 'auto') await storage.push(currentProject)

        await this.dependencies.reloadCurrentProjectSnapshot()
        telemetryService.trackEvent('complete_release')

        return this.dependencies.snapshot()
    }
}
