import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import { useEffect } from 'react'
import { useDialogError } from '../hooks/use_dialog_error'
import {
    markdownDocumentHistoryConfig$,
    markdownDocumentHistoryStore$,
} from './markdown_document_history_cell'
import { monitorMarkdownDocumentHistory } from './markdown_document_history_monitor'

/** Registers the card-scoped history store with MDXEditor's root Lexical editor. */
export function MarkdownDocumentHistoryPlugin() {
    const config = useCellValue(markdownDocumentHistoryConfig$)
    const historyStore = useCellValue(markdownDocumentHistoryStore$)
    const [editor] = useLexicalComposerContext()
    const configurationError = config ? null : new Error('Cannot register Markdown history without configuration')
    const historyStoreError = historyStore ? null : new Error('Cannot register Markdown history without a history store')
    useDialogError(configurationError, 'Markdown history monitoring is unavailable')
    useDialogError(historyStoreError, 'Markdown history is unavailable')

    useEffect(() => {
        if (!config || !historyStore) return

        const target = config.getTarget()
        const markdown = target ? config.dataSource.getMarkdown(target) : config.initialMarkdown
        historyStore.attachEditor(editor, target, markdown)
        const unregisterEditorHistory = historyStore.registerEditorHistory(editor)
        const stopMonitoring = monitorMarkdownDocumentHistory(config)

        return () => {
            stopMonitoring()
            unregisterEditorHistory()
            historyStore.detachEditor(editor)
        }
    }, [config, editor, historyStore])

    return null
}
