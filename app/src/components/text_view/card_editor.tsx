import { Box } from '@mui/material'
import { memo, useCallback, useEffect, useState, type MouseEvent } from 'react'
import { fileContext } from '../../data/action_context'
import { defaultColumnAccent, type AgentConversation, type CardTypeConfig } from '../../data/data_types'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { MarkdownEditorStateStore } from '../editor/markdown_editor_state_store'
import { openFilesService, type OpenDocumentEventDetail } from '../../services/open_files_service'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'
import { useCardCommits } from '../hooks/use_card_commits'
import { useOpenFiles } from '../hooks/use_open_files'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { CardCommitDiffPanel } from '../card_view/card_commit_diff_panel'
import { ActionPopup } from '../actions/action_popup'
import { CardPropertiesPanel } from './card_properties_panel'
import { CardPropertiesPopover } from './card_properties_popover'

interface CardEditorProps {
    cardTypes: CardTypeConfig[]
    onHeaderFieldChange: (path: string, key: string, value: string) => void
    onTitleChange: (path: string, title: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    projectKey: string
    statusColors: Map<string, string>
    visible: boolean
}

/** Lifetime-stable list card Markdown editor and its private undo store. */
export const CardEditor = memo(function CardEditor(props: CardEditorProps) {
    const { cardTypes, onHeaderFieldChange, onTitleChange, onTogglePolicy, projectKey, statusColors, visible } = props
    const { activeDocument } = useOpenFiles()
    const activeCard = activeDocument?.kind === 'card' ? activeDocument.getObject() : null
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const [stateStore] = useState(() => new MarkdownEditorStateStore())
    const [selection, setSelection] = useState<{ cardId: string, commit: CardCommit } | null>(null)
    const [propertiesAnchorElement, setPropertiesAnchorElement] = useState<HTMLElement | null>(null)
    const [isAgentPopupOpen, setIsAgentPopupOpen] = useState(false)
    const cardCommits = useCardCommits(activeCard?.header.internalId ?? null)
    const selectedCommit = selection && selection.cardId === activeCard?.header.internalId ? selection.commit : null
    const clearSelectedCommit = useCallback(() => setSelection(null), [])
    const selectCommit = useCallback((commit: CardCommit) => {
        const cardId = activeCard?.header.internalId
        if (!cardId) throw new Error('Cannot select card commit without an active card ID')
        setSelection({ cardId, commit })
    }, [activeCard?.header.internalId])

    useEffect(() => {
        if (!activeCard) return
        const documentId = activeCard.header.internalId
        if (!documentId) throw new Error(`Cannot edit card without an internal ID: ${activeCard.path}`)
        cardMarkdownDataSource.setActiveDocument('list-card', documentId)
    }, [activeCard])

    useEffect(() => {
        if (visible) return

        queueMicrotask(() => {
            setPropertiesAnchorElement(null)
            setIsAgentPopupOpen(false)
        })
    }, [visible])

    useEffect(() => {
        const activeCardId = activeCard?.header.internalId ?? null
        setSelection((current) => current && current.cardId !== activeCardId ? null : current)
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
            setSelection((current) => current?.cardId === card.header.internalId ? null : current)
            if (cardMarkdownDataSource.getActiveDocumentId('list-card') === card.header.internalId) {
                cardMarkdownDataSource.setActiveDocument('list-card', null)
            }
        }
        openFilesService.addEventListener('removed', handleRemoved)

        return () => openFilesService.removeEventListener('removed', handleRemoved)
    }, [historyStore])

    useEffect(() => () => cardMarkdownDataSource.setActiveDocument('list-card', null), [])

    const handleConversationViewed = (conversation: AgentConversation) => {
        if (!conversation.cardPath) throw new Error('Cannot acknowledge a project conversation as a card result')

        agentAcknowledgementService.acknowledge(projectKey, conversation.cardPath, [conversation])
    }

    const handleOpenProperties = useCallback((event: MouseEvent<HTMLElement>) => {
        setPropertiesAnchorElement(event.currentTarget)
    }, [])
    const handleCloseProperties = useCallback(() => setPropertiesAnchorElement(null), [])
    const handleToggleAgentPopup = useCallback(() => setIsAgentPopupOpen((current) => !current), [])
    const handleCloseAgentPopup = useCallback(() => setIsAgentPopupOpen(false), [])
    const handleAuthorChange = useCallback((author: string) => {
        if (!activeCard) throw new Error('Cannot change author without an active card')
        onHeaderFieldChange(activeCard.path, 'author', author)
    }, [activeCard, onHeaderFieldChange])
    const handleAutoMergeChange = useCallback(() => {
        if (!activeCard) throw new Error('Cannot change auto-merge policy without an active card')
        onTogglePolicy(activeCard.path, 'autoMerge')
    }, [activeCard, onTogglePolicy])
    const handleTitleChange = useCallback((title: string) => {
        if (!activeCard) throw new Error('Cannot change title without an active card')
        onTitleChange(activeCard.path, title)
    }, [activeCard, onTitleChange])

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
                isPropertiesOpen={!!propertiesAnchorElement}
                onOpenProperties={handleOpenProperties}
                onToggleAgentPopup={handleToggleAgentPopup}
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
        handleOpenProperties,
        handleToggleAgentPopup,
        propertiesAnchorElement,
        selectCommit,
    ])

    const agentPopup = visible && activeCard && isAgentPopupOpen ? (
        <ActionPopup
            anchorElement={null}
            context={fileContext(activeCard, cardTypes)}
            draggable
            key={activeCard.path}
            onClose={handleCloseAgentPopup}
            onConversationViewed={handleConversationViewed}
            open
        />
    ) : null

    const propertiesPopup = activeCard && Object.keys(activeCard.headerFields).length > 0 ? (
        <CardPropertiesPopover
            anchorElement={propertiesAnchorElement}
            onClose={handleCloseProperties}
            open={visible && !!propertiesAnchorElement}
        >
            <CardPropertiesPanel
                affects={activeCard.header.affects}
                author={activeCard.header.author}
                id={activeCard.header.id}
                key={`${activeCard.path}:${activeCard.header.title}:${activeCard.header.author ?? ''}`}
                onAuthorChange={handleAuthorChange}
                onAutoMergeChange={handleAutoMergeChange}
                onTitleChange={handleTitleChange}
                policy={activeCard.header.policy}
                status={activeCard.header.status}
                statusColor={activeCard.header.status
                    ? statusColors.get(activeCard.header.status) ?? defaultColumnAccent(0)
                    : undefined}
                title={activeCard.header.title}
            />
        </CardPropertiesPopover>
    ) : null

    return (
        <>
            <Box hidden={!activeCard} sx={{ display: activeCard ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
                {selectedCommit && activeCard ? (
                    <CardCommitDiffPanel
                        cardPath={activeCard.path}
                        commit={selectedCommit}
                        key={selectedCommit.commit}
                        onExit={clearSelectedCommit}
                    />
                ) : null}
                <Box
                    hidden={!!selectedCommit}
                    sx={{ display: selectedCommit ? 'none' : 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}
                >
                    <MarkdownEditor
                        binding="list-card"
                        dataSource={cardMarkdownDataSource}
                        historyStore={historyStore}
                        stateStore={stateStore}
                        stickyToolbar
                        toolbarContents={toolbarContents}
                    />
                </Box>
            </Box>
            {propertiesPopup}
            {agentPopup}
        </>
    )
})
