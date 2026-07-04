import { Box, Collapse, List, ListItemButton, ListItemText } from '@mui/material'
import ChevronDown from 'mdi-material-ui/ChevronDown'
import ChevronRight from 'mdi-material-ui/ChevronRight'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import FolderOutline from 'mdi-material-ui/FolderOutline'
import StarOutline from 'mdi-material-ui/StarOutline'
import ViewColumnOutline from 'mdi-material-ui/ViewColumnOutline'
import { useState } from 'react'
import type { TreeNode, TreeNodeKind } from '../../data/file_tree'

const INDENT_STEP = 2

interface FileTreeViewProps {
    nodes: TreeNode[]
    onSelect: (path: string) => void
    selectedPath: string | null
}

function BranchIcon(props: { kind: TreeNodeKind }) {
    if (props.kind === 'status') return <ViewColumnOutline fontSize="small" />
    if (props.kind === 'special') return <StarOutline fontSize="small" />

    return <FolderOutline fontSize="small" />
}

function TreeNodeRow(props: { depth: number; node: TreeNode; onSelect: (path: string) => void; selectedPath: string | null }) {
    const { depth, node, onSelect, selectedPath } = props
    const [isOpen, setIsOpen] = useState(true)
    const indent = 1 + depth * INDENT_STEP

    if (node.kind === 'file') {
        return (
            <ListItemButton
                onClick={() => node.path && onSelect(node.path)}
                selected={node.path != null && node.path === selectedPath}
                sx={{ pl: indent }}
            >
                <Box sx={{ alignItems: 'center', display: 'flex', mr: 1 }}>
                    <FileDocumentOutline fontSize="small" />
                </Box>
                <ListItemText primary={node.label} slotProps={{ primary: { variant: 'body2' } }} />
            </ListItemButton>
        )
    }

    return (
        <>
            <ListItemButton onClick={() => setIsOpen((open) => !open)} sx={{ pl: indent }}>
                <Box sx={{ alignItems: 'center', display: 'flex', mr: 1 }}>
                    {isOpen ? <ChevronDown fontSize="small" /> : <ChevronRight fontSize="small" />}
                    <BranchIcon kind={node.kind} />
                </Box>
                <ListItemText primary={node.label} slotProps={{ primary: { sx: { fontWeight: 600 }, variant: 'body2' } }} />
            </ListItemButton>
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" dense disablePadding>
                    {node.children.map((child) => (
                        <TreeNodeRow
                            key={child.id}
                            depth={depth + 1}
                            node={child}
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
    const { nodes, onSelect, selectedPath } = props

    return (
        <List component="nav" dense disablePadding>
            {nodes.map((node) => (
                <TreeNodeRow key={node.id} depth={0} node={node} onSelect={onSelect} selectedPath={selectedPath} />
            ))}
        </List>
    )
}
