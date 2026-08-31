const VALUE_CHANGED_EVENT = 'valueChanged'
const EDITOR_CHANGED_EVENT = 'editorChanged'
export const MARKDOWN_INSERTION_REQUESTED_EVENT = 'insertionRequested'
export const MARKDOWN_FLUSH_REQUESTED_EVENT = 'flushRequested'

type MarkdownDraftListener = () => void

export interface MarkdownInsertionRequest {
    acknowledge(): void
    markdown: string
    reject(error: unknown): void
}

/** Contract used by one mounted editor to read and update its active draft. */
export interface MarkdownDraftBinding {
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void
    edit(value: string): void
    getSnapshot(): string
    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void
    subscribeEditor(listener: MarkdownDraftListener): () => void
}

/** Service-owned Markdown value with external replacement and acknowledged insertion requests. */
export class MarkdownDraft extends EventTarget implements MarkdownDraftBinding {
    private editorSnapshot = { replacementRevision: 0 }
    private value: string

    constructor(initialValue: string) {
        super()
        this.value = initialValue
    }

    readonly getSnapshot = () => this.value

    readonly getEditorSnapshot = () => this.editorSnapshot

    readonly subscribe = (listener: MarkdownDraftListener) => {
        this.addEventListener(VALUE_CHANGED_EVENT, listener)

        return () => this.removeEventListener(VALUE_CHANGED_EVENT, listener)
    }

    readonly subscribeEditor = (listener: MarkdownDraftListener) => {
        this.addEventListener(EDITOR_CHANGED_EVENT, listener)

        return () => this.removeEventListener(EDITOR_CHANGED_EVENT, listener)
    }

    edit(value: string) {
        this.setValue(value)
    }

    replace(value: string) {
        this.setValue(value)
        this.editorSnapshot = { replacementRevision: this.editorSnapshot.replacementRevision + 1 }
        this.dispatchEvent(new Event(EDITOR_CHANGED_EVENT))
    }

    clear() {
        if (this.value.length === 0) return

        this.replace('')
    }

    /** Asks the mounted editor, if any, to commit its debounced buffer into this draft now. */
    readonly requestFlush = () => {
        this.dispatchEvent(new Event(MARKDOWN_FLUSH_REQUESTED_EVENT))
    }

    readonly requestInsertion = (markdown: string) => new Promise<void>((resolve, reject) => {
        let handled = false
        const request: MarkdownInsertionRequest = {
            acknowledge: () => {
                if (handled) return
                handled = true
                resolve()
            },
            markdown,
            reject: (error: unknown) => {
                if (handled) return
                handled = true
                reject(error)
            },
        }
        this.dispatchEvent(new CustomEvent<MarkdownInsertionRequest>(MARKDOWN_INSERTION_REQUESTED_EVENT, { detail: request }))
        if (!handled) request.reject(new Error('Markdown insertion requires a mounted editor'))
    })

    private setValue(value: string) {
        if (this.value === value) return

        this.value = value
        this.dispatchEvent(new Event(VALUE_CHANGED_EVENT))
    }
}
