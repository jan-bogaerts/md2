import type { ProjectCard } from '../../data/data_types'
import type { DataService } from '../../services/data/data_service'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { MarkdownDataSourceBase, type MarkdownBindingKind } from './markdown_data_source'

interface LastWrittenMarkdown {
    markdown: string
    originBinding: MarkdownBindingKind
}

function requireInternalId(card: ProjectCard) {
    if (!card.header.internalId) throw new Error(`Card Markdown requires an internal ID: ${card.path}`)

    return card.header.internalId
}

function listCards(service: DataService) {
    const snapshot = service.getState().snapshot

    return [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
}

/** Resolves and writes card bodies by stable card internal ID. */
export class CardMarkdownDataSource extends MarkdownDataSourceBase {
    private readonly markdownByDocumentId = new Map<string, string>()
    private readonly lastWrittenMarkdownByDocumentId = new Map<string, LastWrittenMarkdown>()
    private service: DataService | null = null

    init(service: DataService) {
        if (this.service) return

        this.service = service
        this.captureCurrentMarkdown()
        service.addEventListener('changed', this.handleChanged)
    }

    getMarkdown(documentId: string) {
        return this.requireCard(documentId).content
    }

    edit(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        this.requireCardBinding(binding)
        this.requireCard(documentId)
        this.lastWrittenMarkdownByDocumentId.set(documentId, { markdown, originBinding: binding })
    }

    commit(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        this.requireCardBinding(binding)
        const card = this.requireCard(documentId)
        const previousWrittenMarkdown = this.lastWrittenMarkdownByDocumentId.get(documentId)
        this.lastWrittenMarkdownByDocumentId.set(documentId, { markdown, originBinding: binding })
        try {
            this.requireService().cards.updateCardBody(card.path, markdown)
            return true
        } catch (error) {
            if (previousWrittenMarkdown) this.lastWrittenMarkdownByDocumentId.set(documentId, previousWrittenMarkdown)
            else this.lastWrittenMarkdownByDocumentId.delete(documentId)
            dialogService.error(error, { fallbackMessage: `Body update failed: ${card.path}` })
            return false
        }
    }

    private readonly handleChanged = () => {
        const cards = listCards(this.requireService())
        const nextMarkdownByDocumentId = new Map<string, string>()
        for (const card of cards) {
            const documentId = requireInternalId(card)
            nextMarkdownByDocumentId.set(documentId, card.content)
            const previousMarkdown = this.markdownByDocumentId.get(documentId)
            if (previousMarkdown === undefined || previousMarkdown === card.content) continue

            const lastWritten = this.lastWrittenMarkdownByDocumentId.get(documentId)
            const originBinding = lastWritten?.markdown === card.content ? lastWritten.originBinding : null
            if (originBinding) this.lastWrittenMarkdownByDocumentId.delete(documentId)
            this.dispatchMarkdownReplaced({ documentId, originBinding })
        }
        this.markdownByDocumentId.clear()
        for (const [documentId, markdown] of nextMarkdownByDocumentId) this.markdownByDocumentId.set(documentId, markdown)
    }

    private captureCurrentMarkdown() {
        for (const card of listCards(this.requireService())) this.markdownByDocumentId.set(requireInternalId(card), card.content)
    }

    private requireCard(documentId: string) {
        const card = listCards(this.requireService()).find((candidate) => candidate.header.internalId === documentId)
        if (!card) throw new Error(`Unknown card Markdown document: ${documentId}`)

        return card
    }

    private requireCardBinding(binding: MarkdownBindingKind) {
        if (binding === 'list-action') throw new Error('Card Markdown source cannot use list-action binding')
    }

    private requireService() {
        if (!this.service) throw new Error('Card Markdown data source is not initialized')

        return this.service
    }
}

export const cardMarkdownDataSource = new CardMarkdownDataSource()
