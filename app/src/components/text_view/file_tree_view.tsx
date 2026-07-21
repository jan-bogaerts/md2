import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined'
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import { type NodeApi, Tree } from 'react-arborist'
import { useEffect, useRef, useState } from 'react'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import type { TreeNode } from '../../data/file_tree'
import { openFilesService, type OpenDocument, type OpenDocumentObject } from '../../services/open_files_service'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { useOpenFiles } from '../hooks/use_open_files'
import { CreateTreeItemDialog, type CreateTreeItemKind } from './create_tree_item_dialog'
import { FileTreeContext, type FileTreeContextValue } from './file_tree_context'
import { FileTreeNodeRow } from './file_tree_node_row'
import { FileTreeRow } from './file_tree_row'

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

function findTreeNode(nodes: TreeNode[], id: string): TreeNode | null {
    for (const node of nodes) {
        if (node.id === id) return node

        const descendant = findTreeNode(node.children, id)
        if (descendant) return descendant
    }

    return null
}

function treeNodeChildren(node: TreeNode): readonly TreeNode[] | null {
    return node.kind === 'file' ? null : node.children
}

function treeRowHeight(node: NodeApi<TreeNode>): number {
    return node.data.kind === 'file' ? FILE_ROW_HEIGHT : GROUP_ROW_HEIGHT
}

function documentPath(document: OpenDocument | null) {
    if (!document) return null
    if (document.kind === 'card') return document.getObject().path
    const { id, sourcePath } = document.getObject()
    if (!sourcePath) throw new Error(`Open action has no source path: ${id}`)

    return sourcePath
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
    const { activeDocument } = useOpenFiles()
    const [creationRequest, setCreationRequest] = useState<CreationRequest | null>(null)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [treeContainerRef, treeHeight] = useElementHeight()

    const requestCreate = (kind: CreateTreeItemKind, parentDirectory: string) => {
        setCreationRequest({ kind, parentDirectory })
    }

    const handleSelectNodes = (selectedNodes: NodeApi<TreeNode>[]) => {
        setSelectedNodeId(selectedNodes.at(0)?.id ?? null)
    }

    const handleActivateNode = (node: NodeApi<TreeNode>) => {
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
    }

    const effectiveSelectedNodeId = selectedNodeId ?? documentPath(activeDocument)
    const selectedNode = effectiveSelectedNodeId ? findTreeNode(nodes, effectiveSelectedNodeId) : null
    const toolbarParentDirectory = selectedNode?.directoryPath ?? projectFolder

    const requestToolbarFolder = () => {
        requestCreate('folder', toolbarParentDirectory)
    }

    const requestToolbarMarkdownFile = () => {
        requestCreate('markdownFile', toolbarParentDirectory)
    }

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

    const treeContext: FileTreeContextValue = {
        cardTypes,
        cardsByPath,
        onDeleteFile,
        onDeleteFolder,
        onRequestCreate: requestCreate,
        statusColors,
    }

    return (
        <FileTreeContext.Provider value={treeContext}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <Box
                    sx={{
                        alignItems: 'center',
                        borderBottom: 1,
                        borderColor: 'divider',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexShrink: 0,
                        gap: 1,
                        height: 40,
                        pl: 2,
                        pr: 1,
                    }}
                >
                    <Typography
                        sx={{ color: 'text.primary', fontWeight: 700, letterSpacing: '0.7px', lineHeight: 1 }}
                        variant="overline"
                    >
                        FILES
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title="New folder">
                        <IconButton
                            aria-label="New folder"
                            onClick={requestToolbarFolder}
                            size="small"
                            sx={{
                                borderRadius: '7px',
                                color: 'text.secondary',
                                height: 28,
                                width: 28,
                                '&:hover': { bgcolor: 'background.paper', color: 'primary.main' },
                            }}
                        >
                            <CreateNewFolderOutlinedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="New Markdown file">
                        <IconButton
                            aria-label="New Markdown file"
                            onClick={requestToolbarMarkdownFile}
                            size="small"
                            sx={{
                                borderRadius: '7px',
                                color: 'text.secondary',
                                height: 28,
                                width: 28,
                                '&:hover': { bgcolor: 'background.paper', color: 'primary.main' },
                            }}
                        >
                            <NoteAddOutlinedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
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
                            selection={effectiveSelectedNodeId ?? undefined}
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
