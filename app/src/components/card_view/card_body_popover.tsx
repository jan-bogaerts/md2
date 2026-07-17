import { alpha, Box, Button, IconButton, InputBase, Tooltip, Typography } from '@mui/material'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useState } from 'react'
import Close from 'mdi-material-ui/Close'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import FolderSearchOutline from 'mdi-material-ui/FolderSearchOutline'
import type { ProjectCard } from '../../data/data_types'
import { ResizablePopover } from '../resizable_popover'
import { useRunningActionForFile } from '../hooks/use_action_executions'
import { usePendingFileSave } from '../hooks/use_pending_file_save'
import { CardBodyEditor } from './card_body_editor'
import { CardDeleteDialog } from './card_delete_dialog'
import { AgentUsageDisplay } from '../agents/agent_usage_display'
import { cardAgentTokenUsage } from '../../services/agent_usage'

const CARD_BODY_POPOVER_WIDTH = 760
const FULLSCREEN_INSET = 16

interface TitleEdit {
    path: string | null
    title: string
}

interface BodyDirtyState {
    dirty: boolean
    path: string | null
}

interface CardBodyPopoverProps {
    anchorElement: HTMLElement | null
    card: ProjectCard | null
    isMobile: boolean
    onBodyChange: (path: string, body: string) => void
    onClose: () => void
    onDeleteCard: (path: string) => Promise<void>
    onOpenAffects: (path: string) => void
    onOpenInFileMode: (path: string) => void
    onTitleChange: (path: string, title: string) => void
}

/** Card details editor anchored to the card that opened it. */
export function CardBodyPopover(props: CardBodyPopoverProps) {
    const {
        anchorElement,
        card,
        isMobile,
        onBodyChange,
        onClose,
        onDeleteCard,
        onOpenAffects,
        onOpenInFileMode,
        onTitleChange,
    } = props
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [bodyDirtyState, setBodyDirtyState] = useState<BodyDirtyState>({ dirty: false, path: null })
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [popupContentElement, setPopupContentElement] = useState<HTMLDivElement | null>(null)
    const [titleEdit, setTitleEdit] = useState<TitleEdit>({ path: null, title: '' })
    const titleDraft = titleEdit.path === card?.path ? titleEdit.title : card?.header.title ?? ''
    const hasPendingFileSave = usePendingFileSave(card?.path ?? null)
    const hasDirtyBody = bodyDirtyState.path === card?.path && bodyDirtyState.dirty
    const isDirty = hasDirtyBody || hasPendingFileSave

    const handleClose = () => {
        setIsFullscreen(false)
        setTitleEdit({ path: null, title: '' })
        onClose()
    }

    const openInFileMode = () => {
        if (!card) return
        setIsFullscreen(false)
        onOpenInFileMode(card.path)
    }

    const closeDeleteCardDialog = () => {
        setDeleteCardPath(null)
    }

    const openDeleteCardDialog = () => {
        if (!card) return
        setDeleteCardPath(card.path)
    }

    const openAffects = () => {
        if (card) onOpenAffects(card.path)
    }

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (!card) return
        setTitleEdit({ path: card.path, title: event.target.value })
    }

    const handleBodyDirtyChange = (path: string, dirty: boolean) => {
        setBodyDirtyState({ dirty, path })
    }

    const commitTitle = () => {
        if (!card) return
        const nextTitle = titleDraft.trim()
        if (nextTitle.length === 0) {
            setTitleEdit({ path: card.path, title: card.header.title })
            return
        }
        if (nextTitle !== card.header.title) onTitleChange(card.path, nextTitle)
    }

    const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') commitTitle()
        if (event.key === 'Escape' && card) setTitleEdit({ path: card.path, title: card.header.title })
    }

    const toggleFullscreen = () => {
        setIsFullscreen((current) => !current)
    }

    const deleteCard = async (path: string) => {
        setIsFullscreen(false)
        await onDeleteCard(path)
    }

    const titleId = card ? `card-body-popover-${card.header.internalId}` : 'card-body-popover'
    const runningExecution = useRunningActionForFile(card?.path ?? null)
    const statusLabel = runningExecution ? 'Running' : 'Idle'
    const fullscreenSize = `calc(100vw - ${FULLSCREEN_INSET * 2}px)`
    const fullscreenHeight = `calc(100vh - ${FULLSCREEN_INSET * 2}px)`

    return (
        <>
            <ResizablePopover
                anchorElement={anchorElement}
                initialSize={{ width: CARD_BODY_POPOVER_WIDTH }}
                resizeFromAllSides
                labelId={titleId}
                onClose={handleClose}
                open={!!card && !!anchorElement}
                paperSx={{
                    backgroundColor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '14px',
                    boxShadow: '0 24px 60px rgba(16, 24, 40, 0.28)',
                    flexDirection: 'column',
                    height: isFullscreen ? `${fullscreenHeight} !important` : undefined,
                    left: isFullscreen ? `${FULLSCREEN_INSET}px !important` : undefined,
                    maxHeight: isFullscreen ? 'none' : undefined,
                    maxWidth: isFullscreen ? 'none' : undefined,
                    top: isFullscreen ? `${FULLSCREEN_INSET}px !important` : undefined,
                    transform: isFullscreen ? 'none !important' : undefined,
                    width: isFullscreen ? `${fullscreenSize} !important` : undefined,
                }}
                resizeLabel="Resize card details popup"
            >
                {card ? (
                    <Box ref={setPopupContentElement} sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                        <Box
                            sx={{
                                alignItems: 'baseline',
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                flexShrink: 0,
                                gap: '10px',
                                padding: '12px 16px 12px 20px',
                            }}
                        >
                            {/* Visually hidden; provides the dialog's accessible name via aria-labelledby. */}
                            <Typography
                                id={titleId}
                                sx={{
                                    border: 0,
                                    clip: 'rect(0 0 0 0)',
                                    height: '1px',
                                    margin: '-1px',
                                    overflow: 'hidden',
                                    padding: 0,
                                    position: 'absolute',
                                    whiteSpace: 'nowrap',
                                    width: '1px',
                                }}
                            >
                                {card.header.id} card details
                            </Typography>
                            <Box
                                component="span"
                                sx={(theme) => ({
                                    backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                                    borderRadius: '5px',
                                    color: 'primary.main',
                                    flexShrink: 0,
                                    fontFamily: '"Roboto Mono", ui-monospace, monospace',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    padding: '3px 8px',
                                })}
                            >
                                {card.header.id}
                            </Box>
                            <InputBase
                                aria-label="Card title"
                                onBlur={commitTitle}
                                onChange={handleTitleChange}
                                onKeyDown={handleTitleKeyDown}
                                placeholder="Card title"
                                sx={(theme) => ({
                                    '&:focus-within': {
                                        backgroundColor: 'background.paper',
                                        borderColor: 'primary.main',
                                        boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}`,
                                    },
                                    '&:hover:not(:focus-within)': { backgroundColor: 'action.hover' },
                                    '& input': { height: '34px', padding: '0 10px' },
                                    backgroundColor: 'transparent',
                                    border: '1px solid transparent',
                                    borderRadius: '8px',
                                    color: 'text.primary',
                                    flex: 1,
                                    fontSize: 16,
                                    fontWeight: 700,
                                    minWidth: 0,
                                })}
                                value={titleDraft}
                            />
                            <Box sx={{ alignItems: 'center', color: 'text.disabled', display: 'flex', flexShrink: 0, fontSize: 11.5, gap: '5px' }}>
                                <Box sx={{ backgroundColor: runningExecution ? 'success.main' : 'text.disabled', borderRadius: '50%', height: 7, width: 7 }} />
                                {statusLabel}
                            </Box>
                            <Box sx={{ backgroundColor: 'divider', flexShrink: 0, height: 20, width: '1px' }} />
                            <Box sx={{ alignItems: 'center', color: 'text.disabled', display: 'flex', flexShrink: 0, fontSize: 11.5, gap: '5px' }}>
                                <Box sx={{ backgroundColor: isDirty ? 'warning.main' : 'success.main', borderRadius: '50%', height: 7, width: 7 }} />
                                {isDirty ? 'Dirty' : 'Saved'}
                            </Box>
                            <Tooltip title="Close">
                                <IconButton aria-label="Close card details" onClick={handleClose} size="small" sx={{ height: 30, ml: '4px', width: 30 }}>
                                    <Close sx={{ fontSize: 17 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        <CardBodyEditor
                            card={card}
                            isFullscreen={isFullscreen}
                            isMobile={isMobile}
                            onBodyChange={onBodyChange}
                            onDirtyChange={handleBodyDirtyChange}
                            onToggleFullscreen={toggleFullscreen}
                            overlayContainer={popupContentElement}
                        />

                        <Box
                            sx={{
                                alignItems: 'center',
                                backgroundColor: 'background.default',
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                flexShrink: 0,
                                gap: '8px',
                                padding: '12px 16px',
                            }}
                        >
                            <Button color="error" onClick={openDeleteCardDialog} startIcon={<DeleteOutline />} variant="outlined">Delete</Button>
                            <Button onClick={openAffects} startIcon={<FolderSearchOutline />} variant="outlined">Affects</Button>
                            <Button onClick={openInFileMode} startIcon={<FileDocumentOutline />} variant="outlined">Open in file mode</Button>
                            <AgentUsageDisplay usage={cardAgentTokenUsage(card)} />
                            <Box sx={{ flex: 1 }} />
                            <Button onClick={handleClose} variant="contained">Close</Button>
                        </Box>
                    </Box>
                ) : null}
            </ResizablePopover>
            <CardDeleteDialog cardPath={deleteCardPath} onClose={closeDeleteCardDialog} onDeleteCard={deleteCard} />
        </>
    )
}
