import { Box } from '@mui/material'
import { type NodeApi, Tree } from 'react-arborist'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import { buildFileTree, type TreeNode } from '../../data/file_tree'
import { actionService } from '../../services/actions/action_service'
import { openFilesService, type OpenDocumentObject } from '../../services/open_files_service'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { useActions } from '../hooks/use_actions'
import { useProjectState } from '../hooks/use_project_state'
import { CreateTreeItemDialog, type CreateTreeItemKind } from './create_tree_item_dialog'
import { FileTreeContext, type FileTreeContextValue } from './file_tree_context'
import { FileTreeNodeRow } from './file_tree_node_row'
import { FileTreeRow } from './file_tree_row'
import { FileTreeToolbar } from './file_tree_toolbar'

const TREE_FALLBACK_HEIGHT = 500
const TREE_INDENT = 16
const FILE_ROW_HEIGHT = 34
const GROUP_ROW_HEIGHT = 30
const TREE_VERTICAL_PADDING = 12
const HISTORY_FOLDER_NAME = 'history'
const LOGS_FOLDER_NAME = 'logs'
const EMPTY_CARDS: ProjectCard[] = []
const EMPTY_REPOSITORY_FILES: string[] = []

interface FileTreeViewProps {
    actionsFolder: string
    cardTypes: CardTypeConfig[]
    onCreateFolder: (parentDirectory: string, name: string) => Promise<void>
    onCreateMarkdownFile: (parentDirectory: string, name: string) => Promise<void>
    onDeleteFile: (path: string) => Promise<void>
    onDeleteFolder: (path: string) => Promise<void>
    onLeftPanelInteraction: () => void
    projectFolder: string
    statusColors: Map<string, string>
    workingFolder: string
}

interface CreationRequest {
    kind: CreateTreeItemKind
    parentDirectory: string
}

function treeNodeChildren(node: TreeNode): readonly TreeNode[] | null {
    return node.kind === 'file' ? null : node.children
}

function treeRowHeight(node: NodeApi<TreeNode>): number {
    return node.data.kind === 'file' ? FILE_ROW_HEIGHT : GROUP_ROW_HEIGHT
}

function folderPath(parentFolder: string, childFolder: string) {
    return parentFolder.length > 0 ? `${parentFolder}/${childFolder}` : childFolder
}

function useElementHeight(): [React.RefObject<HTMLDivElement | null>, number] {
    const elementRef = useRef<HTMLDivElement>(null)
    const [height, setHeight] = useState(TREE_FALLBACK_HEIGHT)

    useEffect(() => {
        const element = elementRef.current
        if (!element) throw new Error('Missing file tree container')

        const updateHeight = () => {
            const measuredHeight = element.getBoundingClientRect().height
            if (measuredHeight > 0) setHeight(measuredHeight)
        }

        updateHeight()
        if (typeof ResizeObserver === 'undefined') return undefined

        const observer = new ResizeObserver(updateHeight)
        observer.observe(element)

        return () => observer.disconnect()
    }, [])

    return [elementRef, height]
}

/** Virtualized status/folder tree with compact card rows and hover-only actions. */
export function FileTreeView(props: FileTreeViewProps) {
    const {
        actionsFolder, cardTypes, onCreateFolder, onCreateMarkdownFile, onDeleteFile, onDeleteFolder,
        onLeftPanelInteraction, projectFolder, statusColors, workingFolder,
    } = props
    const { snapshot } = useProjectState()
    const activeCards = snapshot?.activeCards ?? EMPTY_CARDS
    const backgroundCards = snapshot?.backgroundCards ?? EMPTY_CARDS
    const repositoryFiles = snapshot?.repositoryFiles ?? EMPTY_REPOSITORY_FILES
    const { actions } = useActions()
    const specialFolderPaths = useMemo(
        () => [actionsFolder, workingFolder, folderPath(projectFolder, HISTORY_FOLDER_NAME)],
        [actionsFolder, projectFolder, workingFolder],
    )
    const hiddenFolderPaths = useMemo(() => [folderPath(projectFolder, LOGS_FOLDER_NAME)], [projectFolder])
    const nodes = useMemo(() => buildFileTree(activeCards, backgroundCards, workingFolder, {
        actions,
        hiddenFolderPaths,
        projectFolder,
        repositoryFiles,
        specialFolderPaths,
    }), [actions, activeCards, backgroundCards, hiddenFolderPaths, projectFolder, repositoryFiles, specialFolderPaths, workingFolder])
    const cardsByPath = useMemo(() => new Map(
        [...activeCards, ...backgroundCards].map((card) => [card.path, card]),
    ), [activeCards, backgroundCards])
    const objectsByPath = useMemo(() => new Map<string, OpenDocumentObject>([
        ...cardsByPath,
        ...actions
            .filter((action): action is ActionDefinition & { sourcePath: string } => action.sourcePath !== null)
            .map((action) => [action.sourcePath, action] as const),
        ...actionService.getDeletedDraftActions()
            .filter((action): action is ActionDefinition & { sourcePath: string } => action.sourcePath !== null)
            .map((action) => [action.sourcePath, action] as const),
    ]), [actions, cardsByPath])
    const [creationRequest, setCreationRequest] = useState<CreationRequest | null>(null)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [treeContainerRef, treeHeight] = useElementHeight()

    const requestCreate = useCallback((kind: CreateTreeItemKind, parentDirectory: string) => {
        setCreationRequest({ kind, parentDirectory })
    }, [])

    const handleSelectNodes = useCallback((selectedNodes: NodeApi<TreeNode>[]) => {
        setSelectedNodeId(selectedNodes.at(0)?.id ?? null)
    }, [])

    const handleActivateNode = useCallback((node: NodeApi<TreeNode>) => {
        if (node.data.path) {
            const object = objectsByPath.get(node.data.path)
            if (!object) throw new Error(`Cannot open unknown document: ${node.data.path}`)
            setSelectedNodeId(null)
            openFilesService.openDocument(object)
            onLeftPanelInteraction()
            telemetryService.trackEvent('navigation')
            return
        }

        node.toggle()
    }, [objectsByPath, onLeftPanelInteraction])

    const closeCreationDialog = () => {
        setCreationRequest(null)
    }

    const createItem = async (name: string) => {
        if (!creationRequest) throw new Error('Missing tree creation request')

        if (creationRequest.kind === 'folder') {
            await onCreateFolder(creationRequest.parentDirectory, name)
            return
        }

        await onCreateMarkdownFile(creationRequest.parentDirectory, name)
    }

    const treeContext: FileTreeContextValue = useMemo(() => ({
        cardTypes,
        cardsByPath,
        onDeleteFile,
        onDeleteFolder,
        onRequestCreate: requestCreate,
        statusColors,
    }), [cardTypes, cardsByPath, onDeleteFile, onDeleteFolder, requestCreate, statusColors])

    return (
        <FileTreeContext.Provider value={treeContext}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <FileTreeToolbar
                    nodes={nodes}
                    onRequestCreate={requestCreate}
                    projectFolder={projectFolder}
                    selectedNodeId={selectedNodeId}
                />
                <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
                    <Box ref={treeContainerRef} sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
                        <Tree<TreeNode>
                            childrenAccessor={treeNodeChildren}
                            data={nodes}
                            disableDrag
                            disableEdit
                            disableMultiSelection
                            height={treeHeight}
                            indent={TREE_INDENT}
                            onActivate={handleActivateNode}
                            onSelect={handleSelectNodes}
                            openByDefault
                            overscanCount={4}
                            paddingBottom={TREE_VERTICAL_PADDING}
                            paddingTop={TREE_VERTICAL_PADDING}
                            renderRow={FileTreeRow}
                            rowHeight={treeRowHeight}
                            selection={selectedNodeId ?? undefined}
                            width="100%"
                        >
                            {FileTreeNodeRow}
                        </Tree>
                    </Box>
                </Box>
                {creationRequest ? (
                    <CreateTreeItemDialog
                        kind={creationRequest.kind}
                        onClose={closeCreationDialog}
                        onCreate={createItem}
                        open
                        parentDirectory={creationRequest.parentDirectory}
                    />
                ) : null}
            </Box>
        </FileTreeContext.Provider>
    )
}
