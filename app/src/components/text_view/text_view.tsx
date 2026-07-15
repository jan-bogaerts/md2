import { Box, Typography } from '@mui/material'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { buildFileTree, fileLabel } from '../../data/file_tree'
import type { ActionDefinition } from '../../data/action_types'
import { getCardIdPrefix } from '../../data/card_identifiers'
import { defaultColumnAccent, type CardTypeConfig, type ProjectCard, type StateConfig } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'
import { markdownParsingService } from '../../services/markdown_parsing_service'
import { ActionEditor } from '../actions/action_editor'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { LeftPanelSlot } from '../shell/left_panel_slot'
import { CardPropertiesPanel } from './card_properties_panel'
import { CardPropertiesPopover } from './card_properties_popover'
import { FileTreeView } from './file_tree_view'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'
import { TabBar, type OpenTab, type OpenTabKind } from './tab_bar'
import { useOpenTabs } from './use_open_tabs'
import { useActions } from '../hooks/use_actions'

const HISTORY_FOLDER_NAME = 'history'

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
        requestedNonce,
        requestedPath,
        repositoryFiles,
        states,
        workingFolder,
    } = props
    const { actions } = useActions()
    const [propertiesAnchorElement, setPropertiesAnchorElement] = useState<HTMLElement | null>(null)
    const [markdownHistoryStore] = useState(() => new MarkdownDocumentHistoryStore())
    const onDeleteFileRef = useRef(onDeleteFile)
    const onDeleteFolderRef = useRef(onDeleteFolder)
    const onLeftPanelInteractionRef = useRef(onLeftPanelInteraction)

    const specialFolderPaths = useMemo(
        () => [actionsFolder, workingFolder, folderPath(projectFolder, HISTORY_FOLDER_NAME)],
        [actionsFolder, projectFolder, workingFolder],
    )
    const specialContextTypes = useMemo(() => specialFolderPaths.map(folderName), [specialFolderPaths])
    const tree = useMemo(() => buildFileTree(activeCards, backgroundCards, workingFolder, {
        actions,
        projectFolder,
        repositoryFiles,
        specialFolderPaths,
    }), [actions, activeCards, backgroundCards, projectFolder, repositoryFiles, specialFolderPaths, workingFolder])
    const actionsByPath = useMemo(() => new Map(
        actions
            .filter((action): action is ActionDefinition & { sourcePath: string } => action.sourcePath !== null)
            .map((action) => [action.sourcePath, action]),
    ), [actions])
    const cardsByPath = useMemo(() => {
        const map = new Map<string, ProjectCard>()
        for (const card of [...activeCards, ...backgroundCards]) map.set(card.path, card)

        return map
    }, [activeCards, backgroundCards])
    const availablePaths = useMemo(() => [...cardsByPath.keys(), ...actionsByPath.keys()], [actionsByPath, cardsByPath])
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

    const openTabs = tabs.map((path) => tabData(actionsByPath, cardsByPath, cardTypes, actionsFolder, path))
    const activeCard = activePath ? cardsByPath.get(activePath) ?? null : null
    const activeAction = activePath ? actionsByPath.get(activePath) ?? null : null
    const mountedEditorPath = useDeferredValue(activePath)
    const mountedCard = mountedEditorPath ? cardsByPath.get(mountedEditorPath) ?? null : null

    useEffect(() => {
        markdownHistoryStore.retainDocuments(tabs)
    }, [markdownHistoryStore, mountedEditorPath, tabs])

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

    const handleEditorChange = (documentId: string, body: string) => {
        onBodyChange(documentId, body)
    }

    const handleOpenProperties = (event: ReactMouseEvent<HTMLElement>) => {
        setPropertiesAnchorElement(event.currentTarget)
    }

    const handleCloseProperties = () => {
        setPropertiesAnchorElement(null)
    }

    const listEditorToolbarContents = useCallback(() => {
        if (!mountedEditorPath) throw new Error('Cannot render the Markdown toolbar without a document path')

        return (
            <ListEditorToolbarControls
                documentId={mountedEditorPath}
                historyStore={markdownHistoryStore}
                isPropertiesOpen={!!propertiesAnchorElement}
                onOpenProperties={handleOpenProperties}
                propertiesAvailable={!!mountedCard && Object.keys(mountedCard.headerFields).length > 0}
            />
        )
    }, [markdownHistoryStore, mountedCard, mountedEditorPath, propertiesAnchorElement])

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
                    sx={{
                        alignItems: activeCard || activeAction ? undefined : 'center',
                        display: activeCard || activeAction ? 'block' : 'flex',
                        flex: 1,
                        justifyContent: activeCard ? undefined : 'center',
                        overflow: 'auto',
                        p: activeCard ? 0 : 2,
                    }}
                >
                    {activeAction ? (
                        <ActionEditor
                            key={activeAction.sourcePath ?? undefined}
                            action={activeAction}
                            actions={actions}
                            cardTypes={cardTypes.map(({ type }) => type)}
                            repositoryFiles={repositoryFiles}
                            specialContextTypes={specialContextTypes}
                            states={states.map(({ state }) => state)}
                        />
                    ) : mountedCard && mountedEditorPath ? (
                        <MarkdownEditor
                            documentId={mountedEditorPath}
                            historyStore={markdownHistoryStore}
                            markdown={mountedCard.content}
                            onDocumentChange={handleEditorChange}
                            stickyToolbar
                            toolbarContents={listEditorToolbarContents}
                        />
                    ) : (
                        <Typography color="text.secondary" variant="body2">
                            Select a file from the tree to open it.
                        </Typography>
                    )}
                </Box>
            </Box>
            {propertiesPopup}
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
