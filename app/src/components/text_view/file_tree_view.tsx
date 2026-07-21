import { Box } from '@mui/material'
import { type NodeApi, Tree } from 'react-arborist'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import type { TreeNode } from '../../data/file_tree'
import { openFilesService, type OpenDocumentObject } from '../../services/open_files_service'
import { telemetryService } from '../../services/telemetry/telemetry_service'
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

interface FileTreeViewProps {
    cardTypes: CardTypeConfig[]
    cardsByPath: Map<string, ProjectCard>
    nodes: TreeNode[]
    objectsByPath: Map<string, OpenDocumentObject>
    onCreateFolder: (parentDirectory: string, name: string) => Promise<void>
    onCreateMarkdownFile: (parentDirectory: string, name: string) => Promise<void>
    onDeleteFile: (path: string) => Promise<void>
    onDeleteFolder: (path: string) => Promise<void>
    onLeftPanelInteraction: () => void
    projectFolder: string
    statusColors: Map<string, string>
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
        cardTypes, cardsByPath, nodes, objectsByPath, onCreateFolder, onCreateMarkdownFile, onDeleteFile, onDeleteFolder,
        onLeftPanelInteraction, projectFolder, statusColors,
    } = props
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
