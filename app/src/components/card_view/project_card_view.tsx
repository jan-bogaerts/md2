import { Box, IconButton, Menu, MenuItem, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useSortable } from '@dnd-kit/sortable'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import { useState } from 'react'
import type { ChangeEvent, KeyboardEvent, MouseEvent, TouchEvent } from 'react'
import type { AgentConversation, CardTypeConfig, ProjectCard, WorktreeRecord } from '../../data/data_types'
import { cardContext } from '../../data/action_context'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { ActionEntryPoints } from '../actions/action_entry_points'
import { CardRunButton } from '../actions/card_run_button'
import { useRunningActionForFile } from '../hooks/use_action_executions'
import { CardDeleteDialog } from './card_delete_dialog'
import { CardPolicyMenuItem } from './card_policy_menu_item'
import { CardWorktreeIndicator } from './card_worktree_indicator'

const CARD_LONG_PRESS_MS = 500

export interface CardHandlers {
    onDeleteCard: (path: string) => Promise<void>
    onOpenBody: (path: string, anchorElement: HTMLElement) => void
    onOpenInFileMode: (path: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
}

interface ProjectCardViewProps extends CardHandlers {
    card: ProjectCard
    cardTypes: CardTypeConfig[]
    color?: string
    isBodyOpen: boolean
    isSelected: boolean
    primaryPath: string
    projectKey: string
    worktrees: WorktreeRecord[]
}

interface MenuPosition {
    left: number
    top: number
}

/** A three-row draggable card with compact metadata and consolidated actions. */
export function ProjectCardView(props: ProjectCardViewProps) {
    const { card, cardTypes, color, isBodyOpen, isSelected, primaryPath, projectKey, worktrees } = props
    const { onOpenBody, onOpenInFileMode } = props
    const { onDeleteCard, onTogglePolicy, onTitleChange } = props
    const theme = useTheme()
    const sortable = useSortable({ id: card.path })
    const { attributes, isDragging, listeners, node, setActivatorNodeRef, setNodeRef, transform, transition } = sortable
    const [actionsAnchorElement, setActionsAnchorElement] = useState<HTMLElement | null>(null)
    const [actionsMenuPosition, setActionsMenuPosition] = useState<MenuPosition | null>(null)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [longPressTimer, setLongPressTimer] = useState<number | null>(null)
    const [titleDraft, setTitleDraft] = useState(card.header.title)
    const accentColor = color ?? theme.palette.primary.main
    const accentBackground = alpha(accentColor, 0.16)
    const runningExecution = useRunningActionForFile(card.path)
    const statusLabel = runningExecution ? 'Running' : 'Idle'
    const dragTranslation = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : ''
    const style = {
        opacity: isDragging ? 0 : 1,
        transform: `${dragTranslation}${isDragging ? ' rotate(2deg)' : ''}`.trim() || undefined,
        transition,
    }

    const handleConversationViewed = (conversation: AgentConversation) => {
        agentAcknowledgementService.acknowledge(projectKey, card.path, [conversation])
    }

    const commitTitle = () => {
        setIsEditingTitle(false)
        const nextTitle = titleDraft.trim()
        if (nextTitle.length > 0 && nextTitle !== card.header.title) onTitleChange(card.path, nextTitle)
    }

    const handleTitleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') commitTitle()
        if (event.key === 'Escape') setIsEditingTitle(false)
    }

    const handleTitleDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTitleDraft(event.target.value)
    }

    const handleCardClick = (event: MouseEvent<HTMLElement>) => {
        if (!isEditingTitle) onOpenBody(card.path, event.currentTarget)
    }

    const stopClick = (event: MouseEvent) => {
        event.stopPropagation()
    }

    const openCardActions = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        setActionsMenuPosition(null)
        setActionsAnchorElement(event.currentTarget)
    }

    const openCardContextMenu = (event: MouseEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()
        setActionsAnchorElement(null)
        setActionsMenuPosition({ left: event.clientX, top: event.clientY })
    }

    const openInFileMode = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        onOpenInFileMode(card.path)
    }

    const closeCardActions = () => {
        setActionsAnchorElement(null)
        setActionsMenuPosition(null)
    }

    const openBodyFromMenu = () => {
        closeCardActions()
        if (!node.current) throw new Error(`Missing card element: ${card.path}`)
        onOpenBody(card.path, node.current)
    }

    const openInFileModeFromMenu = () => {
        closeCardActions()
        onOpenInFileMode(card.path)
    }

    const editTitleFromMenu = () => {
        closeCardActions()
        setTitleDraft(card.header.title)
        setIsEditingTitle(true)
    }

    const clearLongPressTimer = () => {
        if (longPressTimer !== null) window.clearTimeout(longPressTimer)
        setLongPressTimer(null)
    }

    const handleCardTouchStart = (event: TouchEvent<HTMLElement>) => {
        if (event.touches.length !== 1) return

        const { clientX, clientY } = event.touches[0]
        const timer = window.setTimeout(() => {
            setActionsAnchorElement(null)
            setActionsMenuPosition({ left: clientX, top: clientY })
        }, CARD_LONG_PRESS_MS)
        setLongPressTimer(timer)
    }

    const handleCardTouchEnd = () => {
        clearLongPressTimer()
    }

    const closeDeleteCardDialog = () => {
        setDeleteCardPath(null)
    }

    const openDeleteCardDialog = () => {
        closeCardActions()
        setDeleteCardPath(card.path)
    }

    const policyKeys = Object.keys(card.header.policy)

    return (
        <Box
            data-card-path={card.path}
            data-selected={isSelected ? 'true' : undefined}
            onContextMenu={openCardContextMenu}
            onTouchCancel={handleCardTouchEnd}
            onTouchEnd={handleCardTouchEnd}
            onTouchMove={handleCardTouchEnd}
            onTouchStart={handleCardTouchStart}
            ref={setNodeRef}
            sx={{
                bgcolor: 'background.paper',
                border: 1,
                borderColor: isSelected ? 'primary.main' : 'divider',
                borderRadius: 1.25,
                boxShadow: isDragging ? 'var(--md2-card-drag-shadow)' : 'var(--md2-card-shadow)',
                overflow: 'hidden',
                position: 'relative',
                '&:hover': { borderColor: 'text.disabled', boxShadow: 'var(--md2-card-hover-shadow)' },
                ...style,
            }}
        >
            <Box
                {...attributes}
                {...listeners}
                aria-expanded={isBodyOpen}
                aria-haspopup="dialog"
                aria-label={`Drag ${card.header.id}`}
                component="button"
                onClick={handleCardClick}
                ref={setActivatorNodeRef}
                sx={{
                    bgcolor: 'transparent',
                    border: 0,
                    cursor: isDragging ? 'grabbing' : 'pointer',
                    inset: 0,
                    position: 'absolute',
                    touchAction: 'none',
                    zIndex: 1,
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
                type="button"
            />
            <Box sx={{ bgcolor: accentColor, bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, p: '10px 12px 10px 14px', pointerEvents: 'none' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24, position: 'relative', zIndex: 2 }}>
                    <Box
                        component="span"
                        sx={{
                            bgcolor: accentBackground,
                            borderRadius: '5px',
                            color: accentColor,
                            fontFamily: '"Roboto Mono", ui-monospace, monospace',
                            fontSize: 11.5,
                            fontWeight: 600,
                            px: 0.875,
                            py: 0.25,
                        }}
                    >
                        {card.header.id}
                    </Box>
                    <Box component="span" sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', fontSize: 11, gap: 0.625 }}>
                        <Box sx={{ bgcolor: runningExecution ? 'success.main' : 'text.disabled', borderRadius: '50%', height: 7, width: 7 }} />
                        {statusLabel}
                    </Box>
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title="Card actions">
                        <IconButton
                            aria-label={`Card actions for ${card.header.id}`}
                            onClick={openCardActions}
                            size="small"
                            sx={{ color: 'text.disabled', height: 24, pointerEvents: 'auto', width: 24 }}
                        >
                            <DotsVertical sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
                {isEditingTitle ? (
                    <Box sx={{ pointerEvents: 'auto', position: 'relative', zIndex: 2 }}>
                        <TextField
                            autoFocus
                            fullWidth
                            onBlur={commitTitle}
                            onChange={handleTitleDraftChange}
                            onClick={stopClick}
                            onKeyDown={handleTitleKeyDown}
                            size="small"
                            value={titleDraft}
                        />
                    </Box>
                ) : (
                    <Typography sx={{ color: 'text.primary', fontSize: 13.5, fontWeight: 500, lineHeight: 1.4 }}>
                        {card.header.title}
                    </Typography>
                )}
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minHeight: 26, position: 'relative', zIndex: 2 }}>
                    <Box sx={{ pointerEvents: 'auto' }}>
                        <CardRunButton
                            card={card}
                            context={cardContext(card, cardTypes)}
                            onConversationViewed={handleConversationViewed}
                            projectKey={projectKey}
                        />
                    </Box>
                    <Tooltip title="Open in file mode">
                        <IconButton
                            aria-label={`Open ${card.header.id} in file mode`}
                            onClick={openInFileMode}
                            size="small"
                            sx={{ border: 1, borderColor: 'divider', borderRadius: '50%', height: 26, pointerEvents: 'auto', width: 26 }}
                        >
                            <FileDocumentOutline sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                    <Box sx={{ flex: 1 }} />
                    <CardWorktreeIndicator
                        card={card}
                        primaryPath={primaryPath}
                        worktrees={worktrees}
                    />
                </Stack>
            </Box>
            <Menu
                anchorEl={actionsAnchorElement}
                anchorPosition={actionsMenuPosition ?? undefined}
                anchorReference={actionsMenuPosition ? 'anchorPosition' : 'anchorEl'}
                keepMounted
                onClose={closeCardActions}
                open={!!actionsAnchorElement || !!actionsMenuPosition}
            >
                <ActionEntryPoints
                    context={cardContext(card, cardTypes)}
                    onMenuItemSelected={closeCardActions}
                    popupAnchorElement={node.current}
                    variant="menuItems"
                />
                {policyKeys.map((policyKey) => (
                    <CardPolicyMenuItem
                        key={policyKey}
                        cardPath={card.path}
                        enabled={card.header.policy[policyKey] ?? false}
                        onSelected={closeCardActions}
                        onToggle={onTogglePolicy}
                        policyKey={policyKey}
                    />
                ))}
                <MenuItem onClick={openBodyFromMenu}>Open body</MenuItem>
                <MenuItem onClick={openInFileModeFromMenu}>Open in file mode</MenuItem>
                <MenuItem onClick={editTitleFromMenu}>Edit title</MenuItem>
                <MenuItem onClick={openDeleteCardDialog}>Delete</MenuItem>
            </Menu>
            <CardDeleteDialog cardPath={deleteCardPath} onClose={closeDeleteCardDialog} onDeleteCard={onDeleteCard} />
        </Box>
    )
}
