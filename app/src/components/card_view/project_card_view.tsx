import { Avatar, Box, IconButton, Menu, MenuItem, Popover, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useSortable } from '@dnd-kit/sortable'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import { useState } from 'react'
import type { ChangeEvent, KeyboardEvent, MouseEvent, TouchEvent } from 'react'
import type { AgentConversation, CardTypeConfig, ProjectCard } from '../../data/data_types'
import { cardContext } from '../../data/action_context'
import { ActionEntryPoints } from '../actions/action_entry_points'
import { AgentConversationList } from '../agents/agent_conversation_list'
import { CardDeleteDialog } from './card_delete_dialog'
import { CardPolicyMenuItem } from './card_policy_menu_item'

const AGENT_POPOVER_WIDTH = 420
const CARD_LONG_PRESS_MS = 500

export interface CardHandlers {
    onContinueAgentConversation: (cardPath: string, conversation: AgentConversation) => void
    onDeleteCard: (path: string) => Promise<void>
    onOpenBody: (path: string, anchorElement: HTMLElement) => void
    onOpenInFileMode: (path: string) => void
    onSendAgentInput: (runId: string, input: string) => void
    onStartAgentConversation: (cardPath: string, prompt: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
}

interface ProjectCardViewProps extends CardHandlers {
    card: ProjectCard
    cardTypes: CardTypeConfig[]
    color?: string
    isBodyOpen: boolean
    isSelected: boolean
}

interface MenuPosition {
    left: number
    top: number
}

function initialsFor(value: string) {
    const parts = value.trim().split(/\s+/u)
    if (parts.length === 1 && parts[0].length <= 2) return parts[0].toUpperCase()

    const initials = parts.map((part) => part[0]).join('')

    return (initials || '?').slice(0, 2).toUpperCase()
}

/** A three-row draggable card with compact metadata and consolidated actions. */
export function ProjectCardView(props: ProjectCardViewProps) {
    const { card, cardTypes, color, isBodyOpen, isSelected } = props
    const { onContinueAgentConversation, onOpenBody, onOpenInFileMode } = props
    const { onDeleteCard, onSendAgentInput, onStartAgentConversation } = props
    const { onTogglePolicy, onTitleChange } = props
    const theme = useTheme()
    const sortable = useSortable({ id: card.path })
    const { attributes, isDragging, listeners, node, setActivatorNodeRef, setNodeRef, transform, transition } = sortable
    const [agentAnchorElement, setAgentAnchorElement] = useState<HTMLElement | null>(null)
    const [actionsAnchorElement, setActionsAnchorElement] = useState<HTMLElement | null>(null)
    const [actionsMenuPosition, setActionsMenuPosition] = useState<MenuPosition | null>(null)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [longPressTimer, setLongPressTimer] = useState<number | null>(null)
    const [titleDraft, setTitleDraft] = useState(card.header.title)
    const accentColor = color ?? theme.palette.primary.main
    const accentBackground = alpha(accentColor, 0.16)
    const isAgentRunning = card.agentConversations.some((conversation) => conversation.status === 'running')
    const statusLabel = isAgentRunning ? 'Running' : 'Idle'
    const assignee = card.header.owner ?? card.header.author ?? card.header.id
    const dragTranslation = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : ''
    const style = {
        opacity: isDragging ? 0 : 1,
        transform: `${dragTranslation}${isDragging ? ' rotate(2deg)' : ''}`.trim() || undefined,
        transition,
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

    const openAgentConversations = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        setAgentAnchorElement(event.currentTarget)
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

    const closeAgentConversations = () => {
        setAgentAnchorElement(null)
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

    const continueAgentConversation = (conversation: AgentConversation) => {
        onContinueAgentConversation(card.path, conversation)
    }

    const startAgentConversation = (prompt: string) => {
        onStartAgentConversation(card.path, prompt)
    }

    const policyKeys = Object.keys(card.header.policy)

    return (
        <Box
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
                        <Box sx={{ bgcolor: isAgentRunning ? 'success.main' : 'text.disabled', borderRadius: '50%', height: 7, width: 7 }} />
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
                        <ActionEntryPoints context={cardContext(card, cardTypes)} variant="button" />
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
                    <Tooltip title="Agent conversations">
                        <IconButton
                            aria-label={`Agent conversations for ${card.header.id}`}
                            onClick={openAgentConversations}
                            size="small"
                            sx={{ borderRadius: '50%', height: 26, pointerEvents: 'auto', width: 26 }}
                        >
                            <Avatar sx={{ bgcolor: accentColor, color: '#ffffff', fontSize: 9.5, fontWeight: 600, height: 22, width: 22 }}>
                                {initialsFor(assignee)}
                            </Avatar>
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>
            <Popover
                anchorEl={agentAnchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                onClose={closeAgentConversations}
                open={!!agentAnchorElement}
            >
                <Box sx={{ maxWidth: '90vw', p: 2, width: AGENT_POPOVER_WIDTH }}>
                    <AgentConversationList
                        conversations={card.agentConversations}
                        errors={card.agentConversationErrors}
                        onContinue={continueAgentConversation}
                        onSendInput={onSendAgentInput}
                        onStart={startAgentConversation}
                    />
                </Box>
            </Popover>
            <Menu
                anchorEl={actionsAnchorElement}
                anchorPosition={actionsMenuPosition ?? undefined}
                anchorReference={actionsMenuPosition ? 'anchorPosition' : 'anchorEl'}
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
