import { Badge, Box, Button, Collapse, IconButton, Menu, MenuItem, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useSortable } from '@dnd-kit/sortable'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import { useState } from 'react'
import type { KeyboardEvent, MouseEvent, TouchEvent } from 'react'
import type { AgentConversation } from '../../data/data_types'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import { cardContext } from '../../data/action_context'
import { ActionEntryPoints } from '../actions/action_entry_points'
import { AgentConversationList } from '../agents/agent_conversation_list'
import { CardBodyEditor } from './card_body_editor'
import { CardDeleteDialog } from './card_delete_dialog'
import { PolicyLed } from './policy_led'

const TYPE_LINE_WIDTH = 4
const AGENT_LED_SIZE = 10
const AGENT_POPOVER_WIDTH = 420
const CARD_LONG_PRESS_MS = 500

export interface CardHandlers {
    onAffectsChange: (path: string, affects: string[]) => void
    onBodyChange: (path: string, body: string) => void
    onContinueAgentConversation: (cardPath: string, conversation: AgentConversation) => void
    onDeleteCard: (path: string) => Promise<void>
    onOpenAffects: (path: string) => void
    onOpenBody: (path: string) => void
    onOpenInFileMode: (path: string) => void
    onSendAgentInput: (runId: string, input: string) => void
    onStartAgentConversation: (cardPath: string, prompt: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
}

interface ProjectCardViewProps extends CardHandlers {
    card: ProjectCard
    cardTypeLabel?: string
    cardTypes: CardTypeConfig[]
    color?: string
    isBodyOpen: boolean
    isMobile: boolean
    isSelected: boolean
}

interface MenuPosition {
    left: number
    top: number
}

/** A single card: type-color line, id + title, policy leds, drag handle and body access. */
export function ProjectCardView(props: ProjectCardViewProps) {
    const { card, cardTypeLabel, cardTypes, color, isBodyOpen, isMobile, onBodyChange } = props
    const { onContinueAgentConversation, onOpenBody, onOpenInFileMode } = props
    const { onDeleteCard, onOpenAffects, onSendAgentInput, onStartAgentConversation } = props
    const { onTogglePolicy, onTitleChange } = props
    const { isSelected } = props
    const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: card.path })
    const [agentAnchorElement, setAgentAnchorElement] = useState<HTMLElement | null>(null)
    const [actionsAnchorElement, setActionsAnchorElement] = useState<HTMLElement | null>(null)
    const [actionsMenuPosition, setActionsMenuPosition] = useState<MenuPosition | null>(null)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [longPressTimer, setLongPressTimer] = useState<number | null>(null)
    const [titleDraft, setTitleDraft] = useState(card.header.title)

    const style = {
        opacity: isDragging ? 0.5 : 1,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
    }

    const startEditingTitle = (event: MouseEvent) => {
        event.stopPropagation()
        setTitleDraft(card.header.title)
        setIsEditingTitle(true)
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

    const handleCardClick = () => {
        if (!isEditingTitle) onOpenBody(card.path)
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

    const openAffects = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        onOpenAffects(card.path)
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
        onOpenBody(card.path)
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
    const agentSignalCount = card.agentConversations.length + card.agentConversationErrors.length
    const hasAgentSignal = agentSignalCount > 0

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
                border: isSelected ? 2 : 1,
                borderColor: isSelected ? 'primary.main' : 'divider',
                borderRadius: 1,
                display: 'flex',
                overflow: 'hidden',
                ...style,
            }}
        >
            <Box sx={{ bgcolor: color ?? 'transparent', flexShrink: 0, width: TYPE_LINE_WIDTH }} />
            <Box sx={{ flex: 1, minWidth: 0, p: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Tooltip title="Drag to reorder">
                        <IconButton
                            aria-label={`Drag ${card.header.id}`}
                            size="small"
                            sx={{ cursor: 'grab', touchAction: 'none' }}
                            {...attributes}
                            {...listeners}
                        >
                            <Box aria-hidden component="span">⠿</Box>
                        </IconButton>
                    </Tooltip>
                    <Box
                        onClick={handleCardClick}
                        sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                    >
                        {isEditingTitle ? (
                            <TextField
                                autoFocus
                                onBlur={commitTitle}
                                onChange={(event) => setTitleDraft(event.target.value)}
                                onClick={stopClick}
                                onKeyDown={handleTitleKeyDown}
                                size="small"
                                value={titleDraft}
                            />
                        ) : (
                            <Typography onDoubleClick={startEditingTitle} variant="subtitle2">
                                <Box component="span" sx={{ color: 'text.secondary', mr: 0.5 }}>
                                    {card.header.id}
                                </Box>
                                {card.header.title}
                            </Typography>
                        )}
                    </Box>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0, pt: 0.5 }}>
                        {policyKeys.map((policyKey) => (
                            <PolicyLed
                                key={policyKey}
                                enabled={card.header.policy[policyKey] === 'true'}
                                onToggle={(key) => onTogglePolicy(card.path, key)}
                                policyKey={policyKey}
                            />
                        ))}
                        <Button onClick={openAffects} size="small">
                            Affects
                        </Button>
                        <Tooltip title="Agent conversations">
                            <IconButton aria-label={`Agent conversations for ${card.header.id}`} onClick={openAgentConversations} size="small">
                                <Badge badgeContent={agentSignalCount} color="primary">
                                    <Box
                                        component="span"
                                        sx={{
                                            bgcolor: hasAgentSignal
                                                ? card.agentConversationErrors.length > 0 ? 'error.main' : 'success.main'
                                                : 'text.disabled',
                                            borderRadius: '50%',
                                            height: AGENT_LED_SIZE,
                                            width: AGENT_LED_SIZE,
                                        }}
                                    />
                                </Badge>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Open in file mode">
                            <IconButton aria-label={`Open ${card.header.id} in file mode`} onClick={openInFileMode} size="small">
                                <FileDocumentOutline fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <ActionEntryPoints context={cardContext(card, cardTypes)} variant="icons" />
                        <Tooltip title="Card actions">
                            <IconButton aria-label={`Card actions for ${card.header.id}`} onClick={openCardActions} size="small">
                                <DotsVertical fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Stack>
                {isMobile ? (
                    <Collapse in={isBodyOpen} unmountOnExit>
                        <Box onClick={stopClick} sx={{ pt: 1 }}>
                            <CardBodyEditor card={card} isMobile={isMobile} onBodyChange={onBodyChange} />
                            <Button onClick={() => onOpenInFileMode(card.path)} size="small" sx={{ mt: 1 }}>
                                Open in file mode
                            </Button>
                        </Box>
                    </Collapse>
                ) : null}
                {cardTypeLabel ? (
                    <Typography color="text.secondary" variant="caption">
                        {cardTypeLabel}
                    </Typography>
                ) : null}
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
                <ActionEntryPoints context={cardContext(card, cardTypes)} onMenuItemSelected={closeCardActions} variant="menuItems" />
                <MenuItem onClick={openBodyFromMenu}>Open body</MenuItem>
                <MenuItem onClick={openInFileModeFromMenu}>Open in file mode</MenuItem>
                <MenuItem onClick={editTitleFromMenu}>Edit title</MenuItem>
                <MenuItem onClick={openDeleteCardDialog}>Delete</MenuItem>
            </Menu>
            <CardDeleteDialog cardPath={deleteCardPath} onClose={closeDeleteCardDialog} onDeleteCard={onDeleteCard} />
        </Box>
    )
}
