import { Box } from '@mui/material'
import { memo, useCallback, useEffect, useState, type MouseEvent } from 'react'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { MarkdownEditorStateStore } from '../editor/markdown_editor_state_store'
import { openFilesService, type OpenDocumentEventDetail } from '../../services/open_files_service'
import type { ProjectCard } from '../../data/data_types'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'
import { useCardCommits } from '../hooks/use_card_commits'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { CardCommitDiffPanel } from '../card_view/card_commit_diff_panel'

interface CardEditorProps {
    activeCard: ProjectCard | null
    hidden: boolean
    isAgentPopupOpen: boolean
    isPropertiesOpen: boolean
    onOpenProperties: (event: MouseEvent<HTMLElement>) => void
    onToggleAgentPopup: () => void
}

/** Lifetime-stable list card Markdown editor and its private undo store. */
export const CardEditor = memo(function CardEditor(props: CardEditorProps) {
    const { activeCard, hidden, isAgentPopupOpen, isPropertiesOpen, onOpenProperties, onToggleAgentPopup } = props
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const [stateStore] = useState(() => new MarkdownEditorStateStore())
    const [selection, setSelection] = useState<{ cardId: string, commit: CardCommit } | null>(null)
    const cardCommits = useCardCommits(activeCard?.header.internalId ?? null)
    const selectedCommit = selection && selection.cardId === activeCard?.header.internalId ? selection.commit : null
    const clearSelectedCommit = useCallback(() => setSelection(null), [])
    const selectCommit = useCallback((commit: CardCommit) => {
        const cardId = activeCard?.header.internalId
        if (!cardId) throw new Error('Cannot select card commit without an active card ID')
        setSelection({ cardId, commit })
    }, [activeCard?.header.internalId])

    useEffect(() => {
        if (!selectedCommit) return undefined
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            clearSelectedCommit()
        }
        window.addEventListener('keydown', handleKeyDown, true)

        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [clearSelectedCommit, selectedCommit])

    useEffect(() => {
        const handleRemoved = (event: Event) => {
            const { document } = (event as CustomEvent<OpenDocumentEventDetail>).detail
            if (document.kind !== 'card') return

            const card = document.getObject()
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
                cardCommits={cardCommits.commits}
                cardCommitsError={cardCommits.error}
                documentId={documentId}
                historyStore={historyStore}
                isAgentPopupOpen={isAgentPopupOpen}
                isPropertiesOpen={isPropertiesOpen}
                onOpenProperties={onOpenProperties}
                onToggleAgentPopup={onToggleAgentPopup}
                onSelectCardCommit={selectCommit}
                propertiesAvailable={Object.keys(activeCard.headerFields).length > 0}
            />
        )
    }, [
        activeCard,
        cardCommits.commits,
        cardCommits.error,
        historyStore,
        isAgentPopupOpen,
        isPropertiesOpen,
        onOpenProperties,
        onToggleAgentPopup,
        selectCommit,
    ])

    return (
        <Box hidden={hidden} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {selectedCommit && activeCard ? (
                <CardCommitDiffPanel
                    cardPath={activeCard.path}
                    commit={selectedCommit}
                    key={selectedCommit.commit}
                    onExit={clearSelectedCommit}
                />
            ) : (
                <MarkdownEditor
                    binding="list-card"
                    dataSource={cardMarkdownDataSource}
                    historyStore={historyStore}
                    stateStore={stateStore}
                    stickyToolbar
                    toolbarContents={toolbarContents}
                />
            )}
        </Box>
    )
})
