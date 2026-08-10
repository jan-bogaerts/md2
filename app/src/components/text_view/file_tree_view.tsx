import { Box } from '@mui/material'
import { type NodeApi, Tree, type TreeApi } from 'react-arborist'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_ARCHIVED_FOLDER, DEFAULT_RELEASES_FOLDER, type CardTypeConfig, type Card } from '../../data/data_types'
import { buildFileTree, type TreeNode } from '../../data/file_tree'
import { actionService } from '../../services/actions/action_service'
import { dialogService } from '../../services/dialog_service'
import { openFilesService } from '../../services/open_files_service'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { useActionFileTreeActions } from '../hooks/use_action_file_tree_actions'
import { useProjectState } from '../hooks/use_project_state'
import { CreateTreeItemDialog, type CreateTreeItemKind } from './create_tree_item_dialog'
import { FileTreeContext, type FileTreeContextValue } from './file_tree_context'
import { FileTreeNodeRow } from './file_tree_node_row'
import { FileTreeRow } from './file_tree_row'
import { FileTreeToolbar } from './file_tree_toolbar'

const TREE_FALLBACK_HEIGHT = 500
const TREE_INDENT = 16
const TREE_ROW_HEIGHT = 28
const TREE_VERTICAL_PADDING = 4
const LOGS_FOLDER_NAME = 'logs'
const EMPTY_CARDS: Card[] = []
const EMPTY_REPOSITORY_FILES: string[] = []

interface FileTreeViewProps {
    actionsFolder: string
    archivedFolder?: string
    cardTypes: CardTypeConfig[]
    onCreateFolder: (parentDirectory: string, name: string) => Promise<void>
    onCreateMarkdownFile: (parentDirectory: string, name: string) => Promise<void>
    onDeleteFile: (path: string) => Promise<void>
    onDeleteFolder: (path: string) => Promise<void>
    onLeftPanelInteraction: () => void
    projectFolder: string
    releasesFolder?: string
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

function treeDefaultOpenState(nodes: TreeNode[]): Record<string, boolean> {
    const openState: Record<string, boolean> = {}
    const pendingNodes = [...nodes]

    for (const node of pendingNodes) {
        if (node.kind === 'file') continue
        openState[node.id] = node.kind === 'status'
        pendingNodes.push(...node.children)
    }

    return openState
}

function folderPath(parentFolder: string, childFolder: string) {
    return parentFolder.length > 0 ? `${parentFolder}/${childFolder}` : childFolder
}

function useElementHeight(): [React.RefObject<HTMLDivElement | null>, number] {
    const elementRef = useRef<HTMLDivElement>(null)
    const missingElementReportedRef = useRef(false)
    const [height, setHeight] = useState(TREE_FALLBACK_HEIGHT)

    useEffect(() => {
        const element = elementRef.current
        if (!element) {
            if (!missingElementReportedRef.current) {
                missingElementReportedRef.current = true
                dialogService.error(new Error('Missing file tree container'), {fallbackMessage: 'File tree could not be displayed'})
            }
            return
        }

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
        actionsFolder,
        archivedFolder = folderPath(props.projectFolder, DEFAULT_ARCHIVED_FOLDER),
        cardTypes,
        onCreateFolder,
        onCreateMarkdownFile,
        onDeleteFile,
        onDeleteFolder,
        onLeftPanelInteraction,
        projectFolder,
        releasesFolder = folderPath(props.projectFolder, DEFAULT_RELEASES_FOLDER),
        statusColors,
        workingFolder,
    } = props
    const { snapshot } = useProjectState()
    const activeCards = snapshot?.activeCards ?? EMPTY_CARDS
    const backgroundCards = snapshot?.backgroundCards ?? EMPTY_CARDS
    const repositoryFiles = snapshot?.repositoryFiles ?? EMPTY_REPOSITORY_FILES
    const actions = useActionFileTreeActions()
    const specialFolderPaths = useMemo(
        () => [actionsFolder, workingFolder, releasesFolder, archivedFolder],
        [actionsFolder, archivedFolder, releasesFolder, workingFolder],
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
    const [creationRequest, setCreationRequest] = useState<CreationRequest | null>(null)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [treeContainerRef, treeHeight] = useElementHeight()
    const treeRef = useRef<TreeApi<TreeNode> | undefined>(undefined)
    const [initialOpenState] = useState(() => treeDefaultOpenState(nodes))
    const initializedBranchIdsRef = useRef(new Set(Object.keys(initialOpenState)))

    useEffect(() => {
        const tree = treeRef.current
        if (!tree) return

        const defaultOpenState = treeDefaultOpenState(nodes)
        for (const [nodeId, isOpen] of Object.entries(defaultOpenState)) {
            if (initializedBranchIdsRef.current.has(nodeId)) continue
            initializedBranchIdsRef.current.add(nodeId)
            if (isOpen) tree.open(nodeId)
            else tree.close(nodeId)
        }
    }, [nodes])

    const requestCreate = useCallback((kind: CreateTreeItemKind, parentDirectory: string) => {
        setCreationRequest({ kind, parentDirectory })
    }, [])

    const handleSelectNodes = useCallback((selectedNodes: NodeApi<TreeNode>[]) => {
        setSelectedNodeId(selectedNodes.at(0)?.id ?? null)
    }, [])

    const handleActivateNode = useCallback((node: NodeApi<TreeNode>) => {
        try {
            if (node.data.path) {
                const object = cardsByPath.get(node.data.path) ?? actionService.getActionByPath(node.data.path)
                if (!object) throw new Error(`Cannot open unknown document: ${node.data.path}`)
                setSelectedNodeId(null)
                openFilesService.openDocument(object)
                onLeftPanelInteraction()
                telemetryService.trackEvent('navigation')
                return
            }

            node.toggle()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Tree item could not be opened' })
        }
    }, [cardsByPath, onLeftPanelInteraction])

    const closeCreationDialog = () => {
        setCreationRequest(null)
    }

    const createItem = async (name: string) => {
        try {
            if (!creationRequest) throw new Error('Missing tree creation request')

            if (creationRequest.kind === 'folder') {
                await onCreateFolder(creationRequest.parentDirectory, name)
                return true
            }

            await onCreateMarkdownFile(creationRequest.parentDirectory, name)
            return true
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Tree item could not be created' })

            return false
        }
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
                            ref={treeRef}
                            childrenAccessor={treeNodeChildren}
                            data={nodes}
                            disableDrag
                            disableEdit
                            disableMultiSelection
                            height={treeHeight}
                            indent={TREE_INDENT}
                            initialOpenState={initialOpenState}
                            onActivate={handleActivateNode}
                            onSelect={handleSelectNodes}
                            openByDefault={false}
                            overscanCount={4}
                            paddingBottom={TREE_VERTICAL_PADDING}
                            paddingTop={TREE_VERTICAL_PADDING}
                            renderRow={FileTreeRow}
                            rowHeight={TREE_ROW_HEIGHT}
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
