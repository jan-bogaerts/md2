export type MarkdownBindingKind = 'board-card' | 'list-action' | 'list-card'

export interface ActiveMarkdownDocumentChangedDetail {
    binding: MarkdownBindingKind
    documentId: string | null
}

export interface MarkdownReplacedDetail {
    documentId: string
    originBinding: MarkdownBindingKind | null
}

export interface MarkdownBindingsSnapshot {
    activeBoardCardDocumentId: string | null
    activeListActionDocumentId: string | null
    activeListCardDocumentId: string | null
}

export interface MarkdownDataSource extends EventTarget {
    commit(binding: MarkdownBindingKind, documentId: string, markdown: string): boolean
    edit(binding: MarkdownBindingKind, documentId: string, markdown: string): void
    getActiveDocumentId(binding: MarkdownBindingKind): string | null
    getMarkdown(documentId: string): string
}

const INITIAL_BINDINGS: MarkdownBindingsSnapshot = {
    activeBoardCardDocumentId: null,
    activeListActionDocumentId: null,
    activeListCardDocumentId: null,
}

function bindingSnapshotKey(binding: MarkdownBindingKind): keyof MarkdownBindingsSnapshot {
    if (binding === 'board-card') return 'activeBoardCardDocumentId'
    if (binding === 'list-card') return 'activeListCardDocumentId'

    return 'activeListActionDocumentId'
}

/** Shared active-selection and event behavior for Markdown collection sources. */
export abstract class MarkdownDataSourceBase extends EventTarget implements MarkdownDataSource {
    private bindings = INITIAL_BINDINGS

    abstract commit(binding: MarkdownBindingKind, documentId: string, markdown: string): boolean
    abstract edit(binding: MarkdownBindingKind, documentId: string, markdown: string): void
    abstract getMarkdown(documentId: string): string

    getBindingsSnapshot() {
        return this.bindings
    }

    getActiveDocumentId(binding: MarkdownBindingKind) {
        return this.bindings[bindingSnapshotKey(binding)]
    }

    setActiveDocument(binding: MarkdownBindingKind, documentId: string | null) {
        const key = bindingSnapshotKey(binding)
        if (this.bindings[key] === documentId) return

        this.bindings = { ...this.bindings, [key]: documentId }
        const detail: ActiveMarkdownDocumentChangedDetail = { binding, documentId }
        this.dispatchEvent(new CustomEvent('activeDocumentChanged', { detail }))
    }

    clearBindings() {
        for (const binding of ['board-card', 'list-card', 'list-action'] as const) this.setActiveDocument(binding, null)
    }

    protected dispatchMarkdownReplaced(detail: MarkdownReplacedDetail) {
        this.dispatchEvent(new CustomEvent('markdownReplaced', { detail }))
    }
}
