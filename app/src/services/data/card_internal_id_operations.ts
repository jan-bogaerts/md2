import type { MarkdownFile } from '../../data/data_types'
import type { CardOperationContext } from './card_operation_context'
import { markdownParsingService } from './markdown_parsing_service'

/**
 * Adds persisted identities to legacy cards loaded without an internal ID.
 * Only cards in the working folder root qualify; every other markdown file is a
 * regular document that must be left untouched, see the card classification rule
 * in design/architecture/current_data_model.md.
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
        const { commitBatcher, project } = this.context.requireProject('add card identities')
        const cards = dependencies.snapshot()?.activeCards ?? []

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

        const filesToPersist: MarkdownFile[] = []
        const updatedFiles = cardsWithoutInternalId.map((card) => {
            const existingFile = dependencies.requireFile(card.path)
            const generatedInternalId = this.generatedInternalIdsByPath.get(card.path)
            const internalId = generatedInternalId ?? markdownParsingService.generateInternalId()
            this.generatedInternalIdsByPath.set(card.path, internalId)
            const updatedFile = {
                ...existingFile,
                content: markdownParsingService.rewriteHeader(existingFile.content, { internalId }),
            }
            if (!generatedInternalId) filesToPersist.push(updatedFile)

            return updatedFile
        })
        this.context.replaceUpdatedFiles(updatedFiles)
        if (filesToPersist.length > 0) {
            commitBatcher.schedule(project.branch, filesToPersist, 'Add missing card internal IDs')
        }
        dependencies.dispatchChanged()

        return filesToPersist.length
    }
}
