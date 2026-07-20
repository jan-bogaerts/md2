import { Box, Typography } from '@mui/material'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildFileTree, fileLabel } from '../../data/file_tree'
import type { ActionDefinition } from '../../data/action_types'
import { fileContext } from '../../data/action_context'
import { getCardIdPrefix } from '../../data/card_identifiers'
import { defaultColumnAccent, type CardTypeConfig, type ProjectCard, type StateConfig } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { markdownParsingService } from '../../services/data/markdown_parsing_service'
import { actionService } from '../../services/actions/action_service'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { ListActionEditor } from '../actions/list_action_editor'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { actionMarkdownDataSource, parseActionMarkdownDocumentId } from '../editor/action_markdown_data_source'
import { LeftPanelSlot } from '../shell/left_panel_slot'
import { CardPropertiesPanel } from './card_properties_panel'
import { CardPropertiesPopover } from './card_properties_popover'
import { FileTreeView } from './file_tree_view'
import { TabBar, type OpenTab, type OpenTabKind } from './tab_bar'
import { useOpenTabs } from './use_open_tabs'
import { useActions } from '../hooks/use_actions'
import { ActionPopup } from '../actions/action_popup'
import type { AgentConversation } from '../../data/data_types'
import type { OpenDocument } from '../../services/open_files_service'
import { CardEditor } from './card_editor'

const HISTORY_FOLDER_NAME = 'history'
const LOGS_FOLDER_NAME = 'logs'
interface TextViewProps {
    actionsFolder: string
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
    cardTypes: CardTypeConfig[]
    onLeftPanelInteraction: () => void
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
    visible: boolean
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
    cardTypes: CardTypeConfig[],
    actionsFolder: string,
    document: OpenDocument,
): OpenTab {
    const object = document.getObject()
    if (document.kind === 'action') {
        const action = object as ActionDefinition
        if (!action.sourcePath) throw new Error(`Open action has no source path: ${action.id}`)
        return { color: null, document, id: null, kind: 'action', label: action.label, path: action.sourcePath, title: action.label }
    }
    const card = object as ProjectCard
    const label = fileLabel(card)
    const id = label.startsWith(`${card.header.id} `) ? card.header.id : null

    return {
        color: cardTypeColor(card, cardTypes),
        document,
        id,
        kind: tabKind(card, actionsFolder),
        label,
        path: card.path,
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

function openDocumentPath(document: OpenDocument) {
    const object = document.getObject()
    if (document.kind === 'card') return (object as ProjectCard).path

    const { sourcePath } = object as ActionDefinition
    if (!sourcePath) throw new Error(`Open action has no source path: ${object.id}`)
    return sourcePath
}

/** Text view: a folder/status tree plus tabbed, editable open files. */
export function TextView(props: TextViewProps) {
    const {
        actionsFolder,
        activeCards,
        backgroundCards,
        cardTypes,
        onLeftPanelInteraction,
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
        visible,
    } = props
    const { actions } = useActions()
    const [propertiesAnchorElement, setPropertiesAnchorElement] = useState<HTMLElement | null>(null)
    const [isAgentPopupOpen, setIsAgentPopupOpen] = useState(false)
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
    const { activeDocument, activateTab, closeTab, openTab, tabs } = useOpenTabs()
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
        if (visible) return

        queueMicrotask(() => {
            setPropertiesAnchorElement(null)
            setIsAgentPopupOpen(false)
        })
    }, [visible])

    useEffect(() => {
        if (!requestedPath) return

        const object = editorActionsByPath.get(requestedPath) ?? cardsByPath.get(requestedPath)
        if (object) openTab(object)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedNonce])

    const openTabs = tabs.map((document) => tabData(cardTypes, actionsFolder, document))
    const activeObject = activeDocument?.getObject() ?? null
    const activeCard = activeDocument?.kind === 'card' ? activeObject as ProjectCard : null
    const activeAction = activeDocument?.kind === 'action' ? activeObject as ActionDefinition : null
    const activePath = activeDocument ? openDocumentPath(activeDocument) : null
    const listActionDocumentId = actionMarkdownDataSource.getActiveDocumentId('list-action')
    const listActionId = listActionDocumentId ? parseActionMarkdownDocumentId(listActionDocumentId).actionId : null
    const boundActionDocument = listActionId
        ? tabs.find((document) => document.kind === 'action'
            && (document.getObject() as ActionDefinition).id === listActionId)
        : null
    const boundAction = boundActionDocument?.getObject() as ActionDefinition | undefined
    const listAction = activeAction ?? boundAction ?? null

    useEffect(() => {
        if (!activeCard) return
        const documentId = activeCard.header.internalId
        if (!documentId) throw new Error(`Cannot edit card without an internal ID: ${activeCard.path}`)
        cardMarkdownDataSource.setActiveDocument('list-card', documentId)
    }, [activeCard])

    const handleConversationViewed = (conversation: AgentConversation) => {
        if (!conversation.cardPath) throw new Error('Cannot acknowledge a project conversation as a card result')

        agentAcknowledgementService.acknowledge(projectKey, conversation.cardPath, [conversation])
    }

    const handleSelect = useCallback((path: string) => {
        const object = editorActionsByPath.get(path) ?? cardsByPath.get(path)
        if (!object) throw new Error(`Cannot open unknown document: ${path}`)
        openTab(object)
        onLeftPanelInteractionRef.current()
        telemetryService.trackEvent('navigation')
    }, [cardsByPath, editorActionsByPath, openTab])

    const handleDeleteFile = useCallback(async (path: string) => {
        await onDeleteFileRef.current(path)
        onLeftPanelInteractionRef.current()
    }, [])

    const handleDeleteFolder = useCallback(async (path: string) => {
        await onDeleteFolderRef.current(path)
        onLeftPanelInteractionRef.current()
    }, [])

    const handleActivateTab = (document: OpenDocument) => {
        activateTab(document)
        telemetryService.trackEvent('navigation')
    }

    const handleOpenProperties = (event: ReactMouseEvent<HTMLElement>) => {
        setPropertiesAnchorElement(event.currentTarget)
    }

    const handleCloseProperties = () => {
        setPropertiesAnchorElement(null)
    }

    const handleToggleAgentPopup = () => setIsAgentPopupOpen((current) => !current)
    const handleCloseAgentPopup = () => setIsAgentPopupOpen(false)


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
                <TabBar activeDocument={activeDocument} onActivate={handleActivateTab} onClose={closeTab} tabs={openTabs} />
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
                    <Box hidden={!activeAction} sx={{ display: activeAction ? 'contents' : 'none' }}>
                        <ListActionEditor
                            action={listAction}
                            actions={actions}
                            cardTypes={cardTypes.map(({ type }) => type)}
                            markdownDocumentNamespace={projectKey}
                            repositoryFiles={repositoryFiles}
                            specialContextTypes={specialContextTypes}
                            states={states.map(({ state }) => state)}
                        />
                    </Box>
                    {!activeAction && !activeCard ? (
                        <Typography color="text.secondary" variant="body2">
                            Select a file from the tree to open it.
                        </Typography>
                    ) : null}
                    <CardEditor
                        activeCard={activeCard}
                        hidden={!activeCard}
                        isAgentPopupOpen={isAgentPopupOpen}
                        isPropertiesOpen={!!propertiesAnchorElement}
                        onOpenProperties={handleOpenProperties}
                        onToggleAgentPopup={handleToggleAgentPopup}
                    />
                </Box>
            </Box>
            {propertiesPopup}
            {agentPopup}
        </Box>
    )

    return (
        <>
            {visible ? <LeftPanelSlot>
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
            </LeftPanelSlot> : null}
            <Box hidden={!visible} sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {editorPane}
            </Box>
        </>
    )
}
