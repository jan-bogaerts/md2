import {
    Box, Chip, Collapse, IconButton, List, ListItemButton, ListItemIcon,
    Menu, MenuItem, Tooltip, Typography, useTheme,
} from '@mui/material'
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined'
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined'
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
import { fileContext, folderContext, type ActionContext } from '../../data/action_context'
import { getCardIdPrefix } from '../../data/card_identifiers'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import type { TreeNode, TreeNodeKind } from '../../data/file_tree'
import { ActionEntryPoints } from '../actions/action_entry_points'
import { CreateTreeItemDialog, type CreateTreeItemKind } from './create_tree_item_dialog'

const BASE_INDENT = 1
const INDENT_STEP = 2
const FILE_ROW_HEIGHT = 34
const GROUP_ROW_HEIGHT = 30

interface FileTreeViewProps {
    cardTypes: CardTypeConfig[]
    cardsByPath: Map<string, ProjectCard>
    nodes: TreeNode[]
    onCreateFolder: (parentDirectory: string, name: string) => Promise<void>
    onCreateMarkdownFile: (parentDirectory: string, name: string) => Promise<void>
    onDeleteFile: (path: string) => Promise<void>
    onSelect: (path: string) => void
    projectFolder: string
    selectedPath: string | null
    statusColors: Map<string, string>
}

interface CreationRequest {
    kind: CreateTreeItemKind
    parentDirectory: string
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
    const idPrefix = card ? getCardIdPrefix(card.header.id) : undefined
    const cardType = cardTypes.find((candidate) => candidate.idPrefix === idPrefix)

    return cardType?.color ?? fallback
}

function BranchIcon(props: { kind: TreeNodeKind }) {
    if (props.kind === 'special') return <StarOutline sx={{ fontSize: 16 }} />

    return <FolderOutline sx={{ fontSize: 16 }} />
}

function findTreeNode(nodes: TreeNode[], id: string): TreeNode | null {
    for (const node of nodes) {
        if (node.id === id) return node

        const descendant = findTreeNode(node.children, id)
        if (descendant) return descendant
    }

    return null
}

interface TreeNodeRowProps extends Omit<FileTreeViewProps, 'nodes' | 'onCreateFolder' | 'onCreateMarkdownFile' | 'projectFolder' | 'selectedPath'> {
    depth: number
    node: TreeNode
    onRequestCreate: (kind: CreateTreeItemKind, parentDirectory: string) => void
    onSelectNode: (node: TreeNode) => void
    selectedNodeId: string | null
}

function TreeNodeRow(props: TreeNodeRowProps) {
    const {
        cardTypes, cardsByPath, depth, node, onDeleteFile, onRequestCreate, onSelect,
        onSelectNode, selectedNodeId, statusColors,
    } = props
    const [isOpen, setIsOpen] = useState(true)
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
    const [menuPosition, setMenuPosition] = useState<{ left: number, top: number } | null>(null)
    const theme = useTheme()
    const indent = BASE_INDENT + depth * INDENT_STEP
    const context = nodeContext(node, cardTypes, cardsByPath)
    const card = node.path ? cardsByPath.get(node.path) : undefined
    const accentColor = cardTypeColor(card, cardTypes, theme.palette.primary.main)
    const visibleId = card && node.label.startsWith(`${card.header.id} `) ? card.header.id : null
    const visibleTitle = visibleId ? node.label.slice(visibleId.length + 1) : node.label
    const statusColor = statusColors.get(node.label)
    const isSelected = node.id === selectedNodeId

    const selectFile = () => {
        onSelectNode(node)
        if (node.path) onSelect(node.path)
    }

    const toggleOpen = () => {
        onSelectNode(node)
        setIsOpen((open) => !open)
    }

    const closeMenu = () => {
        setMenuAnchor(null)
        setMenuPosition(null)
    }

    const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onSelectNode(node)
        setMenuAnchor(event.currentTarget)
        setMenuPosition(null)
    }

    const openContextMenu = (event: MouseEvent<HTMLElement>) => {
        event.preventDefault()
        onSelectNode(node)
        setMenuAnchor(null)
        setMenuPosition({ left: event.clientX, top: event.clientY })
    }

    const requestFolder = () => {
        closeMenu()
        onRequestCreate('folder', node.directoryPath)
    }

    const requestMarkdownFile = () => {
        closeMenu()
        onRequestCreate('markdownFile', node.directoryPath)
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

    if (node.kind === 'file') {
        return (
            <Box
                data-selected={isSelected ? 'true' : undefined}
                onContextMenu={openContextMenu}
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
                    selected={isSelected}
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
                    {itemMenu}
                </Box>
            </Box>
        )
    }

    return (
        <>
            <Box
                data-selected={isSelected ? 'true' : undefined}
                onContextMenu={openContextMenu}
                sx={{
                    alignItems: 'center',
                    borderRadius: 0.75,
                    display: 'flex',
                    minHeight: GROUP_ROW_HEIGHT,
                    mx: 0.5,
                    '& .rowActions': { opacity: 0, transition: 'opacity 120ms' },
                    '&:focus-within .rowActions, &:hover .rowActions': { opacity: 1 },
                    '&:hover': { bgcolor: 'action.selected' },
                    '&[data-selected="true"]': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
                }}
            >
                <ListItemButton
                    onClick={toggleOpen}
                    selected={isSelected}
                    sx={{
                        borderRadius: 0.75,
                        flex: 1,
                        gap: 0.75,
                        minHeight: GROUP_ROW_HEIGHT,
                        minWidth: 0,
                        pl: indent,
                        pr: 0.5,
                        py: 0,
                        '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'transparent' },
                    }}
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
                    {itemMenu}
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
                            onRequestCreate={onRequestCreate}
                            onSelect={onSelect}
                            onSelectNode={onSelectNode}
                            selectedNodeId={selectedNodeId}
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
    const {
        cardTypes, cardsByPath, nodes, onCreateFolder, onCreateMarkdownFile, onDeleteFile,
        onSelect, projectFolder, selectedPath, statusColors,
    } = props
    const [creationRequest, setCreationRequest] = useState<CreationRequest | null>(null)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

    const handleSelectNode = (node: TreeNode) => {
        setSelectedNodeId(node.path ? null : node.id)
    }

    const requestCreate = (kind: CreateTreeItemKind, parentDirectory: string) => {
        setCreationRequest({ kind, parentDirectory })
    }

    const effectiveSelectedNodeId = selectedNodeId ?? selectedPath
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

    return (
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
                    CARDS
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
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1, py: 1.5 }}>
                <List component="nav" dense disablePadding>
                    {nodes.map((node) => (
                        <TreeNodeRow
                            key={node.id}
                            cardTypes={cardTypes}
                            cardsByPath={cardsByPath}
                            depth={0}
                            node={node}
                            onDeleteFile={onDeleteFile}
                            onRequestCreate={requestCreate}
                            onSelect={onSelect}
                            onSelectNode={handleSelectNode}
                            selectedNodeId={effectiveSelectedNodeId}
                            statusColors={statusColors}
                        />
                    ))}
                </List>
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
    )
}
