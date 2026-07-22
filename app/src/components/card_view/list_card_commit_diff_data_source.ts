import type { CardCommit } from '../../services/actions/card_commit_history'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { ActiveMarkdownDocumentChangedDetail } from '../editor/markdown_data_source'
import type { CardOpenDocument } from '../../services/open_files_service'

export interface ListCardCommitDiffSelection {
    commit: CardCommit
    document: CardOpenDocument
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
        const document = cardMarkdownDataSource.getActiveDocument('list-card')
        if (!document) throw new Error('Cannot select a card commit without an active list-card document')

        this.update({ commit, document })
    }

    readonly clear = () => {
        this.update(null)
    }

    private readonly handleActiveDocumentChanged = (event: Event) => {
        const { binding, target } = (event as CustomEvent<ActiveMarkdownDocumentChangedDetail>).detail
        if (binding !== 'list-card' || this.selection?.document === target?.document) return

        this.clear()
    }

    private update(selection: ListCardCommitDiffSelection | null) {
        if (this.selection === selection) return

        this.selection = selection
        this.dispatchEvent(new Event('changed'))
    }
}

export const listCardCommitDiffDataSource = new ListCardCommitDiffDataSource()
