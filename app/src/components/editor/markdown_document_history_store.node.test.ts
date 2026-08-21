import { createEditor } from 'lexical'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import type { ActionOpenDocument, CardOpenDocument } from '../../services/open_files_service'
import type { MarkdownDocumentTarget } from './markdown_data_source'

function historyEntry(editor: ReturnType<typeof createEditor>) {
    return { editor, editorState: editor.getEditorState() }
}

function target(): MarkdownDocumentTarget {
    return { document: Object.assign(new EventTarget(), { kind: 'card' as const }) as CardOpenDocument }
}

function actionTargets() {
    const document = Object.assign(new EventTarget(), { kind: 'action' as const }) as ActionOpenDocument

    return {
        phrase: { document, section: { identity: 'phrase-1', kind: 'phrase' as const } },
        prompt: { document, section: { kind: 'prompt' as const } },
    }
}

describe('MarkdownDocumentHistoryStore', () => {
    it('restores each document undo and redo stack when one editor switches documents', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        const alphaUndo = historyEntry(editor)
        const alphaRedo = historyEntry(editor)
        const replaceMarkdown = vi.fn()
        const alpha = target()
        const beta = target()
        historyStore.attachEditor(editor, alpha, '# Alpha')
        historyStore.sharedHistoryState.undoStack.push(alphaUndo)
        historyStore.sharedHistoryState.redoStack.push(alphaRedo)

        historyStore.switchDocument(beta, '# Beta', '# Alpha edited', replaceMarkdown)
        await Promise.resolve()

        expect(replaceMarkdown).toHaveBeenLastCalledWith('# Beta')
        expect(historyStore.sharedHistoryState.undoStack).toEqual([])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([])

        historyStore.switchDocument(alpha, '# Alpha edited', '# Beta', replaceMarkdown)
        await Promise.resolve()

        expect(replaceMarkdown).toHaveBeenLastCalledWith('# Alpha edited')
        expect(historyStore.sharedHistoryState.undoStack).toEqual([alphaUndo])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([alphaRedo])
    })

    it('restores independent prompt and phrase histories within one action document', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        const promptUndo = historyEntry(editor)
        const promptRedo = historyEntry(editor)
        const phraseUndo = historyEntry(editor)
        const { phrase, prompt } = actionTargets()
        historyStore.attachEditor(editor, prompt, 'Prompt')
        historyStore.sharedHistoryState.undoStack.push(promptUndo)
        historyStore.sharedHistoryState.redoStack.push(promptRedo)

        historyStore.switchDocument(phrase, 'Phrase', 'Edited prompt', vi.fn())
        await Promise.resolve()
        historyStore.sharedHistoryState.undoStack.push(phraseUndo)

        historyStore.switchDocument(prompt, 'Edited prompt', 'Edited phrase', vi.fn())
        await Promise.resolve()
        expect(historyStore.sharedHistoryState.undoStack).toEqual([promptUndo])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([promptRedo])

        historyStore.switchDocument(phrase, 'Edited phrase', 'Edited prompt', vi.fn())
        await Promise.resolve()
        expect(historyStore.sharedHistoryState.undoStack).toEqual([phraseUndo])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([])
    })

    it('discards stale history when a card changed outside its editor session', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        const alpha = target()
        const beta = target()
        historyStore.attachEditor(editor, alpha, '# Alpha')
        historyStore.sharedHistoryState.undoStack.push(historyEntry(editor))
        historyStore.switchDocument(beta, '# Beta', '# Alpha edited', vi.fn())
        await Promise.resolve()

        historyStore.switchDocument(alpha, '# Alpha changed externally', '# Beta', vi.fn())
        await Promise.resolve()

        expect(historyStore.sharedHistoryState.undoStack).toEqual([])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([])
    })

    it('replaces one document with empty history after an external content change', () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        const alpha = target()
        historyStore.attachEditor(editor, alpha, '# Alpha')
        historyStore.sharedHistoryState.undoStack.push(historyEntry(editor))
        historyStore.sharedHistoryState.redoStack.push(historyEntry(editor))

        historyStore.replaceDocument(alpha, '# Alpha external')

        expect(historyStore.canUndo).toBe(false)
        expect(historyStore.canRedo).toBe(false)
    })

    it('does not record a programmatic document load as an undoable card edit', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        const alpha = target()
        const beta = target()
        historyStore.attachEditor(editor, alpha, '# Alpha')

        historyStore.switchDocument(beta, '# Beta', '# Alpha', () => {
            historyStore.sharedHistoryState.undoStack.push(historyEntry(editor))
        })
        await Promise.resolve()

        expect(historyStore.canUndo).toBe(false)
        expect(historyStore.canRedo).toBe(false)
    })

    it('discards only the requested document history', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        const alphaUndo = historyEntry(editor)
        const alphaRedo = historyEntry(editor)
        const betaUndo = historyEntry(editor)
        const betaRedo = historyEntry(editor)
        const alpha = target()
        const beta = target()
        historyStore.attachEditor(editor, alpha, '# Alpha')
        historyStore.sharedHistoryState.undoStack.push(alphaUndo)
        historyStore.sharedHistoryState.redoStack.push(alphaRedo)
        historyStore.switchDocument(beta, '# Beta', '# Alpha edited', vi.fn())
        await Promise.resolve()
        historyStore.sharedHistoryState.undoStack.push(betaUndo)
        historyStore.sharedHistoryState.redoStack.push(betaRedo)
        historyStore.switchDocument(alpha, '# Alpha edited', '# Beta edited', vi.fn())
        await Promise.resolve()

        historyStore.discardDocument(alpha.document)
        historyStore.switchDocument(beta, '# Beta edited', '# Alpha edited', vi.fn())
        await Promise.resolve()
        expect(historyStore.sharedHistoryState.undoStack).toEqual([betaUndo])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([betaRedo])

        historyStore.switchDocument(alpha, '# Alpha edited', '# Beta edited', vi.fn())
        await Promise.resolve()
        expect(historyStore.sharedHistoryState.undoStack).toEqual([])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([])
    })
})
