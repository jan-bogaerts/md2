import type { Card } from '../../data/data_types'
import type { CardOperationContext } from './card_operation_context'
import { setCardHeaderFields } from './card_mutations'
import { markdownParsingService } from './markdown_parsing_service'

function isInsideFolder(path: string, folder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedFolder = folder.replace(/\\/gu, '/').replace(/\/+$/u, '')

    return normalizedPath.startsWith(`${normalizedFolder}/`)
}

function requiresInternalId(card: Card, workingFolder: string, releasesFolder: string, archivedFolder: string) {
    return markdownParsingService.isRootWorkingFolderFile(card.path, workingFolder)
        || isInsideFolder(card.path, releasesFolder)
        || isInsideFolder(card.path, archivedFolder)
}

/**
 * Adds persisted identities to legacy cards loaded without an internal ID.
 * Active, released, and archived card files require identities. Markdown files
 * outside those configured folders are regular documents and remain untouched.
 */
export class CardInternalIdOperations {
    private readonly context: CardOperationContext
    private readonly onProjectChanged: () => void
    private generatedInternalIdProjectKey: string | null = null
    private readonly generatedInternalIdsByPath = new Map<string, string>()

    constructor(context: CardOperationContext, onProjectChanged: () => void) {
        this.context = context
        this.onProjectChanged = onProjectChanged
    }

    /** Returns how many files were queued for persistence. */
    ensureCardInternalIds() {
        const { dependencies } = this.context
        const { commitBatcher, config, project } = this.context.requireProject('add card identities')
        const snapshot = dependencies.snapshot()
        const cards = snapshot ? [...snapshot.activeCards, ...snapshot.backgroundCards].filter((card) => (
            requiresInternalId(card, config.workingFolder, config.releasesFolder, config.archivedFolder)
        )) : []

        const projectKey = `${project.id}:${project.branch}`
        if (projectKey !== this.generatedInternalIdProjectKey) {
            this.generatedInternalIdProjectKey = projectKey
            this.generatedInternalIdsByPath.clear()
            this.onProjectChanged()
        }
        for (const card of cards) {
            if (card.header.internalId) this.generatedInternalIdsByPath.delete(card.path)
        }
        const cardsWithoutInternalId = cards.filter(({ header }) => !header.internalId)
        if (cardsWithoutInternalId.length === 0) return 0

        const cardsToPersist: Card[] = []
        for (const card of cardsWithoutInternalId) {
            const generatedInternalId = this.generatedInternalIdsByPath.get(card.path)
            const internalId = generatedInternalId ?? markdownParsingService.generateInternalId()
            this.generatedInternalIdsByPath.set(card.path, internalId)
            const updatedCard = dependencies.mutateCard(
                card.path,
                (currentCard) => setCardHeaderFields(currentCard, { internalId }),
                config.workingFolder,
            )
            if (!generatedInternalId) cardsToPersist.push(updatedCard)
        }
        if (cardsToPersist.length > 0) {
            const changes = cardsToPersist.map((card) => {
                const cardInternalId = card.header.internalId
                if (!cardInternalId) throw new Error(`Generated card identity was not applied: ${card.path}`)

                return { cardInternalId, path: card.path }
            })
            commitBatcher.schedule(project.branch, changes, 'Add missing card internal IDs')
        }
        dependencies.dispatchChanged()

        return cardsToPersist.length
    }
}
