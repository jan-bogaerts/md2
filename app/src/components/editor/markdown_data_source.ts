export type MarkdownBindingKind = 'board-card' | 'list-action' | 'list-card'

export interface ActiveMarkdownDocumentChangedDetail {
    binding: MarkdownBindingKind
    /** Drop the outgoing buffer instead of flushing it; the owning domain data is gone. */
    discard?: boolean
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

export interface LastWrittenMarkdown {
    markdown: string
    originBinding: MarkdownBindingKind
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
    private readonly lastWrittenMarkdownByDocumentId = new Map<string, LastWrittenMarkdown>()

    abstract commit(binding: MarkdownBindingKind, documentId: string, markdown: string): boolean
    abstract edit(binding: MarkdownBindingKind, documentId: string, markdown: string): void
    abstract getMarkdown(documentId: string): string

    getBindingsSnapshot() {
        return this.bindings
    }

    getActiveDocumentId(binding: MarkdownBindingKind) {
        return this.bindings[bindingSnapshotKey(binding)]
    }

    setActiveDocument(binding: MarkdownBindingKind, documentId: string | null, discard = false) {
        const key = bindingSnapshotKey(binding)
        if (this.bindings[key] === documentId) return

        this.bindings = { ...this.bindings, [key]: documentId }
        const detail: ActiveMarkdownDocumentChangedDetail = { binding, discard, documentId }
        this.dispatchEvent(new CustomEvent('activeDocumentChanged', { detail }))
    }

    clearBindings(discard = false) {
        for (const binding of ['board-card', 'list-card', 'list-action'] as const) this.setActiveDocument(binding, null, discard)
    }

    protected dispatchMarkdownReplaced(detail: MarkdownReplacedDetail) {
        this.dispatchEvent(new CustomEvent('markdownReplaced', { detail }))
    }

    protected recordWrittenMarkdown(binding: MarkdownBindingKind, documentId: string, markdown: string) {
        const previous = this.lastWrittenMarkdownByDocumentId.get(documentId)
        this.lastWrittenMarkdownByDocumentId.set(documentId, { markdown, originBinding: binding })

        return previous
    }

    protected restoreWrittenMarkdown(documentId: string, previous: LastWrittenMarkdown | undefined) {
        if (previous) this.lastWrittenMarkdownByDocumentId.set(documentId, previous)
        else this.lastWrittenMarkdownByDocumentId.delete(documentId)
    }

    /** Consume the written-echo entry when renewed content matches it; null for external changes. */
    protected takeEchoOriginBinding(documentId: string, markdown: string) {
        const lastWritten = this.lastWrittenMarkdownByDocumentId.get(documentId)
        if (lastWritten?.markdown !== markdown) return null

        this.lastWrittenMarkdownByDocumentId.delete(documentId)
        return lastWritten.originBinding
    }

    protected forgetWrittenMarkdown(documentId: string) {
        this.lastWrittenMarkdownByDocumentId.delete(documentId)
    }

    protected clearWrittenMarkdown() {
        this.lastWrittenMarkdownByDocumentId.clear()
    }
}
