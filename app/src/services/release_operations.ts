import { buildReleaseMoves } from '../data/release_archiving'
import { type DataServiceContext } from './data_service_context'
import { telemetryService } from './telemetry_service'

export class ReleaseOperations {
    private readonly context: DataServiceContext
    private readonly flushPendingCommitBatch: () => Promise<void>

    constructor(
        context: DataServiceContext,
        flushPendingCommitBatch: () => Promise<void>,
    ) {
        this.context = context
        this.flushPendingCommitBatch = flushPendingCommitBatch
    }

    async completeRelease(releaseName: string) {
        const { config, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot complete a release before a project is open')

        await this.flushPendingCommitBatch()

        const activeCards = this.context.getCurrentSnapshot()?.activeCards ?? []
        if (activeCards.length === 0) throw new Error('Cannot complete a release without active cards')

        const repositoryFiles = this.context.getCurrentSnapshot()?.repositoryFiles ?? []
        const moves = buildReleaseMoves(this.context.getCurrentFiles(), activeCards, config.workingFolder, releaseName, repositoryFiles)
        await storage.moveFiles({
            branch: currentProject.branch,
            message: `Complete release ${releaseName.trim()}`,
            moves,
        })

        if (config.pushMode === 'auto') await storage.push(currentProject)

        await this.context.reloadCurrentProjectSnapshot()
        telemetryService.trackEvent('complete_release')

        return this.context.getCurrentSnapshot()
    }
}
