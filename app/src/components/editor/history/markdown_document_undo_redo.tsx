import { UndoRedo, activeEditor$, useCellValue } from '@mdxeditor/editor'
import { useEffect } from 'react'
import type { MarkdownDocumentHistoryStore } from './markdown_document_history_store'

interface MarkdownDocumentUndoRedoProps {
    historyKey: string
    historyStore: MarkdownDocumentHistoryStore
}

/** Undo/redo controls initialized from the active document's stored history. */
export function MarkdownDocumentUndoRedo(props: MarkdownDocumentUndoRedoProps) {
    const { historyKey, historyStore } = props
    const activeEditor = useCellValue(activeEditor$)

    useEffect(() => {
        let isCurrentDocument = true
        queueMicrotask(() => {
            if (activeEditor && isCurrentDocument) historyStore.syncToolbarAvailability(activeEditor)
        })

        return () => {
            isCurrentDocument = false
        }
    }, [activeEditor, historyKey, historyStore])

    return <UndoRedo key={historyKey} />
}
