import type { DataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import {
    openFilesService,
    type CardOpenDocument,
    type OpenDocumentChangedDetail,
    type OpenFilesService,
} from '../../services/open_files_service'
import {
    MarkdownDataSourceBase,
    type MarkdownBindingKind,
    type MarkdownDocumentTarget,
} from './markdown_data_source'

type CardBinding = Exclude<MarkdownBindingKind, 'list-action'>
type CardMarkdownOwner = EventTarget & Pick<DataService, 'getState'> & {
    cards: Pick<DataService['cards'], 'toggleCardPolicy' | 'updateCardBody' | 'updateCardHeaderFields' | 'updateCardTitle'>
}
type ListCardOwner = EventTarget & Pick<OpenFilesService, 'getSnapshot'>

export interface CardDocumentClosedDetail {
    binding: 'list-card'
    document: CardOpenDocument
}

function cardTarget(target: MarkdownDocumentTarget): asserts target is { document: CardOpenDocument } {
    if (target.document.kind !== 'card') throw new Error('Card Markdown source requires a card document')
}

function readCardMarkdown(target: MarkdownDocumentTarget) {
    cardTarget(target)
    return target.document.getDraft().content
}

function editCardMarkdown(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
    if (binding === 'list-action') throw new Error('Card Markdown source cannot use list-action binding')
    cardTarget(target)
    const card = target.document.getDraft()
    target.document.updateDraft({ ...card, content: markdown }, binding)
}

/** Reads and writes card body Markdown through canonical card documents. */
export class CardMarkdownDataSource extends MarkdownDataSourceBase {
    private listCardOwner: ListCardOwner | null = null
    private service: CardMarkdownOwner | null = null

    init(service: CardMarkdownOwner) {
        if (this.service) return

        this.service = service
        openFilesService.addEventListener('documentChanged', this.handleDocumentChanged)
    }

    bindListCards(owner: ListCardOwner) {
        if (this.listCardOwner === owner) return
        if (this.listCardOwner) throw new Error('Card Markdown data source already has a list-card owner')

        this.listCardOwner = owner
        owner.addEventListener('changed', this.handleListCardsChanged)
        owner.addEventListener('removed', this.handleListCardRemoved)
        this.syncListCardBinding()
    }

    getActiveDocument(binding: CardBinding) {
        const target = this.getActiveTarget(binding)
        return target?.document.kind === 'card' ? target.document : null
    }

    getActiveCard(binding: CardBinding) {
        return this.getActiveDocument(binding)?.getDraft() ?? null
    }

    getProjectKey() {
        const { project } = this.requireService().getState()
        if (!project) throw new Error('Cannot resolve a card project before a project is open')

        return `${project.id}:${project.branch}`
    }

    updateActiveCardTitle(binding: CardBinding, title: string) {
        const document = this.requireActiveDocument(binding)
        const card = document.getDraft()
        document.updateDraft({ ...card, header: { ...card.header, title } }, this)
        this.requireService().cards.updateCardTitle(document.path, title, document.createSaveReference())
            .catch((error: unknown) => {
                dialogService.error(error, { fallbackMessage: `Title update failed: ${document.path}` })
            })
    }

    updateActiveCardHeaderField(binding: CardBinding, key: string, value: string) {
        const document = this.requireActiveDocument(binding)
        const card = document.getDraft()
        document.updateDraft({ ...card, headerFields: { ...card.headerFields, [key]: value } }, this)
        this.requireService().cards.updateCardHeaderFields(document.path, { [key]: value }, document.createSaveReference())
    }

    toggleActiveCardPolicy(binding: CardBinding, policyKey: string) {
        const document = this.requireActiveDocument(binding)
        const card = document.getDraft()
        const policy = { ...card.header.policy, [policyKey]: !card.header.policy[policyKey] }
        document.updateDraft({ ...card, header: { ...card.header, policy } }, this)
        this.requireService().cards.toggleCardPolicy(document.path, policyKey, document.createSaveReference())
    }

    readonly getMarkdown = readCardMarkdown
    readonly edit = editCardMarkdown

    commit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
        CardMarkdownDataSource.requireCardBinding(binding)
        cardTarget(target)
        try {
            const card = target.document.getDraft()
            if (card.content !== markdown) target.document.updateDraft({ ...card, content: markdown }, binding)
            this.requireService().cards.updateCardBody(
                target.document.path,
                markdown,
                target.document.createSaveReference(),
            )
            return true
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Body update failed: ${target.document.path}` })
            return false
        }
    }

    setBoardDocument(document: CardOpenDocument | null, discard = false) {
        this.setActiveTarget('board-card', document ? { document } : null, discard)
    }

    private readonly handleDocumentChanged = (event: Event) => {
        const { document, origin, type } = (event as CustomEvent<OpenDocumentChangedDetail>).detail
        if (document.kind !== 'card' || type !== 'draft') return

        const originBinding = typeof origin === 'string' ? origin as MarkdownBindingKind : null
        this.dispatchMarkdownReplaced({ originBinding, target: { document } })
        this.dispatchEvent(new Event('cardsChanged'))
    }

    private readonly handleListCardsChanged = () => this.syncListCardBinding()

    private readonly handleListCardRemoved = (event: Event) => {
        const { document } = (event as CustomEvent<{ document: ReturnType<ListCardOwner['getSnapshot']>['activeDocument'] }>).detail
        if (!document || document.kind !== 'card') return

        const detail: CardDocumentClosedDetail = { binding: 'list-card', document }
        this.dispatchEvent(new CustomEvent<CardDocumentClosedDetail>('cardDocumentClosed', { detail }))
    }

    private syncListCardBinding() {
        const activeDocument = this.listCardOwner?.getSnapshot().activeDocument ?? null
        this.setActiveTarget('list-card', activeDocument?.kind === 'card' ? { document: activeDocument } : null)
    }

    private requireActiveDocument(binding: CardBinding) {
        const document = this.getActiveDocument(binding)
        if (!document) throw new Error(`Cannot update a card without an active ${binding} document`)

        return document
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
