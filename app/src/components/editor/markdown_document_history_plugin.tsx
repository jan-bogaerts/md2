import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import { useEffect, useLayoutEffect } from 'react'
import { useDialogError } from '../hooks/use_dialog_error'
import {
    markdownDocumentHistoryConfig$,
    markdownDocumentHistoryStore$,
} from './markdown_document_history_cell'
import { MarkdownDocumentHistoryMonitor } from './markdown_document_history_monitor'

/** Registers the card-scoped history store with MDXEditor's root Lexical editor. */
export function MarkdownDocumentHistoryPlugin() {
    const config = useCellValue(markdownDocumentHistoryConfig$)
    const historyStore = useCellValue(markdownDocumentHistoryStore$)
    const [editor] = useLexicalComposerContext()
    const historyStoreError = historyStore ? null : new Error('Cannot register Markdown history without a history store')
    useDialogError(historyStoreError, 'Markdown history is unavailable')

    useLayoutEffect(() => {
        if (!config || !historyStore) return

        historyStore.attachEditor(editor, config.initialTarget, config.initialMarkdown)

        return () => historyStore.detachEditor(editor)
    }, [config, editor, historyStore])

    useEffect(() => {
        if (!historyStore) return

        const unregister = historyStore.registerEditorHistory(editor)

        return unregister
    }, [editor, historyStore])

    return historyStore ? <MarkdownDocumentHistoryMonitor /> : null
}
