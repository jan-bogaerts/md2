import { createEmptyHistoryState, registerHistory, type HistoryState } from '@lexical/history'
import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, type LexicalEditor } from 'lexical'

const HISTORY_MERGE_DELAY_MS = 1000

interface MarkdownDocumentHistory {
    historyState: HistoryState
    markdown: string
}

function copyHistoryState(target: HistoryState, source: HistoryState) {
    target.current = source.current
    target.redoStack = source.redoStack
    target.undoStack = source.undoStack
}

function rebindHistoryState(historyState: HistoryState, editor: LexicalEditor) {
    if (historyState.current) historyState.current.editor = editor
    for (const entry of historyState.redoStack) entry.editor = editor
    for (const entry of historyState.undoStack) entry.editor = editor
}

function ensureCurrentEditorState(historyState: HistoryState, editor: LexicalEditor) {
    if (historyState.current) return

    historyState.current = { editor, editorState: editor.getEditorState() }
}

/** Owns independent Lexical histories for Markdown documents edited by one editor instance. */
export class MarkdownDocumentHistoryStore {
    readonly sharedHistoryState = createEmptyHistoryState()
    private activeDocumentId: string | null = null
    private readonly discardedDocumentIds = new Set<string>()
    private readonly documents = new Map<string, MarkdownDocumentHistory>()
    private editor: LexicalEditor | null = null
    private pendingDocumentId: string | null = null
    private switchToken = 0

    get canRedo() { return this.sharedHistoryState.redoStack.length > 0 }
    get canUndo() { return this.sharedHistoryState.undoStack.length > 0 }

    attachEditor(editor: LexicalEditor, documentId: string | null, markdown: string) {
        this.persistActiveDocument()
        this.editor = editor
        for (const { historyState } of this.documents.values()) rebindHistoryState(historyState, editor)

        if (!documentId) {
            copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
            this.activeDocumentId = null
            this.pendingDocumentId = null
            return
        }

        const document = this.requireDocument(documentId, markdown)
        copyHistoryState(this.sharedHistoryState, document.historyState)
        ensureCurrentEditorState(document.historyState, editor)
        copyHistoryState(this.sharedHistoryState, document.historyState)
        this.activeDocumentId = documentId
        this.pendingDocumentId = null
    }

    detachEditor(editor: LexicalEditor) {
        if (this.editor === editor) this.editor = null
    }

    isActiveDocument(documentId: string) {
        return this.activeDocumentId === documentId
    }

    syncToolbarAvailability(editor: LexicalEditor) {
        editor.dispatchCommand(CAN_UNDO_COMMAND, this.canUndo)
        editor.dispatchCommand(CAN_REDO_COMMAND, this.canRedo)
    }

    registerEditorHistory(editor: LexicalEditor) {
        const unregister = registerHistory(editor, this.sharedHistoryState, HISTORY_MERGE_DELAY_MS)
        this.syncToolbarAvailability(editor)

        return unregister
    }

    discardDocument(documentId: string) {
        if (documentId === this.activeDocumentId) {
            this.discardedDocumentIds.add(documentId)
            return
        }
        this.documents.delete(documentId)
    }

    retainDocuments(documentIds: readonly string[]) {
        const retainedIds = new Set(documentIds)
        for (const documentId of this.documents.keys()) {
            if (!retainedIds.has(documentId) && documentId !== this.activeDocumentId) this.documents.delete(documentId)
        }
    }

    replaceDocument(documentId: string, markdown: string) {
        const document = { historyState: createEmptyHistoryState(), markdown }
        this.documents.set(documentId, document)
        this.discardedDocumentIds.delete(documentId)
        if (this.activeDocumentId === documentId) {
            const editor = this.editor
            if (!editor) throw new Error('Cannot replace active Markdown history before the editor is attached')
            ensureCurrentEditorState(document.historyState, editor)
            copyHistoryState(this.sharedHistoryState, document.historyState)
            this.syncToolbarAvailability(editor)
        }
        this.pendingDocumentId = null
        this.switchToken += 1
    }

    switchDocument(
        documentId: string | null,
        markdown: string,
        currentMarkdown: string,
        replaceMarkdown: (markdown: string) => void,
    ) {
        const editor = this.editor
        if (!editor) throw new Error('Cannot switch Markdown history before the editor is attached')
        if (this.activeDocumentId === documentId) return

        this.persistActiveDocument(currentMarkdown)
        if (!documentId) {
            copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
            replaceMarkdown('')
            this.activeDocumentId = null
            this.pendingDocumentId = null
            this.switchToken += 1
            this.syncToolbarAvailability(editor)
            return
        }

        const document = this.requireDocument(documentId, markdown)
        copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
        replaceMarkdown(markdown)
        this.activeDocumentId = documentId
        this.pendingDocumentId = documentId
        this.switchToken += 1
        const switchToken = this.switchToken
        queueMicrotask(() => this.completeDocumentSwitch(documentId, document, editor, switchToken))
    }

    clear() {
        this.documents.clear()
        this.discardedDocumentIds.clear()
        this.activeDocumentId = null
        this.pendingDocumentId = null
        this.switchToken += 1
        copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
        if (this.editor) this.syncToolbarAvailability(this.editor)
    }

    private completeDocumentSwitch(
        documentId: string,
        document: MarkdownDocumentHistory,
        editor: LexicalEditor,
        switchToken: number,
    ) {
        if (switchToken !== this.switchToken || documentId !== this.pendingDocumentId) return

        ensureCurrentEditorState(document.historyState, editor)
        copyHistoryState(this.sharedHistoryState, document.historyState)
        this.pendingDocumentId = null
        this.syncToolbarAvailability(editor)
    }

    private persistActiveDocument(markdown?: string) {
        if (!this.activeDocumentId) return

        if (this.discardedDocumentIds.delete(this.activeDocumentId)) {
            this.documents.delete(this.activeDocumentId)
            this.pendingDocumentId = null
            this.switchToken += 1
            return
        }

        const document = this.documents.get(this.activeDocumentId)
        if (!document) throw new Error(`Missing Markdown history for active document: ${this.activeDocumentId}`)

        if (this.pendingDocumentId === this.activeDocumentId) {
            if (markdown !== undefined) document.markdown = markdown
            this.pendingDocumentId = null
            this.switchToken += 1
            return
        }

        copyHistoryState(document.historyState, this.sharedHistoryState)
        if (markdown !== undefined) document.markdown = markdown
    }

    private requireDocument(documentId: string, markdown: string) {
        const existingDocument = this.documents.get(documentId)
        if (existingDocument?.markdown === markdown) return existingDocument

        const document = { historyState: createEmptyHistoryState(), markdown }
        this.documents.set(documentId, document)

        return document
    }
}
