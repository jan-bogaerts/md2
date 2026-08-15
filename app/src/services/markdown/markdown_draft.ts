const VALUE_CHANGED_EVENT = 'valueChanged'
const EDITOR_CHANGED_EVENT = 'editorChanged'
export const MARKDOWN_INSERTION_REQUESTED_EVENT = 'insertionRequested'

type MarkdownDraftListener = () => void

export interface MarkdownInsertionRequest {
    acknowledge(): void
    markdown: string
    reject(error: unknown): void
}

/** Service-owned Markdown value with external replacement and acknowledged insertion requests. */
export class MarkdownDraft extends EventTarget {
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
