import { Button } from '@mui/material'
import { Separator } from '@mdxeditor/editor'
import { useCallback, useSyncExternalStore, type MouseEvent } from 'react'
import { actionContextIdentity, fileContext } from '../../data/action_context'
import type { CardTypeConfig } from '../../data/data_types'
import { cardPopupService, subscribeCardPopups } from '../../services/card_popup_service'
import { dialogService } from '../../services/dialog_service'
import { CardCommitMenu } from '../card_view/card_commit_menu'
import { listCardCommitDiffDataSource } from '../card_view/list_card_commit_diff_data_source'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownDocumentUndoRedo } from '../editor/markdown_document_undo_redo'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'
import { useActiveCard } from '../hooks/use_active_card'
import { useCardCommits } from '../hooks/use_card_commits'
import { useProjectState } from '../hooks/use_project_state'
import { CardPropertiesControl } from './card_properties_control'

function ignoreUnavailableWorktreeSelection() {
    // List editor exposes historical commits only.
}

interface ListEditorToolbarControlsProps {
    cardTypes: CardTypeConfig[]
    historyStore: MarkdownDocumentHistoryStore
    readOnly: boolean
    statusColors: Map<string, string>
}

/** Formatting controls and card-specific controls for the active list-card document. */
export function ListEditorToolbarControls(props: ListEditorToolbarControlsProps) {
    const { cardTypes, historyStore, readOnly, statusColors } = props
    const card = useActiveCard('list-card')
    const cardInternalId = card?.header.internalId ?? null
    const historyKey = cardInternalId ?? card?.path ?? null
    const cardCommits = useCardCommits(cardInternalId)
    const { project } = useProjectState()
    const popupEntries = useSyncExternalStore(
        subscribeCardPopups,
        () => cardPopupService.getSnapshot(),
        () => cardPopupService.getSnapshot(),
    )
    const context = card && cardInternalId ? fileContext(card, cardTypes) : null
    const contextIdentity = context ? actionContextIdentity(context) : null
    const isAgentPopupOpen = !!contextIdentity && popupEntries.some((entry) => (
        entry.kind === 'action' && actionContextIdentity(entry.context) === contextIdentity
    ))

    const handleToggleAgentPopup = useCallback((event: MouseEvent<HTMLButtonElement>) => {
        try {
            const activeDocumentId = cardMarkdownDataSource.getActiveDocument('list-card')?.getObject().header.internalId
            if (!activeDocumentId) throw new Error('Cannot open card agents without an active list-card document')
            if (!context || !project) throw new Error('Cannot open card agents without a loaded project')

            cardPopupService.toggleAction(context, event.currentTarget)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card agents could not be opened' })
        }
    }, [context, project])

    if (!card || !historyKey) return null

    const endControls = cardInternalId ? (
        <>
            <Separator />
            {!readOnly ? (
                <Button onClick={handleToggleAgentPopup} size="small" variant={isAgentPopupOpen ? 'contained' : 'outlined'}>
                    Agents{card.agentConversations.length > 0 ? ` (${card.agentConversations.length})` : ''}
                </Button>
            ) : null}
            <CardCommitMenu
                commits={cardCommits.commits}
                currentWorktreeAvailable={false}
                error={cardCommits.error}
                onSelectCommit={listCardCommitDiffDataSource.select}
                onSelectWorktree={ignoreUnavailableWorktreeSelection}
            />
            {!readOnly ? (
                <CardPropertiesControl
                    binding="list-card"
                    cardTypes={cardTypes}
                    statusColors={statusColors}
                />
            ) : null}
        </>
    ) : undefined
    const undoRedoControls = <MarkdownDocumentUndoRedo historyKey={historyKey} historyStore={historyStore} />

    return (
        <MarkdownFormatToolbarControls endControls={endControls} readOnly={readOnly} undoRedoControls={undoRedoControls} />
    )
}
