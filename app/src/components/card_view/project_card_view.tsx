import { Badge, Box, IconButton, Menu, MenuItem, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import Paperclip from 'mdi-material-ui/Paperclip'
import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent } from 'react'
import type { CardTypeConfig } from '../../data/data_types'
import { cardContext } from '../../data/action_context'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { dialogService } from '../../services/dialog_service'
import { ActionEntryPoints } from '../actions/run/trigger/action_entry_points'
import { CardRunButton } from '../actions/run/trigger/card_run_button'
import { useRunningActionForContext } from '../hooks/use_action_runs'
import { CardDeleteDialog } from './card_delete_dialog'
import { CardPathMenuItems } from './card_path_menu_items'
import { CardPolicyMenuItem } from './card_policy_menu_item'
import { CardWorktreeIndicator } from './card_worktree_indicator'
import { getCardTypeColor } from './card_drag'
import { useCardMetadata, useCardReferences, type CardMetadataSnapshot } from './use_project_card'
import { useProjectReference } from '../hooks/use_project_reference'
import { useIsWorkspacePathSelected } from '../hooks/use_is_workspace_path_selected'
import { cardPopupService, subscribeCardPopups } from '../../services/card_popup_service'
import { CardDragContainer } from './project_card_drag_container'
import { useProjectReadOnly } from '../hooks/use_project_read_only'
import { attachFilesToCard } from '../../services/attachments/attachment_workflow'

export interface CardHandlers {
    onDeleteCard: (path: string) => Promise<void>
    onOpenInFileMode: (path: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
}

interface CardViewProps extends CardHandlers {
    cardPath: string
    cardTypes: CardTypeConfig[]
    isMobile: boolean
}

interface CardViewContentProps extends CardHandlers {
    card: CardMetadataSnapshot
    cardTypes: CardTypeConfig[]
    isSelected: boolean
    isMobile: boolean
    references: string[]
    primaryPath: string
    rootPath: string | undefined
}

interface MenuPosition {
    left: number
    top: number
}

/** A three-row draggable card with compact metadata and consolidated actions. */
export const CardView = memo(function CardView(props: CardViewProps) {
    const { cardPath, ...contentProps } = props
    const card = useCardMetadata(cardPath)
    const references = useCardReferences(cardPath)
    const project = useProjectReference()
    const isSelected = useIsWorkspacePathSelected(cardPath)
    if (!card || !project || !references) return null

    const primaryPath = project.rootPath ?? project.id
    return (
        <CardViewContent
            card={card}
            isSelected={isSelected}
            primaryPath={primaryPath}
            references={references}
            rootPath={project.rootPath}
            {...contentProps}
        />
    )
})

function CardViewContent(props: CardViewContentProps) {
    const { card, cardTypes, isSelected, primaryPath, references, rootPath } = props
    const { onOpenInFileMode } = props
    const { onDeleteCard, onTogglePolicy, onTitleChange } = props
    const theme = useTheme()
    const readOnly = useProjectReadOnly()
    const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null)
    const [actionsAnchorElement, setActionsAnchorElement] = useState<HTMLElement | null>(null)
    const [actionsMenuPosition, setActionsMenuPosition] = useState<MenuPosition | null>(null)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [titleDraft, setTitleDraft] = useState(card.header.title)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const isBodyOpen = useSyncExternalStore(
        subscribeCardPopups,
        () => cardPopupService.getSnapshot().some((entry) => (
            entry.kind === 'card-details' && entry.cardInternalId === card.header.internalId
        )),
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

    const handleCardClick = useCallback((event: MouseEvent<HTMLElement>) => {
        if (isEditingTitle) return
        if (!card.header.internalId) {
            dialogService.error(new Error(`Missing card internal ID: ${card.path}`), { fallbackMessage: 'Card details could not be opened' })
            return
        }

        cardPopupService.toggleCardDetails(card.header.internalId, card.path, event.currentTarget)
        telemetryService.trackEvent('navigation')
    }, [card.header.internalId, card.path, isEditingTitle])

    const stopClick = (event: MouseEvent) => {
        event.stopPropagation()
    }

    const openCardActions = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        setActionsMenuPosition(null)
        setActionsAnchorElement(event.currentTarget)
    }

    const openCardContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()
        if (props.isMobile) return

        setActionsAnchorElement(null)
        setActionsMenuPosition({ left: event.clientX, top: event.clientY })
    }, [props.isMobile])

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
            if (!card.header.internalId) throw new Error(`Missing card internal ID: ${card.path}`)
            closeCardActions()
            cardPopupService.toggleCardDetails(card.header.internalId, card.path, cardElement)
            telemetryService.trackEvent('navigation')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card details could not be opened' })
        }
    }

    const openInFileModeFromMenu = () => {
        closeCardActions()
        onOpenInFileMode(card.path)
    }

    const attachFiles = useCallback((files: File[]) => {
        if (readOnly || files.length === 0) return
        void attachFilesToCard(card.path, files).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Files could not be attached to card' })
        })
    }, [card.path, readOnly])

    const openAttachmentPicker = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        fileInputRef.current?.click()
    }

    const openAttachmentPickerFromMenu = () => {
        closeCardActions()
        fileInputRef.current?.click()
    }

    const handleAttachmentFiles = (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.target.files ?? [])]
        event.target.value = ''
        attachFiles(files)
    }

    const handleExternalFileDragOver = useCallback((event: DragEvent<HTMLElement>) => {
        if (readOnly || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
    }, [readOnly])

    const handleExternalFileDrop = useCallback((event: DragEvent<HTMLElement>) => {
        if (readOnly || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        attachFiles([...event.dataTransfer.files])
    }, [attachFiles, readOnly])

    const editTitleFromMenu = () => {
        closeCardActions()
        setTitleDraft(card.header.title)
        setIsEditingTitle(true)
    }

    const closeDeleteCardDialog = () => {
        setDeleteCardPath(null)
    }

    const openDeleteCardDialog = () => {
        closeCardActions()
        setDeleteCardPath(card.path)
    }

    const policyKeys = Object.keys(card.header.policy)
    const dragInteractions = useMemo(() => ({
        onClick: handleCardClick,
        onContextMenu: openCardContextMenu,
        onDragOver: handleExternalFileDragOver,
        onDrop: handleExternalFileDrop,
    }), [handleCardClick, handleExternalFileDragOver, handleExternalFileDrop, openCardContextMenu])
    const attachmentLabel = references.length === 0
        ? `Attach files to ${card.header.id}; no files attached`
        : `Attach files to ${card.header.id}; ${references.length} attached`

    return (
        <CardDragContainer
            cardId={card.header.id}
            cardPath={card.path}
            interactions={dragInteractions}
            isBodyOpen={isBodyOpen}
            isMobile={props.isMobile}
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
                    <Tooltip title={attachmentLabel}>
                        <span>
                            <IconButton
                                aria-label={attachmentLabel}
                                disabled={readOnly}
                                onClick={openAttachmentPicker}
                                size="small"
                                sx={{
                                    border: 1,
                                    borderColor: 'divider',
                                    borderRadius: '50%',
                                    color: references.length > 0 ? 'primary.main' : 'custom.text3',
                                    height: 26,
                                    pointerEvents: 'auto',
                                    width: 26,
                                }}
                            >
                                <Badge badgeContent={references.length} color="primary" invisible={references.length === 0} max={9}>
                                    <Paperclip sx={{ fontSize: 14 }} />
                                </Badge>
                            </IconButton>
                        </span>
                    </Tooltip>
                    <input hidden multiple onChange={handleAttachmentFiles} ref={fileInputRef} type="file" />
                    <Box sx={{ flex: 1 }} />
                    {card.header.internalId ? (
                        <CardWorktreeIndicator
                            cardId={card.header.id}
                            cardInternalId={card.header.internalId}
                            cardPath={card.path}
                            primaryPath={primaryPath}
                        />
                    ) : null}
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
                        disabled={readOnly}
                        onSelected={closeCardActions}
                        onToggle={onTogglePolicy}
                        policyKey={policyKey}
                    />
                ))}
                <CardPathMenuItems cardPath={card.path} onSelected={closeCardActions} rootPath={rootPath} />
                <MenuItem onClick={openBodyFromMenu}>Open body</MenuItem>
                <MenuItem onClick={openInFileModeFromMenu}>Open in file mode</MenuItem>
                <MenuItem disabled={readOnly} onClick={openAttachmentPickerFromMenu}>
                    Attach files{references.length > 0 ? ` (${references.length})` : ''}
                </MenuItem>
                <MenuItem disabled={readOnly} onClick={editTitleFromMenu}>Edit title</MenuItem>
                <MenuItem disabled={readOnly} onClick={openDeleteCardDialog}>Delete</MenuItem>
            </Menu>
            <CardDeleteDialog cardPath={deleteCardPath} onClose={closeDeleteCardDialog} onDeleteCard={onDeleteCard} />
        </CardDragContainer>
    )
}
