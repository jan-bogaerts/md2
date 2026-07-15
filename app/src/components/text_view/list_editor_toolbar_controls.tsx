import { Button } from '@mui/material'
import { Separator } from '@mdxeditor/editor'
import type { MouseEvent } from 'react'
import { MarkdownDocumentUndoRedo } from '../editor/markdown_document_undo_redo'
import type { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'

interface ListEditorToolbarControlsProps {
    agentConversationCount: number
    documentId: string
    historyStore: MarkdownDocumentHistoryStore
    isAgentPanelOpen: boolean
    isPropertiesOpen: boolean
    onToggleAgentPanel: () => void
    onOpenProperties: (event: MouseEvent<HTMLElement>) => void
    propertiesAvailable: boolean
}

/** Formatting controls and the agent-panel toggle for the list-view editor. */
export function ListEditorToolbarControls(props: ListEditorToolbarControlsProps) {
    const {
        agentConversationCount,
        documentId,
        historyStore,
        isAgentPanelOpen,
        isPropertiesOpen,
        onOpenProperties,
        onToggleAgentPanel,
        propertiesAvailable,
    } = props
    const endControls = (
        <>
            <Separator />
            <Button onClick={onToggleAgentPanel} size="small" variant={isAgentPanelOpen ? 'contained' : 'outlined'}>
                Agents{agentConversationCount > 0 ? ` (${agentConversationCount})` : ''}
            </Button>
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
