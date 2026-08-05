import { Box, IconButton, Menu, MenuItem, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import { useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, KeyboardEvent, MouseEvent, TouchEvent } from 'react'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import { cardContext } from '../../data/action_context'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { dialogService } from '../../services/dialog_service'
import { ActionEntryPoints } from '../actions/action_entry_points'
import { CardRunButton } from '../actions/card_run_button'
import { useRunningActionForContext } from '../hooks/use_action_runs'
import { CardDeleteDialog } from './card_delete_dialog'
import { CardPolicyMenuItem } from './card_policy_menu_item'
import { CardWorktreeIndicator } from './card_worktree_indicator'
import { getCardTypeColor } from './card_drag'
import { useProjectCard } from './use_project_card'
import { useProjectReference } from '../hooks/use_project_reference'
import { useIsWorkspacePathSelected } from '../hooks/use_is_workspace_path_selected'
import { cardBodyPopoverService, subscribeCardBodyPopover } from './card_body_popover_service'
import { ProjectCardDragContainer } from './project_card_drag_container'

const CARD_LONG_PRESS_MS = 500

export interface CardHandlers {
    onDeleteCard: (path: string) => Promise<void>
    onOpenInFileMode: (path: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
}

interface ProjectCardViewProps extends CardHandlers {
    cardPath: string
    cardTypes: CardTypeConfig[]
}

interface ProjectCardViewContentProps extends CardHandlers {
    card: ProjectCard
    cardTypes: CardTypeConfig[]
    isSelected: boolean
    primaryPath: string
}

interface MenuPosition {
    left: number
    top: number
}

/** A three-row draggable card with compact metadata and consolidated actions. */
export function ProjectCardView(props: ProjectCardViewProps) {
    const { cardPath, ...contentProps } = props
    const card = useProjectCard(cardPath)
    const project = useProjectReference()
    const isSelected = useIsWorkspacePathSelected(cardPath)
    if (!card || !project) return null

    const primaryPath = project.rootPath ?? project.id
    return (
        <ProjectCardViewContent
            card={card}
            isSelected={isSelected}
            primaryPath={primaryPath}
            {...contentProps}
        />
    )
}

function ProjectCardViewContent(props: ProjectCardViewContentProps) {
    const { card, cardTypes, isSelected, primaryPath } = props
    const { onOpenInFileMode } = props
    const { onDeleteCard, onTogglePolicy, onTitleChange } = props
    const theme = useTheme()
    const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null)
    const [actionsAnchorElement, setActionsAnchorElement] = useState<HTMLElement | null>(null)
    const [actionsMenuPosition, setActionsMenuPosition] = useState<MenuPosition | null>(null)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [longPressTimer, setLongPressTimer] = useState<number | null>(null)
    const [titleDraft, setTitleDraft] = useState(card.header.title)
    const isBodyOpen = useSyncExternalStore(
        subscribeCardBodyPopover,
        () => cardBodyPopoverService.getSnapshot().cardPath === card.path,
        () => false,
    )
    const accentColor = getCardTypeColor(cardTypes, card.header.id) ?? theme.palette.primary.main
    const accentBackground = alpha(accentColor, 0.16)
    const context = cardContext(card, cardTypes)
    const runningRun = useRunningActionForContext(context)
    const statusLabel = runningRun ? 'Running' : 'Idle'

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
        if (isEditingTitle) return

        cardBodyPopoverService.toggle(card.path, event.currentTarget)
        telemetryService.trackEvent('navigation')
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
        try {
            if (!cardElement) throw new Error(`Missing card element: ${card.path}`)
            closeCardActions()
            cardBodyPopoverService.toggle(card.path, cardElement)
            telemetryService.trackEvent('navigation')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card details could not be opened' })
        }
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
    const dragInteractions = {
        onClick: handleCardClick,
        onContextMenu: openCardContextMenu,
        onTouchEnd: handleCardTouchEnd,
        onTouchStart: handleCardTouchStart,
    }

    return (
        <ProjectCardDragContainer
            cardId={card.header.id}
            cardPath={card.path}
            interactions={dragInteractions}
            isBodyOpen={isBodyOpen}
            isSelected={isSelected}
            onCardElementChange={setCardElement}
        >
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
                        <Box sx={{ bgcolor: runningRun ? 'success.main' : 'text.disabled', borderRadius: '50%', height: 7, width: 7 }} />
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
                            context={context}
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
                    />
                </Stack>
            </Box>
            <Menu
                anchorEl={actionsAnchorElement}
                anchorPosition={actionsMenuPosition ?? undefined}
                anchorReference={actionsMenuPosition ? 'anchorPosition' : 'anchorEl'}
                onClose={closeCardActions}
                open={!!actionsAnchorElement || !!actionsMenuPosition}
            >
                <ActionEntryPoints
                    context={context}
                    onMenuItemSelected={closeCardActions}
                    popupAnchorElement={cardElement}
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
        </ProjectCardDragContainer>
    )
}
