import {
    Box, Chip, IconButton, ListItemButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography, useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import ChevronDown from 'mdi-material-ui/ChevronDown'
import ChevronRight from 'mdi-material-ui/ChevronRight'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import FileDocumentPlusOutline from 'mdi-material-ui/FileDocumentPlusOutline'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import FolderOutline from 'mdi-material-ui/FolderOutline'
import FolderPlusOutline from 'mdi-material-ui/FolderPlusOutline'
import StarOutline from 'mdi-material-ui/StarOutline'
import { type MouseEvent, useState } from 'react'
import type { NodeRendererProps } from 'react-arborist'
import { fileContext, folderContext, type ActionContext } from '../../data/action_context'
import { getCardIdPrefix } from '../../data/card_identifiers'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import type { TreeNode, TreeNodeKind } from '../../data/file_tree'
import { ActionEntryPoints } from '../actions/action_entry_points'
import { useFileTreeContext } from './file_tree_context'

function nodeContext(node: TreeNode, cardTypes: CardTypeConfig[], cardsByPath: Map<string, ProjectCard>): ActionContext | null {
    if (node.kind === 'file') {
        const card = node.path ? cardsByPath.get(node.path) : undefined

        return card ? fileContext(card, cardTypes) : null
    }
    if (node.kind === 'folder' || node.kind === 'special') return folderContext(node.label, node.kind === 'special')

    return null
}

function cardTypeColor(card: ProjectCard | undefined, cardTypes: CardTypeConfig[], fallback: string) {
    const idPrefix = card ? getCardIdPrefix(card.header.id) : undefined
    const cardType = cardTypes.find((candidate) => candidate.idPrefix === idPrefix)

    return cardType?.color ?? fallback
}

function BranchIcon(props: { kind: TreeNodeKind }) {
    if (props.kind === 'special') return <StarOutline sx={{ fontSize: 16 }} />

    return <FolderOutline sx={{ fontSize: 16 }} />
}

/** A single react-arborist row preserving the file tree's existing controls and appearance. */
export function FileTreeNodeRow(props: NodeRendererProps<TreeNode>) {
    const { node, style } = props
    const { cardTypes, cardsByPath, onDeleteFile, onDeleteFolder, onRequestCreate, statusColors } = useFileTreeContext()
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
    const [menuPosition, setMenuPosition] = useState<{ left: number, top: number } | null>(null)
    const theme = useTheme()
    const treeNode = node.data
    const context = nodeContext(treeNode, cardTypes, cardsByPath)
    const card = treeNode.path ? cardsByPath.get(treeNode.path) : undefined
    const accentColor = cardTypeColor(card, cardTypes, theme.palette.primary.main)
    const visibleId = card && treeNode.label.startsWith(`${card.header.id} `) ? card.header.id : null
    const visibleTitle = visibleId ? treeNode.label.slice(visibleId.length + 1) : treeNode.label
    const statusColor = statusColors.get(treeNode.label)
    const isDeletableFolder = treeNode.kind === 'folder'

    const handleRowClick = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        node.select()
        if (treeNode.path) {
            node.activate()
            return
        }

        node.toggle()
    }

    const closeMenu = () => {
        setMenuAnchor(null)
        setMenuPosition(null)
    }

    const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        node.select()
        setMenuAnchor(event.currentTarget)
        setMenuPosition(null)
    }

    const openContextMenu = (event: MouseEvent<HTMLElement>) => {
        event.preventDefault()
        node.select()
        setMenuAnchor(null)
        setMenuPosition({ left: event.clientX, top: event.clientY })
    }

    const requestFolder = () => {
        closeMenu()
        onRequestCreate('folder', treeNode.directoryPath)
    }

    const requestMarkdownFile = () => {
        closeMenu()
        onRequestCreate('markdownFile', treeNode.directoryPath)
    }

    const deleteFile = async (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        if (!treeNode.path) return

        const confirmed = window.confirm(`Delete ${treeNode.path}?`)
        if (!confirmed) return

        try {
            await onDeleteFile(treeNode.path)
        } catch {
            // ProjectWorkspace owns the user-visible delete error.
        }
    }

    const deleteFolder = async (event?: MouseEvent<HTMLElement>) => {
        event?.stopPropagation()
        if (!isDeletableFolder) return

        closeMenu()
        const confirmed = window.confirm(`Delete ${treeNode.directoryPath} and all files inside it?`)
        if (!confirmed) return

        try {
            await onDeleteFolder(treeNode.directoryPath)
        } catch {
            // ProjectWorkspace owns the user-visible delete error.
        }
    }

    const itemMenu = (
        <>
            <Tooltip title="Actions">
                <IconButton aria-label="Actions" onClick={openMenu} size="small">
                    <DotsVertical fontSize="small" />
                </IconButton>
            </Tooltip>
            <Menu
                anchorEl={menuAnchor}
                anchorPosition={menuPosition ?? undefined}
                anchorReference={menuPosition ? 'anchorPosition' : 'anchorEl'}
                onClose={closeMenu}
                open={!!menuAnchor || !!menuPosition}
            >
                <MenuItem onClick={requestFolder}>
                    <ListItemIcon><FolderPlusOutline fontSize="small" /></ListItemIcon>
                    New folder
                </MenuItem>
                <MenuItem onClick={requestMarkdownFile}>
                    <ListItemIcon><FileDocumentPlusOutline fontSize="small" /></ListItemIcon>
                    New Markdown file
                </MenuItem>
                {isDeletableFolder ? (
                    <MenuItem onClick={deleteFolder} sx={{ color: 'error.main' }}>
                        <ListItemIcon><DeleteOutline color="error" fontSize="small" /></ListItemIcon>
                        Delete folder
                    </MenuItem>
                ) : null}
                {context ? (
                    <ActionEntryPoints
                        context={context}
                        onMenuItemSelected={closeMenu}
                        popupAnchorElement={menuAnchor}
                        variant="menuItems"
                    />
                ) : null}
            </Menu>
        </>
    )

    if (treeNode.kind === 'file') {
        return (
            <Box
                data-selected={node.isSelected ? 'true' : undefined}
                onContextMenu={openContextMenu}
                style={style}
                sx={{
                    alignItems: 'center',
                    borderRadius: 0.875,
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    display: 'flex',
                    overflow: 'hidden',
                    position: 'relative',
                    px: 0.5,
                    '& .rowActions': { opacity: 0, transition: 'opacity 120ms' },
                    '&:focus-within .rowActions, &:hover .rowActions': { opacity: 1 },
                    '&:focus-within': { bgcolor: 'action.selected' },
                    '&:hover': { bgcolor: 'action.selected' },
                    '&[data-selected="true"]': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
                }}
            >
                <ListItemButton
                    onClick={handleRowClick}
                    selected={node.isSelected}
                    sx={{
                        borderRadius: 0.875,
                        flex: 1,
                        gap: 0.875,
                        height: '100%',
                        minWidth: 0,
                        pl: 2.25,
                        pr: 0.5,
                        py: 0,
                        '&:hover': { bgcolor: 'transparent' },
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
                <Box
                    className="rowActions"
                    sx={{ alignItems: 'center', bgcolor: 'inherit', bottom: 0, display: 'flex', position: 'absolute', right: 0.5, top: 0 }}
                >
                    <Tooltip title="Delete file">
                        <IconButton aria-label={`Delete ${treeNode.path}`} onClick={deleteFile} size="small" sx={{ height: 24, width: 24 }}>
                            <DeleteOutline sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                    {itemMenu}
                </Box>
            </Box>
        )
    }

    return (
        <Box
            data-selected={node.isSelected ? 'true' : undefined}
            onContextMenu={openContextMenu}
            style={style}
            sx={{
                alignItems: 'center',
                borderRadius: 0.75,
                boxSizing: 'border-box',
                cursor: 'pointer',
                display: 'flex',
                overflow: 'hidden',
                position: 'relative',
                px: 0.5,
                '& .rowActions': { opacity: 0, transition: 'opacity 120ms' },
                '&:focus-within .rowActions, &:hover .rowActions': { opacity: 1 },
                '&:focus-within': { bgcolor: 'action.selected' },
                '&:hover': { bgcolor: 'action.selected' },
                '&[data-selected="true"]': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
            }}
        >
            <ListItemButton
                onClick={handleRowClick}
                selected={node.isSelected}
                sx={{
                    borderRadius: 0.75,
                    flex: 1,
                    gap: 0.75,
                    height: '100%',
                    minWidth: 0,
                    pr: 0.5,
                    py: 0,
                    '&:hover': { bgcolor: 'transparent' },
                    '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'transparent' },
                }}
            >
                {node.isOpen
                    ? <ChevronDown sx={{ color: 'text.secondary', fontSize: 18 }} />
                    : <ChevronRight sx={{ color: 'text.secondary', fontSize: 18 }} />}
                {statusColor ? (
                    <Box sx={{ bgcolor: statusColor, borderRadius: '3px', flexShrink: 0, height: 8, width: 8 }} />
                ) : (
                    <Box sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex' }}>
                        <BranchIcon kind={treeNode.kind} />
                    </Box>
                )}
                <Typography
                    noWrap
                    sx={{ color: 'text.secondary', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}
                >
                    {treeNode.label}
                </Typography>
                <Chip
                    label={treeNode.children.length}
                    size="small"
                    sx={{
                        bgcolor: 'background.paper', border: 1, borderColor: 'divider', fontSize: 11,
                        height: 19, minWidth: 22, '& .MuiChip-label': { px: 0.75 },
                    }}
                />
            </ListItemButton>
            <Box
                className="rowActions"
                sx={{ alignItems: 'center', bgcolor: 'inherit', bottom: 0, display: 'flex', position: 'absolute', right: 0.5, top: 0 }}
            >
                {isDeletableFolder ? (
                    <Tooltip title="Delete folder">
                        <IconButton
                            aria-label={`Delete ${treeNode.directoryPath}`}
                            onClick={deleteFolder}
                            size="small"
                            sx={{ height: 24, width: 24 }}
                        >
                            <DeleteOutline sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                ) : null}
                {itemMenu}
            </Box>
        </Box>
    )
}
