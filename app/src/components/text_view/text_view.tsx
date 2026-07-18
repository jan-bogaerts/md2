import { Box, Typography } from '@mui/material'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { buildFileTree, fileLabel } from '../../data/file_tree'
import type { ActionDefinition } from '../../data/action_types'
import { fileContext } from '../../data/action_context'
import { getCardIdPrefix } from '../../data/card_identifiers'
import { defaultColumnAccent, type CardTypeConfig, type ProjectCard, type StateConfig } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { markdownParsingService } from '../../services/data/markdown_parsing_service'
import { actionService } from '../../services/actions/action_service'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { ActionEditor } from '../actions/action_editor'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor, type MarkdownEditorHandle } from '../editor/markdown_editor'
import type { MarkdownDocumentConfig, MarkdownDocumentOwnerConfig } from '../editor/markdown_document_config'
import { LeftPanelSlot } from '../shell/left_panel_slot'
import { CardPropertiesPanel } from './card_properties_panel'
import { CardPropertiesPopover } from './card_properties_popover'
import { FileTreeView } from './file_tree_view'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'
import { TabBar, type OpenTab, type OpenTabKind } from './tab_bar'
import { useOpenTabs } from './use_open_tabs'
import { useActions } from '../hooks/use_actions'
import { ActionPopup } from '../actions/action_popup'
import type { AgentConversation } from '../../data/data_types'

const HISTORY_FOLDER_NAME = 'history'
const LOGS_FOLDER_NAME = 'logs'
const EMPTY_MARKDOWN_DOCUMENT_ID = '__text-view-empty__'

function cardMarkdownDocumentId(projectKey: string, path: string) {
    return JSON.stringify([projectKey, path])
}

interface TextViewProps {
    actionsFolder: string
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
    cardTypes: CardTypeConfig[]
    onLeftPanelInteraction: () => void
    onBodyChange: (path: string, body: string) => void
    onCreateFolder: (parentDirectory: string, name: string) => Promise<void>
    onCreateMarkdownFile: (parentDirectory: string, name: string) => Promise<void>
    onDeleteFile: (path: string) => Promise<void>
    onDeleteFolder: (path: string) => Promise<void>
    onHeaderFieldChange: (path: string, key: string, value: string) => void
    onTitleChange: (path: string, title: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    projectFolder: string
    projectKey: string
    requestedNonce: number
    requestedPath: string | null
    repositoryFiles: string[]
    states: StateConfig[]
    workingFolder: string
}

function cardTypeColor(card: ProjectCard, cardTypes: CardTypeConfig[]) {
    const idPrefix = getCardIdPrefix(card.header.id)
    const cardType = cardTypes.find((candidate) => candidate.idPrefix === idPrefix)

    return cardType?.color ?? null
}

function isPathInFolder(path: string, folder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedFolder = folder.replace(/\\/gu, '/').replace(/\/+$/u, '')

    return normalizedPath.startsWith(`${normalizedFolder}/`)
}

function tabKind(card: ProjectCard, actionsFolder: string): OpenTabKind {
    if (isPathInFolder(card.path, actionsFolder)) return 'action'
    if (typeof card.headerFields.id === 'string' || markdownParsingService.followsCardNamingConvention(card.path)) return 'card'

    return 'markdown'
}

function tabData(
    actionsByPath: Map<string, ActionDefinition>,
    cardsByPath: Map<string, ProjectCard>,
    cardTypes: CardTypeConfig[],
    actionsFolder: string,
    path: string,
): OpenTab {
    const action = actionsByPath.get(path)
    if (action) {
        return { color: null, id: null, kind: 'action', label: action.label, path, title: action.label }
    }
    const card = cardsByPath.get(path)
    const label = card ? fileLabel(card) : path
    const id = card && label.startsWith(`${card.header.id} `) ? card.header.id : null

    return {
        color: card ? cardTypeColor(card, cardTypes) : null,
        id,
        kind: card ? tabKind(card, actionsFolder) : 'markdown',
        label,
        path,
        title: id ? label.slice(id.length + 1) : label,
    }
}

function folderPath(parentFolder: string, childFolder: string) {
    return parentFolder.length > 0 ? `${parentFolder}/${childFolder}` : childFolder
}

function folderName(path: string): string {
    const name = path.replace(/\\/gu, '/').split('/').filter((part) => part.length > 0).at(-1)
    if (!name) throw new Error(`Cannot derive context type from folder path: ${path}`)

    return name
}

/** Text view: a folder/status tree plus tabbed, editable open files. */
export function TextView(props: TextViewProps) {
    const {
        actionsFolder,
        activeCards,
        backgroundCards,
        cardTypes,
        onLeftPanelInteraction,
        onBodyChange,
        onCreateFolder,
        onCreateMarkdownFile,
        onDeleteFile,
        onDeleteFolder,
        onHeaderFieldChange,
        onTitleChange,
        onTogglePolicy,
        projectFolder,
        projectKey,
        requestedNonce,
        requestedPath,
        repositoryFiles,
        states,
        workingFolder,
    } = props
    const { actions } = useActions()
    const [propertiesAnchorElement, setPropertiesAnchorElement] = useState<HTMLElement | null>(null)
    const [isAgentPopupOpen, setIsAgentPopupOpen] = useState(false)
    const [markdownHistoryStore] = useState(() => new MarkdownDocumentHistoryStore())
    const [actionMarkdownOwners, setActionMarkdownOwners] = useState(() => new Map<string, MarkdownDocumentOwnerConfig>())
    const actionMarkdownOwnersRef = useRef(actionMarkdownOwners)
    const actionMarkdownDocumentsRef = useRef(new Map<string, MarkdownDocumentConfig>())
    const markdownEditorRef = useRef<MarkdownEditorHandle>(null)
    const onDeleteFileRef = useRef(onDeleteFile)
    const onDeleteFolderRef = useRef(onDeleteFolder)
    const onLeftPanelInteractionRef = useRef(onLeftPanelInteraction)

    const specialFolderPaths = useMemo(
        () => [actionsFolder, workingFolder, folderPath(projectFolder, HISTORY_FOLDER_NAME)],
        [actionsFolder, projectFolder, workingFolder],
    )
    const specialContextTypes = useMemo(() => specialFolderPaths.map(folderName), [specialFolderPaths])
    const hiddenFolderPaths = useMemo(() => [folderPath(projectFolder, LOGS_FOLDER_NAME)], [projectFolder])
    const tree = useMemo(() => buildFileTree(activeCards, backgroundCards, workingFolder, {
        actions,
        hiddenFolderPaths,
        projectFolder,
        repositoryFiles,
        specialFolderPaths,
    }), [actions, activeCards, backgroundCards, hiddenFolderPaths, projectFolder, repositoryFiles, specialFolderPaths, workingFolder])
    const actionsByPath = useMemo(() => new Map(
        actions
            .filter((action): action is ActionDefinition & { sourcePath: string } => action.sourcePath !== null)
            .map((action) => [action.sourcePath, action]),
    ), [actions])
    const editorActionsByPath = useMemo(() => new Map([
        ...actionsByPath,
        ...actionService.getDeletedDraftActions()
            .filter((action): action is ActionDefinition & { sourcePath: string } => action.sourcePath !== null)
            .map((action) => [action.sourcePath, action] as const),
    ]), [actionsByPath])
    const cardsByPath = useMemo(() => {
        const map = new Map<string, ProjectCard>()
        for (const card of [...activeCards, ...backgroundCards]) map.set(card.path, card)

        return map
    }, [activeCards, backgroundCards])
    const cardMarkdownDocumentIdsByPath = useMemo(() => new Map(
        [...cardsByPath.keys()].map((path) => [path, cardMarkdownDocumentId(projectKey, path)]),
    ), [cardsByPath, projectKey])
    const cardPathsByMarkdownDocumentId = useMemo(() => new Map(
        [...cardMarkdownDocumentIdsByPath].map(([path, documentId]) => [documentId, path]),
    ), [cardMarkdownDocumentIdsByPath])
    const availablePaths = useMemo(
        () => [...cardsByPath.keys(), ...editorActionsByPath.keys()],
        [cardsByPath, editorActionsByPath],
    )
    const { activePath, activateTab, closeTab, openTab, tabs } = useOpenTabs(availablePaths)
    const statusColors = useMemo(() => new Map(
        tree
            .filter((node) => node.kind === 'status')
            .map((node, index) => {
                const configuredState = states.find(({ state }) => state === node.label)

                return [node.label, configuredState?.color ?? defaultColumnAccent(index)]
            }),
    ), [states, tree])

    useEffect(() => {
        onDeleteFileRef.current = onDeleteFile
        onDeleteFolderRef.current = onDeleteFolder
        onLeftPanelInteractionRef.current = onLeftPanelInteraction
    })

    useEffect(() => {
        if (requestedPath) openTab(requestedPath)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedNonce])

    const openTabs = tabs.map((path) => tabData(editorActionsByPath, cardsByPath, cardTypes, actionsFolder, path))
    const activeCard = activePath ? cardsByPath.get(activePath) ?? null : null
    const activeAction = activePath ? editorActionsByPath.get(activePath) ?? null : null
    const mountedEditorPath = useDeferredValue(activePath)
    const mountedCard = mountedEditorPath ? cardsByPath.get(mountedEditorPath) ?? null : null
    const mountedMarkdownDocumentId = mountedEditorPath
        ? cardMarkdownDocumentIdsByPath.get(mountedEditorPath) ?? null
        : null

    const handleConversationViewed = (conversation: AgentConversation) => {
        if (!conversation.cardPath) throw new Error('Cannot acknowledge a project conversation as a card result')

        agentAcknowledgementService.acknowledge(projectKey, conversation.cardPath, [conversation])
    }

    useEffect(() => {
        const cardDocumentIds = tabs.flatMap((path) => {
            const documentId = cardMarkdownDocumentIdsByPath.get(path)

            return documentId ? [documentId] : []
        })
        const actionDocumentIds = tabs.flatMap((path) => actionMarkdownOwners.get(path)?.documentIds ?? [])
        markdownHistoryStore.retainDocuments([EMPTY_MARKDOWN_DOCUMENT_ID, ...cardDocumentIds, ...actionDocumentIds])
    }, [actionMarkdownOwners, cardMarkdownDocumentIdsByPath, markdownHistoryStore, mountedEditorPath, tabs])

    useEffect(() => {
        const openPaths = new Set(tabs)
        const closedOwners = [...actionMarkdownOwnersRef.current.entries()].filter(([path]) => !openPaths.has(path))
        if (closedOwners.length === 0) return

        const next = new Map(actionMarkdownOwnersRef.current)
        for (const [path, owner] of closedOwners) {
            next.delete(path)
            for (const documentId of owner.documentIds) actionMarkdownDocumentsRef.current.delete(documentId)
        }
        actionMarkdownOwnersRef.current = next
        setActionMarkdownOwners(next)
    }, [tabs])

    const handleSelect = useCallback((path: string) => {
        openTab(path)
        onLeftPanelInteractionRef.current()
        telemetryService.trackEvent('navigation')
    }, [openTab])

    const handleDeleteFile = useCallback(async (path: string) => {
        await onDeleteFileRef.current(path)
        closeTab(path)
        onLeftPanelInteractionRef.current()
    }, [closeTab])

    const handleDeleteFolder = useCallback(async (path: string) => {
        await onDeleteFolderRef.current(path)
        for (const tabPath of tabs) {
            if (isPathInFolder(tabPath, path)) closeTab(tabPath)
        }
        onLeftPanelInteractionRef.current()
    }, [closeTab, tabs])

    const handleActivateTab = (path: string) => {
        activateTab(path)
        telemetryService.trackEvent('navigation')
    }

    const handleMarkdownDocumentChange = useCallback((documentId: string, body: string) => {
        const actionDocument = actionMarkdownDocumentsRef.current.get(documentId)
        if (actionDocument) {
            actionDocument.onChange(body)
            return
        }
        const cardPath = cardPathsByMarkdownDocumentId.get(documentId)
        if (!cardPath) throw new Error(`Unknown TextView Markdown document: ${documentId}`)
        onBodyChange(cardPath, body)
    }, [cardPathsByMarkdownDocumentId, onBodyChange])

    const handleMarkdownDocumentEdit = useCallback((documentId: string, body: string) => {
        actionMarkdownDocumentsRef.current.get(documentId)?.onEdit?.(body)
    }, [])

    const handleActionMarkdownDocumentOwnerChange = useCallback((owner: MarkdownDocumentOwnerConfig) => {
        const current = actionMarkdownOwnersRef.current
        if (current.get(owner.ownerPath) === owner) return

        const previousOwner = current.get(owner.ownerPath)
        const retainedDocumentIds = new Set(owner.documentIds)
        for (const documentId of previousOwner?.documentIds ?? []) {
            if (!retainedDocumentIds.has(documentId)) actionMarkdownDocumentsRef.current.delete(documentId)
        }
        if (owner.activeDocument) {
            actionMarkdownDocumentsRef.current.set(owner.activeDocument.documentId, owner.activeDocument)
        }
        const next = new Map(current)
        next.set(owner.ownerPath, owner)
        actionMarkdownOwnersRef.current = next
        setActionMarkdownOwners(next)
    }, [])

    const handleDiscardMarkdownDocument = useCallback((documentId: string, markdown: string) => {
        markdownEditorRef.current?.setMarkdown(markdown)
        markdownHistoryStore.discardDocument(documentId)
        actionMarkdownDocumentsRef.current.delete(documentId)
    }, [markdownHistoryStore])

    const handleOpenProperties = (event: ReactMouseEvent<HTMLElement>) => {
        setPropertiesAnchorElement(event.currentTarget)
    }

    const handleCloseProperties = () => {
        setPropertiesAnchorElement(null)
    }

    const handleToggleAgentPopup = () => setIsAgentPopupOpen((current) => !current)
    const handleCloseAgentPopup = () => setIsAgentPopupOpen(false)

    const listEditorToolbarContents = useCallback(() => {
        if (!mountedEditorPath || !mountedMarkdownDocumentId) {
            throw new Error('Cannot render the Markdown toolbar without a document path')
        }

        return (
            <ListEditorToolbarControls
                agentConversationCount={mountedCard?.agentConversations.length ?? 0}
                documentId={mountedMarkdownDocumentId}
                historyStore={markdownHistoryStore}
                isAgentPopupOpen={isAgentPopupOpen}
                isPropertiesOpen={!!propertiesAnchorElement}
                onOpenProperties={handleOpenProperties}
                onToggleAgentPopup={handleToggleAgentPopup}
                propertiesAvailable={!!mountedCard && Object.keys(mountedCard.headerFields).length > 0}
            />
        )
    }, [isAgentPopupOpen, markdownHistoryStore, mountedCard, mountedEditorPath, mountedMarkdownDocumentId, propertiesAnchorElement])

    const cardMarkdownDocument = useMemo<MarkdownDocumentConfig | null>(() => (
        mountedCard && mountedEditorPath && mountedMarkdownDocumentId ? {
            documentId: mountedMarkdownDocumentId,
            markdown: mountedCard.content,
            onChange: (body) => onBodyChange(mountedEditorPath, body),
            ownerPath: mountedEditorPath,
            stickyToolbar: true,
            toolbarContents: listEditorToolbarContents,
        } : null
    ), [listEditorToolbarContents, mountedCard, mountedEditorPath, mountedMarkdownDocumentId, onBodyChange])
    const actionMarkdownDocument = activeAction?.sourcePath
        ? actionMarkdownOwners.get(activeAction.sourcePath)?.activeDocument ?? null
        : null
    const activeMarkdownDocument = activeAction ? actionMarkdownDocument : cardMarkdownDocument
    const renderedMarkdownDocument = activeMarkdownDocument ?? {
        documentId: EMPTY_MARKDOWN_DOCUMENT_ID,
        markdown: '',
        onChange: () => undefined,
        ownerPath: EMPTY_MARKDOWN_DOCUMENT_ID,
    }

    const agentPopup = activeCard && isAgentPopupOpen ? (
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
            open={!!propertiesAnchorElement}
        >
            <CardPropertiesPanel
                affects={activeCard.header.affects}
                author={activeCard.header.author}
                id={activeCard.header.id}
                key={`${activeCard.path}:${activeCard.header.title}:${activeCard.header.author ?? ''}`}
                onAuthorChange={(author) => onHeaderFieldChange(activeCard.path, 'author', author)}
                onAutoMergeChange={() => onTogglePolicy(activeCard.path, 'autoMerge')}
                onTitleChange={(title) => onTitleChange(activeCard.path, title)}
                policy={activeCard.header.policy}
                status={activeCard.header.status}
                statusColor={activeCard.header.status
                    ? statusColors.get(activeCard.header.status) ?? defaultColumnAccent(0)
                    : undefined}
                title={activeCard.header.title}
            />
        </CardPropertiesPopover>
    ) : null

    const editorPane = (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
            {activeCard || activeAction ? (
                <TabBar activePath={activePath} onActivate={handleActivateTab} onClose={closeTab} tabs={openTabs} />
            ) : null}
            <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                <Box
                    data-testid="editor-content-pane"
                    sx={{
                        alignItems: activeCard || activeAction ? undefined : 'center',
                        display: 'flex',
                        flex: 1,
                        flexDirection: 'column',
                        justifyContent: activeCard ? undefined : 'center',
                        minHeight: 0,
                        overflow: activeAction ? 'hidden' : 'auto',
                        p: activeCard || activeAction ? 0 : 2,
                    }}
                >
                    {activeAction ? (
                        <ActionEditor
                            key={activeAction.id}
                            action={activeAction}
                            actions={actions}
                            cardTypes={cardTypes.map(({ type }) => type)}
                            discardMarkdownDocument={handleDiscardMarkdownDocument}
                            markdownDocumentNamespace={projectKey}
                            onMarkdownDocumentOwnerChange={handleActionMarkdownDocumentOwnerChange}
                            repositoryFiles={repositoryFiles}
                            specialContextTypes={specialContextTypes}
                            states={states.map(({ state }) => state)}
                        />
                    ) : !mountedCard ? (
                        <Typography color="text.secondary" variant="body2">
                            Select a file from the tree to open it.
                        </Typography>
                    ) : null}
                    <Box hidden={!activeMarkdownDocument} sx={{ flex: 1, minHeight: 0, order: 1, overflowY: 'auto' }}>
                        <MarkdownEditor
                            documentId={renderedMarkdownDocument.documentId}
                            flushOnBlur={renderedMarkdownDocument.flushOnBlur}
                            historyStore={markdownHistoryStore}
                            markdown={renderedMarkdownDocument.markdown}
                            onDocumentChange={handleMarkdownDocumentChange}
                            onDocumentEdit={handleMarkdownDocumentEdit}
                            placeholders={renderedMarkdownDocument.placeholders}
                            ref={markdownEditorRef}
                            stickyToolbar={renderedMarkdownDocument.stickyToolbar}
                            toolbarContents={renderedMarkdownDocument.toolbarContents}
                        />
                    </Box>
                </Box>
            </Box>
            {propertiesPopup}
            {agentPopup}
        </Box>
    )

    return (
        <>
            <LeftPanelSlot>
                <Box
                    aria-label="File tree"
                    sx={{ bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
                >
                    <FileTreeView
                        cardTypes={cardTypes}
                        cardsByPath={cardsByPath}
                        nodes={tree}
                        onCreateFolder={onCreateFolder}
                        onCreateMarkdownFile={onCreateMarkdownFile}
                        onDeleteFile={handleDeleteFile}
                        onDeleteFolder={handleDeleteFolder}
                        onSelect={handleSelect}
                        projectFolder={projectFolder}
                        selectedPath={activePath}
                        statusColors={statusColors}
                    />
                </Box>
            </LeftPanelSlot>
            <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {editorPane}
            </Box>
        </>
    )
}
