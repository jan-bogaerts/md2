import { Box, Collapse, IconButton, List, ListItemButton, ListItemText, Tooltip } from '@mui/material'
import ChevronDown from 'mdi-material-ui/ChevronDown'
import ChevronRight from 'mdi-material-ui/ChevronRight'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import FolderOutline from 'mdi-material-ui/FolderOutline'
import StarOutline from 'mdi-material-ui/StarOutline'
import ViewColumnOutline from 'mdi-material-ui/ViewColumnOutline'
import { useState } from 'react'
import { fileContext, folderContext, type ActionContext } from '../../data/action_context'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import type { TreeNode, TreeNodeKind } from '../../data/file_tree'
import { ActionEntryPoints } from '../actions/action_entry_points'

const INDENT_STEP = 2

interface FileTreeViewProps {
    cardTypes: CardTypeConfig[]
    cardsByPath: Map<string, ProjectCard>
    nodes: TreeNode[]
    onDeleteFile: (path: string) => Promise<void>
    onSelect: (path: string) => void
    selectedPath: string | null
}

/** The action context for a tree node, or null for nodes that can't run actions (status groups). */
function nodeContext(node: TreeNode, cardTypes: CardTypeConfig[], cardsByPath: Map<string, ProjectCard>): ActionContext | null {
    if (node.kind === 'file') {
        const card = node.path ? cardsByPath.get(node.path) : undefined

        return card ? fileContext(card, cardTypes) : null
    }
    if (node.kind === 'folder' || node.kind === 'special') return folderContext(node.label, node.kind === 'special')

    return null
}

function BranchIcon(props: { kind: TreeNodeKind }) {
    if (props.kind === 'status') return <ViewColumnOutline fontSize="small" />
    if (props.kind === 'special') return <StarOutline fontSize="small" />

    return <FolderOutline fontSize="small" />
}

interface TreeNodeRowProps {
    cardTypes: CardTypeConfig[]
    cardsByPath: Map<string, ProjectCard>
    depth: number
    node: TreeNode
    onDeleteFile: (path: string) => Promise<void>
    onSelect: (path: string) => void
    selectedPath: string | null
}

function TreeNodeRow(props: TreeNodeRowProps) {
    const { cardTypes, cardsByPath, depth, node, onDeleteFile, onSelect, selectedPath } = props
    const [isOpen, setIsOpen] = useState(true)
    const indent = 1 + depth * INDENT_STEP
    const context = nodeContext(node, cardTypes, cardsByPath)
    const entryPoints = context ? (
        <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, pr: 0.5 }}>
            <ActionEntryPoints context={context} variant="menu" />
        </Box>
    ) : null

    const selectFile = () => {
        if (node.path) onSelect(node.path)
    }

    const deleteFile = async () => {
        if (!node.path) return

        const confirmed = window.confirm(`Delete ${node.path}?`)
        if (!confirmed) return

        try {
            await onDeleteFile(node.path)
        } catch {
            // ProjectWorkspace owns the user-visible delete error.
        }
    }

    if (node.kind === 'file') {
        return (
            <Box sx={{ alignItems: 'center', display: 'flex' }}>
                <ListItemButton
                    onClick={selectFile}
                    selected={node.path != null && node.path === selectedPath}
                    sx={{ flex: 1, minWidth: 0, pl: indent }}
                >
                    <Box sx={{ alignItems: 'center', display: 'flex', mr: 1 }}>
                        <FileDocumentOutline fontSize="small" />
                    </Box>
                    <ListItemText primary={node.label} slotProps={{ primary: { variant: 'body2' } }} />
                </ListItemButton>
                <Tooltip title="Delete file">
                    <IconButton aria-label={`Delete ${node.path}`} onClick={deleteFile} size="small">
                        <DeleteOutline fontSize="small" />
                    </IconButton>
                </Tooltip>
                {entryPoints}
            </Box>
        )
    }

    return (
        <>
            <Box sx={{ alignItems: 'center', display: 'flex' }}>
                <ListItemButton onClick={() => setIsOpen((open) => !open)} sx={{ flex: 1, minWidth: 0, pl: indent }}>
                    <Box sx={{ alignItems: 'center', display: 'flex', mr: 1 }}>
                        {isOpen ? <ChevronDown fontSize="small" /> : <ChevronRight fontSize="small" />}
                        <BranchIcon kind={node.kind} />
                    </Box>
                    <ListItemText primary={node.label} slotProps={{ primary: { sx: { fontWeight: 600 }, variant: 'body2' } }} />
                </ListItemButton>
                {entryPoints}
            </Box>
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" dense disablePadding>
                    {node.children.map((child) => (
                        <TreeNodeRow
                            key={child.id}
                            cardTypes={cardTypes}
                            cardsByPath={cardsByPath}
                            depth={depth + 1}
                            node={child}
                            onDeleteFile={onDeleteFile}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                        />
                    ))}
                </List>
            </Collapse>
        </>
    )
}

/** Recursive folder/status tree; file leaves are clickable to open a tab. */
export function FileTreeView(props: FileTreeViewProps) {
    const { cardTypes, cardsByPath, nodes, onDeleteFile, onSelect, selectedPath } = props

    return (
        <List component="nav" dense disablePadding>
            {nodes.map((node) => (
                <TreeNodeRow
                    key={node.id}
                    cardTypes={cardTypes}
                    cardsByPath={cardsByPath}
                    depth={0}
                    node={node}
                    onDeleteFile={onDeleteFile}
                    onSelect={onSelect}
                    selectedPath={selectedPath}
                />
            ))}
        </List>
    )
}
