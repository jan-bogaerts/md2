import { Box } from '@mui/material'
import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { MarkdownEditorStateStore } from '../editor/markdown_editor_state_store'
import { openFilesService, type OpenDocumentEventDetail } from '../../services/open_files_service'
import type { ProjectCard } from '../../data/data_types'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'

interface CardEditorProps {
    activeCard: ProjectCard | null
    hidden: boolean
    isAgentPopupOpen: boolean
    isPropertiesOpen: boolean
    onOpenProperties: (event: MouseEvent<HTMLElement>) => void
    onToggleAgentPopup: () => void
}

/** Lifetime-stable list card Markdown editor and its private undo store. */
export function CardEditor(props: CardEditorProps) {
    const { activeCard, hidden, isAgentPopupOpen, isPropertiesOpen, onOpenProperties, onToggleAgentPopup } = props
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const [stateStore] = useState(() => new MarkdownEditorStateStore())

    useEffect(() => {
        const handleRemoved = (event: Event) => {
            const { document } = (event as CustomEvent<OpenDocumentEventDetail>).detail
            if (document.kind !== 'card') return

            const card = document.getObject() as ProjectCard
            if (!card.header.internalId) throw new Error(`Cannot discard card history without an internal ID: ${card.path}`)
            historyStore.discardDocument(card.header.internalId)
            if (cardMarkdownDataSource.getActiveDocumentId('list-card') === card.header.internalId) {
                cardMarkdownDataSource.setActiveDocument('list-card', null)
            }
        }
        openFilesService.addEventListener('removed', handleRemoved)

        return () => openFilesService.removeEventListener('removed', handleRemoved)
    }, [historyStore])

    useEffect(() => () => cardMarkdownDataSource.setActiveDocument('list-card', null), [])

    const toolbarContents = useCallback(() => {
        const documentId = activeCard?.header.internalId
        if (!documentId) return null

        return (
            <ListEditorToolbarControls
                agentConversationCount={activeCard.agentConversations.length}
                documentId={documentId}
                historyStore={historyStore}
                isAgentPopupOpen={isAgentPopupOpen}
                isPropertiesOpen={isPropertiesOpen}
                onOpenProperties={onOpenProperties}
                onToggleAgentPopup={onToggleAgentPopup}
                propertiesAvailable={Object.keys(activeCard.headerFields).length > 0}
            />
        )
    }, [activeCard, historyStore, isAgentPopupOpen, isPropertiesOpen, onOpenProperties, onToggleAgentPopup])

    return (
        <Box hidden={hidden} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <MarkdownEditor
                binding="list-card"
                dataSource={cardMarkdownDataSource}
                historyStore={historyStore}
                stateStore={stateStore}
                stickyToolbar
                toolbarContents={toolbarContents}
            />
        </Box>
    )
}
