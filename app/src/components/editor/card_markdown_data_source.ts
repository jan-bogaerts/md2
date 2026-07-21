import type { ProjectCard } from '../../data/data_types'
import type { DataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { openFilesService, type OpenFilesService } from '../../services/open_files_service'
import { MarkdownDataSourceBase, type MarkdownBindingKind } from './markdown_data_source'

function requireInternalId(card: ProjectCard) {
    if (!card.header.internalId) throw new Error(`Card Markdown requires an internal ID: ${card.path}`)

    return card.header.internalId
}

type CardMarkdownOwner = EventTarget & Pick<DataService, 'getState'> & {
    cards: Pick<DataService['cards'], 'toggleCardPolicy' | 'updateCardBody' | 'updateCardHeaderFields' | 'updateCardTitle'>
}

type ListCardOwner = EventTarget & Pick<OpenFilesService, 'getSnapshot'>

export interface CardDocumentClosedDetail {
    binding: 'list-card'
    documentId: string
}

function listCards(service: CardMarkdownOwner) {
    const snapshot = service.getState().snapshot

    return [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
}

function loadedProjectKey(service: CardMarkdownOwner) {
    const { project } = service.getState()

    return project ? `${project.id}:${project.branch}` : null
}

/** Resolves and writes card bodies by stable card internal ID. */
export class CardMarkdownDataSource extends MarkdownDataSourceBase {
    private readonly markdownByDocumentId = new Map<string, string>()
    private readonly reportedEditFailureDocumentIds = new Set<string>()
    private loadedProjectKey: string | null = null
    private listCardOwner: ListCardOwner | null = null
    private service: CardMarkdownOwner | null = null

    init(service: CardMarkdownOwner) {
        if (this.service) return

        this.service = service
        this.loadedProjectKey = loadedProjectKey(service)
        this.captureCurrentMarkdown()
        service.addEventListener('changed', this.handleChanged)
    }

    bindListCards(owner: ListCardOwner) {
        if (this.listCardOwner === owner) return
        if (this.listCardOwner) throw new Error('Card Markdown data source already has a list-card owner')

        this.listCardOwner = owner
        owner.addEventListener('changed', this.handleListCardsChanged)
        owner.addEventListener('removed', this.handleListCardRemoved)
        this.syncListCardBinding()
    }

    getActiveCard(binding: Exclude<MarkdownBindingKind, 'list-action'>) {
        const documentId = this.getActiveDocumentId(binding)

        return documentId ? this.getCard(documentId) : null
    }

    getCard(documentId: string) {
        return this.requireCard(documentId)
    }

    getProjectKey() {
        if (!this.loadedProjectKey) throw new Error('Cannot resolve a card project before a project is open')

        return this.loadedProjectKey
    }

    updateActiveCardTitle(binding: Exclude<MarkdownBindingKind, 'list-action'>, title: string) {
        this.updateActiveCard(binding, 'Title update failed', (card) => {
            this.requireService().cards.updateCardTitle(card.path, title)
        })
    }

    updateActiveCardHeaderField(binding: Exclude<MarkdownBindingKind, 'list-action'>, key: string, value: string) {
        this.updateActiveCard(binding, 'Header update failed', (card) => {
            this.requireService().cards.updateCardHeaderFields(card.path, { [key]: value })
        })
    }

    toggleActiveCardPolicy(binding: Exclude<MarkdownBindingKind, 'list-action'>, policyKey: string) {
        this.updateActiveCard(binding, 'Policy update failed', (card) => {
            this.requireService().cards.toggleCardPolicy(card.path, policyKey)
        })
    }

    getMarkdown(documentId: string) {
        return this.requireCard(documentId).content
    }

    edit(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        CardMarkdownDataSource.requireCardBinding(binding)
        try {
            this.requireCard(documentId)
            this.reportedEditFailureDocumentIds.delete(documentId)
            this.recordWrittenMarkdown(binding, documentId, markdown)
        } catch (error) {
            if (this.reportedEditFailureDocumentIds.has(documentId)) return

            this.reportedEditFailureDocumentIds.add(documentId)
            dialogService.error(error, { fallbackMessage: `Body update failed: ${documentId}` })
        }
    }

    commit(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        CardMarkdownDataSource.requireCardBinding(binding)
        const previousWrittenMarkdown = this.recordWrittenMarkdown(binding, documentId, markdown)
        const card = listCards(this.requireService()).find((candidate) => candidate.header.internalId === documentId)
        try {
            if (!card) throw new Error(`Unknown card Markdown document: ${documentId}`)
            this.requireService().cards.updateCardBody(card.path, markdown)
            return true
        } catch (error) {
            this.restoreWrittenMarkdown(documentId, previousWrittenMarkdown)
            dialogService.error(error, { fallbackMessage: `Body update failed: ${card?.path ?? documentId}` })
            return false
        }
    }

    private readonly handleChanged = () => {
        const nextProjectKey = loadedProjectKey(this.requireService())
        if (nextProjectKey !== this.loadedProjectKey) {
            this.loadedProjectKey = nextProjectKey
            this.markdownByDocumentId.clear()
            this.reportedEditFailureDocumentIds.clear()
            this.clearWrittenMarkdown()
            this.clearBindings(true)
        }
        const cards = listCards(this.requireService())
        const nextMarkdownByDocumentId = new Map<string, string>()
        for (const card of cards) {
            const documentId = requireInternalId(card)
            nextMarkdownByDocumentId.set(documentId, card.content)
            const previousMarkdown = this.markdownByDocumentId.get(documentId)
            if (previousMarkdown === undefined || previousMarkdown === card.content) continue

            const originBinding = this.takeEchoOriginBinding(documentId, card.content)
            this.dispatchMarkdownReplaced({ documentId, originBinding })
        }
        this.markdownByDocumentId.clear()
        for (const [documentId, markdown] of nextMarkdownByDocumentId) this.markdownByDocumentId.set(documentId, markdown)
        this.dispatchEvent(new Event('cardsChanged'))
    }

    private readonly handleListCardsChanged = () => this.syncListCardBinding()

    private readonly handleListCardRemoved = (event: Event) => {
        const { document } = (event as CustomEvent<{ document: ReturnType<ListCardOwner['getSnapshot']>['activeDocument'] }>).detail
        if (!document || document.kind !== 'card') return

        const documentId = requireInternalId(document.getObject())
        const detail: CardDocumentClosedDetail = { binding: 'list-card', documentId }
        this.dispatchEvent(new CustomEvent<CardDocumentClosedDetail>('cardDocumentClosed', { detail }))
    }

    private captureCurrentMarkdown() {
        for (const card of listCards(this.requireService())) this.markdownByDocumentId.set(requireInternalId(card), card.content)
    }

    private requireCard(documentId: string) {
        const card = listCards(this.requireService()).find((candidate) => candidate.header.internalId === documentId)
        if (!card) throw new Error(`Unknown card Markdown document: ${documentId}`)

        return card
    }

    private syncListCardBinding() {
        const activeDocument = this.listCardOwner?.getSnapshot().activeDocument ?? null
        const documentId = activeDocument?.kind === 'card' ? requireInternalId(activeDocument.getObject()) : null
        this.setActiveDocument('list-card', documentId)
    }

    private updateActiveCard(
        binding: Exclude<MarkdownBindingKind, 'list-action'>,
        failureLabel: string,
        update: (card: ProjectCard) => void,
    ) {
        const card = this.getActiveCard(binding)
        if (!card) throw new Error(`Cannot update a card without an active ${binding} document`)

        try {
            update(card)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `${failureLabel}: ${card.path}` })
        }
    }

    private static requireCardBinding(binding: MarkdownBindingKind) {
        if (binding === 'list-action') throw new Error('Card Markdown source cannot use list-action binding')
    }

    private requireService() {
        if (!this.service) throw new Error('Card Markdown data source is not initialized')

        return this.service
    }
}

export const cardMarkdownDataSource = new CardMarkdownDataSource()
cardMarkdownDataSource.bindListCards(openFilesService)
