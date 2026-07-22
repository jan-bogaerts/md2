import { createEmptyHistoryState, registerHistory, type HistoryState } from '@lexical/history'
import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, type LexicalEditor } from 'lexical'
import type { OpenDocument } from '../../services/open_files_service'
import { sameMarkdownTarget, type MarkdownDocumentTarget } from './markdown_data_source'

const HISTORY_MERGE_DELAY_MS = 1000
const CARD_SECTION_KEY = 'body'
const PROMPT_SECTION_KEY = 'prompt'

interface MarkdownDocumentHistory {
    historyState: HistoryState
    markdown: string
}

function sectionKey(target: MarkdownDocumentTarget) {
    if (!target.section) return CARD_SECTION_KEY
    return target.section.kind === 'prompt' ? PROMPT_SECTION_KEY : `phrase:${target.section.identity}`
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
    if (!historyState.current) historyState.current = { editor, editorState: editor.getEditorState() }
}

/** Owns binding-local Lexical histories keyed by canonical document and section. */
export class MarkdownDocumentHistoryStore {
    readonly sharedHistoryState = createEmptyHistoryState()
    private activeTarget: MarkdownDocumentTarget | null = null
    private readonly discardedTargets: MarkdownDocumentTarget[] = []
    private readonly documents = new Map<OpenDocument, Map<string, MarkdownDocumentHistory>>()
    private editor: LexicalEditor | null = null
    private pendingTarget: MarkdownDocumentTarget | null = null
    private switchToken = 0

    get canRedo() { return this.sharedHistoryState.redoStack.length > 0 }
    get canUndo() { return this.sharedHistoryState.undoStack.length > 0 }

    attachEditor(editor: LexicalEditor, target: MarkdownDocumentTarget | null, markdown: string) {
        this.persistActiveDocument()
        this.editor = editor
        for (const sections of this.documents.values()) {
            for (const { historyState } of sections.values()) rebindHistoryState(historyState, editor)
        }
        if (!target) {
            copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
            this.activeTarget = null
            this.pendingTarget = null
            return
        }

        const document = this.requireDocument(target, markdown)
        copyHistoryState(this.sharedHistoryState, document.historyState)
        ensureCurrentEditorState(document.historyState, editor)
        copyHistoryState(this.sharedHistoryState, document.historyState)
        this.activeTarget = target
        this.pendingTarget = null
    }

    detachEditor(editor: LexicalEditor) {
        if (this.editor === editor) this.editor = null
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

    discardTarget(target: MarkdownDocumentTarget) {
        if (sameMarkdownTarget(target, this.activeTarget)) {
            this.discardedTargets.push(target)
            return
        }
        this.documents.get(target.document)?.delete(sectionKey(target))
    }

    discardDocument(document: OpenDocument) {
        if (this.activeTarget?.document === document) this.discardedTargets.push(this.activeTarget)
        this.documents.delete(document)
    }

    replaceDocument(target: MarkdownDocumentTarget, markdown: string) {
        const document = { historyState: createEmptyHistoryState(), markdown }
        this.documentSections(target.document).set(sectionKey(target), document)
        this.removeDiscardedTarget(target)
        if (sameMarkdownTarget(this.activeTarget, target)) {
            const editor = this.editor
            if (!editor) throw new Error('Cannot replace active Markdown history before editor is attached')
            ensureCurrentEditorState(document.historyState, editor)
            copyHistoryState(this.sharedHistoryState, document.historyState)
            this.syncToolbarAvailability(editor)
        }
        this.pendingTarget = null
        this.switchToken += 1
    }

    switchDocument(
        target: MarkdownDocumentTarget | null,
        markdown: string,
        currentMarkdown: string,
        replaceMarkdown: (markdown: string) => void,
    ) {
        const editor = this.editor
        if (!editor) throw new Error('Cannot switch Markdown history before editor is attached')
        if (sameMarkdownTarget(this.activeTarget, target)) return

        this.persistActiveDocument(currentMarkdown)
        if (!target) {
            copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
            replaceMarkdown('')
            this.activeTarget = null
            this.pendingTarget = null
            this.switchToken += 1
            this.syncToolbarAvailability(editor)
            return
        }

        const document = this.requireDocument(target, markdown)
        copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
        replaceMarkdown(markdown)
        this.activeTarget = target
        this.pendingTarget = target
        this.switchToken += 1
        const switchToken = this.switchToken
        queueMicrotask(() => this.completeDocumentSwitch(target, document, editor, switchToken))
    }

    clear() {
        this.documents.clear()
        this.discardedTargets.length = 0
        this.activeTarget = null
        this.pendingTarget = null
        this.switchToken += 1
        copyHistoryState(this.sharedHistoryState, createEmptyHistoryState())
        if (this.editor) this.syncToolbarAvailability(this.editor)
    }

    private completeDocumentSwitch(
        target: MarkdownDocumentTarget,
        document: MarkdownDocumentHistory,
        editor: LexicalEditor,
        switchToken: number,
    ) {
        if (switchToken !== this.switchToken || !sameMarkdownTarget(target, this.pendingTarget)) return
        ensureCurrentEditorState(document.historyState, editor)
        copyHistoryState(this.sharedHistoryState, document.historyState)
        this.pendingTarget = null
        this.syncToolbarAvailability(editor)
    }

    private persistActiveDocument(markdown?: string) {
        const target = this.activeTarget
        if (!target) return
        if (this.removeDiscardedTarget(target)) {
            this.documents.get(target.document)?.delete(sectionKey(target))
            this.pendingTarget = null
            this.switchToken += 1
            return
        }

        const document = this.documents.get(target.document)?.get(sectionKey(target))
        if (!document) throw new Error('Missing Markdown history for active document section')
        if (sameMarkdownTarget(this.pendingTarget, target)) {
            if (markdown !== undefined) document.markdown = markdown
            this.pendingTarget = null
            this.switchToken += 1
            return
        }
        copyHistoryState(document.historyState, this.sharedHistoryState)
        if (markdown !== undefined) document.markdown = markdown
    }

    private requireDocument(target: MarkdownDocumentTarget, markdown: string) {
        const sections = this.documentSections(target.document)
        const key = sectionKey(target)
        const existing = sections.get(key)
        if (existing?.markdown === markdown) return existing

        const document = { historyState: createEmptyHistoryState(), markdown }
        sections.set(key, document)
        return document
    }

    private documentSections(document: OpenDocument) {
        const existing = this.documents.get(document)
        if (existing) return existing
        const sections = new Map<string, MarkdownDocumentHistory>()
        this.documents.set(document, sections)
        return sections
    }

    private removeDiscardedTarget(target: MarkdownDocumentTarget) {
        const index = this.discardedTargets.findIndex((candidate) => sameMarkdownTarget(candidate, target))
        if (index < 0) return false
        this.discardedTargets.splice(index, 1)
        return true
    }
}
