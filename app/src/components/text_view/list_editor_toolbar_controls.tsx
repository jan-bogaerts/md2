import { Button } from '@mui/material'
import { Separator } from '@mdxeditor/editor'
import type { MouseEvent } from 'react'
import { MarkdownDocumentUndoRedo } from '../editor/markdown_document_undo_redo'
import type { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'
import { CardCommitMenu } from '../card_view/card_commit_menu'
import type { CardCommit } from '../../services/actions/card_commit_history'

interface ListEditorToolbarControlsProps {
    agentConversationCount: number
    cardCommits: CardCommit[]
    cardCommitsError: Error | null
    documentId: string
    historyStore: MarkdownDocumentHistoryStore
    isAgentPopupOpen: boolean
    isPropertiesOpen: boolean
    onToggleAgentPopup: () => void
    onSelectCardCommit: (commit: CardCommit) => void
    onOpenProperties: (event: MouseEvent<HTMLElement>) => void
    propertiesAvailable: boolean
}

/** Formatting controls and the agent-panel toggle for the list-view editor. */
export function ListEditorToolbarControls(props: ListEditorToolbarControlsProps) {
    const {
        agentConversationCount,
        cardCommits,
        cardCommitsError,
        documentId,
        historyStore,
        isAgentPopupOpen,
        isPropertiesOpen,
        onOpenProperties,
        onToggleAgentPopup,
        onSelectCardCommit,
        propertiesAvailable,
    } = props
    const endControls = (
        <>
            <Separator />
            <Button onClick={onToggleAgentPopup} size="small" variant={isAgentPopupOpen ? 'contained' : 'outlined'}>
                Agents{agentConversationCount > 0 ? ` (${agentConversationCount})` : ''}
            </Button>
            <CardCommitMenu commits={cardCommits} error={cardCommitsError} onSelect={onSelectCardCommit} />
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
