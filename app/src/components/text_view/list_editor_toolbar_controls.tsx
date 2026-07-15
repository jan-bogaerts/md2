import { Button } from '@mui/material'
import { Separator } from '@mdxeditor/editor'
import type { MouseEvent } from 'react'
import { MarkdownDocumentUndoRedo } from '../editor/markdown_document_undo_redo'
import type { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'

interface ListEditorToolbarControlsProps {
    documentId: string
    historyStore: MarkdownDocumentHistoryStore
    isPropertiesOpen: boolean
    onOpenProperties: (event: MouseEvent<HTMLElement>) => void
    propertiesAvailable: boolean
}

/** Formatting controls and the agent-panel toggle for the list-view editor. */
export function ListEditorToolbarControls(props: ListEditorToolbarControlsProps) {
    const {isPropertiesOpen, documentId, historyStore, onOpenProperties, propertiesAvailable} = props
    const endControls = (
        <>
            <Separator />
            {propertiesAvailable ? (
                <Button
                    aria-haspopup="dialog"
                    onClick={onOpenProperties}
                    size="small"
                    variant={isPropertiesOpen ? 'contained' : 'outlined'}
                >
                    Properties
                </Button>
            ) : null}
        </>
    )

    const undoRedoControls = <MarkdownDocumentUndoRedo documentId={documentId} historyStore={historyStore} />

    return <MarkdownFormatToolbarControls endControls={endControls} undoRedoControls={undoRedoControls} />
}
