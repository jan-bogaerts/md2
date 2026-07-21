import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import { useEffect } from 'react'
import { markdownDocumentHistoryStore$ } from './markdown_document_history_cell'
import { MarkdownDocumentHistoryMonitor } from './markdown_document_history_monitor'

/** Registers the card-scoped history store with MDXEditor's root Lexical editor. */
export function MarkdownDocumentHistoryPlugin() {
    const historyStore = useCellValue(markdownDocumentHistoryStore$)
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!historyStore) throw new Error('Cannot register Markdown history without a history store')

        const unregister = historyStore.registerEditorHistory(editor)

        return () => {
            unregister()
            historyStore.detachEditor(editor)
        }
    }, [editor, historyStore])

    return <MarkdownDocumentHistoryMonitor />
}
