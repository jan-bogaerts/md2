import { Box, Chip, Collapse, IconButton, List, ListItemButton, Tooltip, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import ChevronDown from 'mdi-material-ui/ChevronDown'
import ChevronRight from 'mdi-material-ui/ChevronRight'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import FolderOutline from 'mdi-material-ui/FolderOutline'
import StarOutline from 'mdi-material-ui/StarOutline'
import { useState } from 'react'
import { fileContext, folderContext, type ActionContext } from '../../data/action_context'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import type { TreeNode, TreeNodeKind } from '../../data/file_tree'
import { ActionEntryPoints } from '../actions/action_entry_points'

const BASE_INDENT = 1
const INDENT_STEP = 2
const FILE_ROW_HEIGHT = 34
const GROUP_ROW_HEIGHT = 30

interface FileTreeViewProps {
    cardTypes: CardTypeConfig[]
    cardsByPath: Map<string, ProjectCard>
    nodes: TreeNode[]
    onDeleteFile: (path: string) => Promise<void>
    onSelect: (path: string) => void
    selectedPath: string | null
    statusColors: Map<string, string>
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

function cardTypeColor(card: ProjectCard | undefined, cardTypes: CardTypeConfig[], fallback: string) {
    const idPrefix = card?.header.id.split('-')[0]
    const cardType = cardTypes.find((candidate) => candidate.idPrefix === idPrefix)

    return cardType?.color ?? fallback
}

function BranchIcon(props: { kind: TreeNodeKind }) {
    if (props.kind === 'special') return <StarOutline sx={{ fontSize: 16 }} />

    return <FolderOutline sx={{ fontSize: 16 }} />
}

interface TreeNodeRowProps extends Omit<FileTreeViewProps, 'nodes'> {
    depth: number
    node: TreeNode
}

function TreeNodeRow(props: TreeNodeRowProps) {
    const { cardTypes, cardsByPath, depth, node, onDeleteFile, onSelect, selectedPath, statusColors } = props
    const [isOpen, setIsOpen] = useState(true)
    const theme = useTheme()
    const indent = BASE_INDENT + depth * INDENT_STEP
    const context = nodeContext(node, cardTypes, cardsByPath)
    const card = node.path ? cardsByPath.get(node.path) : undefined
    const accentColor = cardTypeColor(card, cardTypes, theme.palette.primary.main)
    const visibleId = card && node.label.startsWith(`${card.header.id} `) ? card.header.id : null
    const visibleTitle = visibleId ? node.label.slice(visibleId.length + 1) : node.label
    const statusColor = statusColors.get(node.label)

    const selectFile = () => {
        if (node.path) onSelect(node.path)
    }

    const toggleOpen = () => {
        setIsOpen((open) => !open)
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

    const entryPoints = context ? <ActionEntryPoints context={context} variant="menu" /> : null

    if (node.kind === 'file') {
        return (
            <Box
                data-selected={node.path === selectedPath ? 'true' : undefined}
                sx={{
                    alignItems: 'center',
                    borderRadius: 0.875,
                    display: 'flex',
                    minHeight: FILE_ROW_HEIGHT,
                    mx: 0.5,
                    overflow: 'hidden',
                    '& .rowActions': { opacity: 0, transition: 'opacity 120ms' },
                    '&:focus-within .rowActions, &:hover .rowActions': { opacity: 1 },
                    '&:hover': { bgcolor: 'action.selected' },
                    '&[data-selected="true"]': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
                }}
            >
                <ListItemButton
                    onClick={selectFile}
                    selected={node.path === selectedPath}
                    sx={{
                        borderRadius: 0.875,
                        flex: 1,
                        gap: 0.875,
                        minHeight: FILE_ROW_HEIGHT,
                        minWidth: 0,
                        pl: indent + 2.25,
                        pr: 0.5,
                        py: 0,
                        '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'transparent' },
                    }}
                >
                    <FileDocumentOutline sx={{ color: 'text.disabled', flexShrink: 0, fontSize: 16 }} />
                    {visibleId ? (
                        <Box
                            component="span"
                            sx={{
                                bgcolor: alpha(accentColor, 0.16),
                                borderRadius: '5px',
                                color: accentColor,
                                flexShrink: 0,
                                fontFamily: '"Roboto Mono", ui-monospace, monospace',
                                fontSize: 11.5,
                                fontWeight: 600,
                                px: 0.75,
                                py: 0.125,
                            }}
                        >
                            {visibleId}
                        </Box>
                    ) : null}
                    <Typography noWrap sx={{ color: 'text.primary', fontSize: 12.5, fontWeight: 500, minWidth: 0 }}>
                        {visibleTitle}
                    </Typography>
                </ListItemButton>
                <Box className="rowActions" sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, pr: 0.5 }}>
                    <Tooltip title="Delete file">
                        <IconButton aria-label={`Delete ${node.path}`} onClick={deleteFile} size="small" sx={{ height: 24, width: 24 }}>
                            <DeleteOutline sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                    {entryPoints}
                </Box>
            </Box>
        )
    }

    return (
        <>
            <Box
                sx={{
                    alignItems: 'center',
                    borderRadius: 0.75,
                    display: 'flex',
                    minHeight: GROUP_ROW_HEIGHT,
                    mx: 0.5,
                    '& .rowActions': { opacity: 0, transition: 'opacity 120ms' },
                    '&:focus-within .rowActions, &:hover .rowActions': { opacity: 1 },
                    '&:hover': { bgcolor: 'action.selected' },
                }}
            >
                <ListItemButton
                    onClick={toggleOpen}
                    sx={{ borderRadius: 0.75, flex: 1, gap: 0.75, minHeight: GROUP_ROW_HEIGHT, minWidth: 0, pl: indent, pr: 0.5, py: 0 }}
                >
                    {isOpen ? <ChevronDown sx={{ color: 'text.secondary', fontSize: 18 }} /> : <ChevronRight sx={{ color: 'text.secondary', fontSize: 18 }} />}
                    {statusColor ? (
                        <Box sx={{ bgcolor: statusColor, borderRadius: '3px', flexShrink: 0, height: 8, width: 8 }} />
                    ) : (
                        <Box sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex' }}><BranchIcon kind={node.kind} /></Box>
                    )}
                    <Typography
                        noWrap
                        sx={{ color: 'text.secondary', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}
                    >
                        {node.label}
                    </Typography>
                    <Chip
                        label={node.children.length}
                        size="small"
                        sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', fontSize: 11, height: 19, minWidth: 22, '& .MuiChip-label': { px: 0.75 } }}
                    />
                </ListItemButton>
                <Box className="rowActions" sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, pr: 0.5 }}>
                    {entryPoints}
                </Box>
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
                            statusColors={statusColors}
                        />
                    ))}
                </List>
            </Collapse>
        </>
    )
}

/** Recursive status/folder tree with compact card rows and hover-only actions. */
export function FileTreeView(props: FileTreeViewProps) {
    const { cardTypes, cardsByPath, nodes, onDeleteFile, onSelect, selectedPath, statusColors } = props

    return (
        <List component="nav" dense disablePadding sx={{ py: 1 }}>
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
                    statusColors={statusColors}
                />
            ))}
        </List>
    )
}
