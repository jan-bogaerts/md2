import { Button } from '@mui/material'
import { Separator } from '@mdxeditor/editor'
import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { fileContext } from '../../data/action_context'
import type { AgentConversation, CardTypeConfig } from '../../data/data_types'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { ActionPopup } from '../actions/action_popup'
import { CardCommitMenu } from '../card_view/card_commit_menu'
import { listCardCommitDiffDataSource } from '../card_view/list_card_commit_diff_data_source'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownDocumentUndoRedo } from '../editor/markdown_document_undo_redo'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'
import { useActiveCard } from '../hooks/use_active_card'
import { useCardCommits } from '../hooks/use_card_commits'
import { CardPropertiesPanel } from './card_properties_panel'
import { CardPropertiesPopover } from './card_properties_popover'

interface ListEditorToolbarControlsProps {
    cardTypes: CardTypeConfig[]
    historyStore: MarkdownDocumentHistoryStore
    statusColors: Map<string, string>
}

interface PropertiesAnchor {
    documentId: string
    element: HTMLElement
}

/** Formatting controls and card-specific controls for the active list-card document. */
export function ListEditorToolbarControls(props: ListEditorToolbarControlsProps) {
    const { cardTypes, historyStore, statusColors } = props
    const card = useActiveCard('list-card')
    const documentId = card?.header.internalId ?? null
    const cardCommits = useCardCommits(documentId)
    const [agentPopupDocumentId, setAgentPopupDocumentId] = useState<string | null>(null)
    const [propertiesAnchor, setPropertiesAnchor] = useState<PropertiesAnchor | null>(null)
    const isAgentPopupOpen = !!documentId && agentPopupDocumentId === documentId
    const isPropertiesOpen = !!documentId && propertiesAnchor?.documentId === documentId

    useEffect(() => {
        const closeTransientOverlays = () => {
            setAgentPopupDocumentId(null)
            setPropertiesAnchor(null)
        }

        queueMicrotask(closeTransientOverlays)
    }, [documentId])

    useEffect(() => {
        const handleWorkspaceViewChanged = () => {
            if (workspaceViewService.getSnapshot().viewMode === 'text') return

            setAgentPopupDocumentId(null)
            setPropertiesAnchor(null)
        }

        workspaceViewService.addEventListener('changed', handleWorkspaceViewChanged)

        return () => workspaceViewService.removeEventListener('changed', handleWorkspaceViewChanged)
    }, [])

    const handleConversationViewed = (conversation: AgentConversation) => {
        if (!conversation.cardPath) throw new Error('Cannot acknowledge a project conversation as a card result')

        agentAcknowledgementService.acknowledge(cardMarkdownDataSource.getProjectKey(), conversation.cardPath, [conversation])
    }
    const handleOpenProperties = useCallback((event: MouseEvent<HTMLElement>) => {
        const activeDocumentId = cardMarkdownDataSource.getActiveDocument('list-card')?.getObject().header.internalId
        if (!activeDocumentId) throw new Error('Cannot open card properties without an active list-card document')

        setPropertiesAnchor({ documentId: activeDocumentId, element: event.currentTarget })
    }, [])
    const handleCloseProperties = useCallback(() => setPropertiesAnchor(null), [])
    const handleToggleAgentPopup = useCallback(() => {
        const activeDocumentId = cardMarkdownDataSource.getActiveDocument('list-card')?.getObject().header.internalId
        if (!activeDocumentId) throw new Error('Cannot open card agents without an active list-card document')

        setAgentPopupDocumentId((current) => current === activeDocumentId ? null : activeDocumentId)
    }, [])
    const handleCloseAgentPopup = useCallback(() => setAgentPopupDocumentId(null), [])

    if (!card || !documentId) return null

    const propertiesAvailable = Object.keys(card.headerFields).length > 0
    const endControls = (
        <>
            <Separator />
            <Button onClick={handleToggleAgentPopup} size="small" variant={isAgentPopupOpen ? 'contained' : 'outlined'}>
                Agents{card.agentConversations.length > 0 ? ` (${card.agentConversations.length})` : ''}
            </Button>
            <CardCommitMenu commits={cardCommits.commits} error={cardCommits.error} onSelect={listCardCommitDiffDataSource.select} />
            {propertiesAvailable ? (
                <Button
                    aria-haspopup="dialog"
                    onClick={handleOpenProperties}
                    size="small"
                    variant={isPropertiesOpen ? 'contained' : 'outlined'}
                >
                    Properties
                </Button>
            ) : null}
        </>
    )
    const undoRedoControls = <MarkdownDocumentUndoRedo historyKey={documentId} historyStore={historyStore} />

    return (
        <>
            <MarkdownFormatToolbarControls endControls={endControls} undoRedoControls={undoRedoControls} />
            <CardPropertiesPopover
                anchorElement={isPropertiesOpen ? propertiesAnchor.element : null}
                onClose={handleCloseProperties}
                open={isPropertiesOpen}
            >
                <CardPropertiesPanel statusColors={statusColors} />
            </CardPropertiesPopover>
            {isAgentPopupOpen ? (
                <ActionPopup
                    anchorElement={null}
                    context={fileContext(card, cardTypes)}
                    draggable
                    onClose={handleCloseAgentPopup}
                    onConversationViewed={handleConversationViewed}
                    open
                />
            ) : null}
        </>
    )
}
