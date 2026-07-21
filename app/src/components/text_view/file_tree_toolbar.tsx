import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined'
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import type { TreeNode } from '../../data/file_tree'
import { useActiveDocumentPath } from '../hooks/use_active_document'
import type { CreateTreeItemKind } from './create_tree_item_dialog'

interface FileTreeToolbarProps {
    nodes: TreeNode[]
    onRequestCreate: (kind: CreateTreeItemKind, parentDirectory: string) => void
    projectFolder: string
    selectedNodeId: string | null
}

function findTreeNode(nodes: TreeNode[], id: string): TreeNode | null {
    for (const node of nodes) {
        if (node.id === id) return node

        const descendant = findTreeNode(node.children, id)
        if (descendant) return descendant
    }

    return null
}

/** File-tree heading and creation actions. */
export function FileTreeToolbar(props: FileTreeToolbarProps) {
    const { nodes, onRequestCreate, projectFolder, selectedNodeId } = props
    const activeDocumentPath = useActiveDocumentPath()
    const effectiveSelectedNodeId = selectedNodeId ?? activeDocumentPath
    const selectedNode = effectiveSelectedNodeId ? findTreeNode(nodes, effectiveSelectedNodeId) : null
    const toolbarParentDirectory = selectedNode?.directoryPath ?? projectFolder

    const requestFolder = () => {
        onRequestCreate('folder', toolbarParentDirectory)
    }

    const requestMarkdownFile = () => {
        onRequestCreate('markdownFile', toolbarParentDirectory)
    }

    return (
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
                    onClick={requestFolder}
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
                    onClick={requestMarkdownFile}
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
    )
}
