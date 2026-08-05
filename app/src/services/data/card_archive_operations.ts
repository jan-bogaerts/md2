import { computeMove } from '../../data/card_ordering'
import type { MarkdownFile } from '../../data/data_types'
import { buildCardArchiveMoves, findArchiveAssetPaths } from '../../data/release_archiving'
import type { CardOperationContext } from './card_operation_context'
import { markdownParsingService } from './markdown_parsing_service'

/** Moves a card and its assets into the archived folder in one commit. */
export class CardArchiveOperations {
    private readonly context: CardOperationContext
    private readonly triggerStateActions: (cardPath: string, state: string) => void

    constructor(context: CardOperationContext, triggerStateActions: (cardPath: string, state: string) => void) {
        this.context = context
        this.triggerStateActions = triggerStateActions
    }

    async archiveCard(cardPath: string, targetIndex: number) {
        const { dependencies } = this.context
        const { config, project, storage } = this.context.requireProject('archive a card')

        await this.context.flushPendingCommits()

        const snapshot = dependencies.snapshot()
        const activeCards = snapshot?.activeCards ?? []
        const archivedCard = activeCards.find((card) => card.path === cardPath)
        if (!archivedCard) throw new Error(`Cannot archive an active card that is not loaded: ${cardPath}`)

        const updates = computeMove(activeCards, cardPath, 'archived', targetIndex)
        const updatedCards = this.context.applyOrderingUpdates(updates)
        const updatedFiles = updatedCards.map((card) => markdownParsingService.serializeCard(card))
        const files = this.context.mergeUpdatedFiles(updatedFiles)
        const assetFiles = await this.loadArchiveAssets(findArchiveAssetPaths(files, [archivedCard]))
        const moves = buildCardArchiveMoves(
            [...files, ...assetFiles],
            [archivedCard],
            config.archivedFolder,
            snapshot?.repositoryFiles ?? [],
        )
        const orderingFiles = updatedFiles.filter((file) => file.path !== cardPath)

        await this.context.commitTrackingPaths({
            branch: project.branch,
            files: orderingFiles,
            message: `Archive ${cardPath}`,
            moves,
        })

        this.triggerStateActions(cardPath, 'archived')
        if (config.pushMode === 'auto') await storage.push(project)
        if (config.pushMode === 'manual') dependencies.dispatchPersistenceChanged()
        await dependencies.reloadCurrentProjectSnapshot()

        const cardMove = moves.find((move) => move.fromPath === cardPath)
        if (!cardMove) throw new Error(`Missing archived card move: ${cardPath}`)

        dependencies.cardPathChanged(cardPath, cardMove.toPath)

        return updates
    }

    private async loadArchiveAssets(assetPaths: string[]): Promise<MarkdownFile[]> {
        if (assetPaths.length === 0) return []

        const { project, storage } = this.context.requireProject('load archived card assets')
        if (!storage.loadProjectAsset) throw new Error('Project asset loading is not available')

        const assets: MarkdownFile[] = []
        for (const assetPath of assetPaths) {
            const asset = await storage.loadProjectAsset(project, assetPath)
            assets.push({ content: asset.content, encoding: asset.encoding, path: asset.path })
        }

        return assets
    }
}
