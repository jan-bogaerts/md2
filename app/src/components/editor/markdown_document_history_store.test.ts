import { createEditor } from 'lexical'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownDocumentHistoryStore } from './markdown_document_history_store'

function historyEntry(editor: ReturnType<typeof createEditor>) {
    return { editor, editorState: editor.getEditorState() }
}

describe('MarkdownDocumentHistoryStore', () => {
    it('restores each document undo and redo stack when one editor switches documents', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        const alphaUndo = historyEntry(editor)
        const alphaRedo = historyEntry(editor)
        const replaceMarkdown = vi.fn()
        historyStore.attachEditor(editor, 'alpha.md', '# Alpha')
        historyStore.sharedHistoryState.undoStack.push(alphaUndo)
        historyStore.sharedHistoryState.redoStack.push(alphaRedo)

        historyStore.switchDocument('beta.md', '# Beta', '# Alpha edited', replaceMarkdown)
        await Promise.resolve()

        expect(replaceMarkdown).toHaveBeenLastCalledWith('# Beta')
        expect(historyStore.sharedHistoryState.undoStack).toEqual([])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([])

        historyStore.switchDocument('alpha.md', '# Alpha edited', '# Beta', replaceMarkdown)
        await Promise.resolve()

        expect(replaceMarkdown).toHaveBeenLastCalledWith('# Alpha edited')
        expect(historyStore.sharedHistoryState.undoStack).toEqual([alphaUndo])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([alphaRedo])
    })

    it('discards stale history when a card changed outside its editor session', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        historyStore.attachEditor(editor, 'alpha.md', '# Alpha')
        historyStore.sharedHistoryState.undoStack.push(historyEntry(editor))
        historyStore.switchDocument('beta.md', '# Beta', '# Alpha edited', vi.fn())
        await Promise.resolve()

        historyStore.switchDocument('alpha.md', '# Alpha changed externally', '# Beta', vi.fn())
        await Promise.resolve()

        expect(historyStore.sharedHistoryState.undoStack).toEqual([])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([])
    })

    it('does not record a programmatic document load as an undoable card edit', async () => {
        const editor = createEditor()
        const historyStore = new MarkdownDocumentHistoryStore()
        historyStore.attachEditor(editor, 'alpha.md', '# Alpha')

        historyStore.switchDocument('beta.md', '# Beta', '# Alpha', () => {
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
        historyStore.attachEditor(editor, 'alpha.md', '# Alpha')
        historyStore.sharedHistoryState.undoStack.push(alphaUndo)
        historyStore.sharedHistoryState.redoStack.push(alphaRedo)
        historyStore.switchDocument('beta.md', '# Beta', '# Alpha edited', vi.fn())
        await Promise.resolve()
        historyStore.sharedHistoryState.undoStack.push(betaUndo)
        historyStore.sharedHistoryState.redoStack.push(betaRedo)
        historyStore.switchDocument('alpha.md', '# Alpha edited', '# Beta edited', vi.fn())
        await Promise.resolve()

        historyStore.discardDocument('alpha.md')
        historyStore.switchDocument('beta.md', '# Beta edited', '# Alpha edited', vi.fn())
        await Promise.resolve()
        expect(historyStore.sharedHistoryState.undoStack).toEqual([betaUndo])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([betaRedo])

        historyStore.switchDocument('alpha.md', '# Alpha edited', '# Beta edited', vi.fn())
        await Promise.resolve()
        expect(historyStore.sharedHistoryState.undoStack).toEqual([])
        expect(historyStore.sharedHistoryState.redoStack).toEqual([])
    })
})
