import type { CardCommit } from '../../services/actions/card_commit_history'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { ActiveMarkdownDocumentChangedDetail } from '../editor/markdown_data_source'

export interface ListCardCommitDiffSelection {
    commit: CardCommit
    documentId: string
}

/** Owns the commit diff selected for the active list-card document. */
export class ListCardCommitDiffDataSource extends EventTarget {
    private selection: ListCardCommitDiffSelection | null = null

    constructor() {
        super()
        cardMarkdownDataSource.addEventListener('activeDocumentChanged', this.handleActiveDocumentChanged)
    }

    readonly getSnapshot = () => this.selection

    readonly subscribe = (onStoreChange: () => void) => {
        this.addEventListener('changed', onStoreChange)

        return () => this.removeEventListener('changed', onStoreChange)
    }

    readonly select = (commit: CardCommit) => {
        const documentId = cardMarkdownDataSource.getActiveDocumentId('list-card')
        if (!documentId) throw new Error('Cannot select a card commit without an active list-card document')

        this.update({ commit, documentId })
    }

    readonly clear = () => {
        this.update(null)
    }

    private readonly handleActiveDocumentChanged = (event: Event) => {
        const { binding, documentId } = (event as CustomEvent<ActiveMarkdownDocumentChangedDetail>).detail
        if (binding !== 'list-card' || this.selection?.documentId === documentId) return

        this.clear()
    }

    private update(selection: ListCardCommitDiffSelection | null) {
        if (this.selection === selection) return

        this.selection = selection
        this.dispatchEvent(new Event('changed'))
    }
}

export const listCardCommitDiffDataSource = new ListCardCommitDiffDataSource()
