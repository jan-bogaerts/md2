import { alpha, Box, Button, Divider, IconButton, InputBase, Tooltip, Typography } from '@mui/material'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import Close from 'mdi-material-ui/Close'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import FolderSearchOutline from 'mdi-material-ui/FolderSearchOutline'
import type { CardTypeConfig } from '../../data/data_types'
import type { ActionContext } from '../../data/action_context'
import { POPOVER_SIDE_MARGIN, POPOVER_TOP_MARGIN, ResizablePopover } from '../resizable_popover'
import { useRunningActionForContext } from '../hooks/use_action_runs'
import { CardBodyEditor } from './card_body_editor'
import { CardDeleteDialog } from './card_delete_dialog'
import { AgentUsageDisplay } from '../agents/agent_usage_display'
import { cardAgentTokenUsage } from '../../services/agents/agent_usage'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { CardBodySaveStatus } from './card_body_save_status'
import { CardCommitMenu } from './card_commit_menu'
import { CardCommitDiffPanel } from './card_commit_diff_panel'
import { useCardCommits } from '../hooks/use_card_commits'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { openFilesService, type CardOpenDocument } from '../../services/open_files_service'
import { getProjectCard, useCardConversations, useCardMetadata } from './use_project_card'
import { cardBodyPopoverService, subscribeCardBodyPopover } from './card_body_popover_service'
import { useDialogError } from '../hooks/use_dialog_error'
import { dialogService } from '../../services/dialog_service'
import { isWorktreeIntegratable, worktreeService } from '../../services/project/worktree_service'

const CARD_BODY_POPOVER_WIDTH = 760
const CARD_BODY_POPOVER_HEIGHT = 620
const CARD_BODY_POPOVER_SIZE_KEY = 'md2.cardBodyPopover.size'

function subscribeOpenDocuments(onStoreChange: () => void) {
    openFilesService.addEventListener('added', onStoreChange)
    openFilesService.addEventListener('removed', onStoreChange)

    return () => {
        openFilesService.removeEventListener('added', onStoreChange)
        openFilesService.removeEventListener('removed', onStoreChange)
    }
}

function subscribeWorktrees(onStoreChange: () => void) {
    worktreeService.addEventListener('changed', onStoreChange)

    return () => worktreeService.removeEventListener('changed', onStoreChange)
}

function useBoardDocument(cardPath: string | null, cardInternalId: string | null | undefined, visible: boolean) {
    const getSnapshot = useCallback(() => {
        if (!visible || !cardPath || !cardInternalId) return null
        const card = getProjectCard(cardPath)

        return card ? openFilesService.findDocument(card) as CardOpenDocument | null : null
    }, [cardInternalId, cardPath, visible])

    return useSyncExternalStore(subscribeOpenDocuments, getSnapshot, getSnapshot)
}

interface TitleEdit {
    path: string | null
    title: string
}

interface CardBodyPopoverProps {
    cardTypes: CardTypeConfig[]
    isMobile: boolean
    onDeleteCard: (path: string) => Promise<void>
    onOpenAffects: (path: string) => void
    onOpenInFileMode: (path: string) => void
    statusColors: Map<string, string>
    visible: boolean
}

/** Card details editor anchored to the card that opened it. */
export function CardBodyPopover(props: CardBodyPopoverProps) {
    const {
        cardTypes,
        isMobile,
        onDeleteCard,
        onOpenAffects,
        onOpenInFileMode,
        statusColors,
        visible,
    } = props
    const { anchorElement, cardPath, diffSelection } = useSyncExternalStore(
        subscribeCardBodyPopover,
        () => cardBodyPopoverService.getSnapshot(),
        () => cardBodyPopoverService.getSnapshot(),
    )
    const card = useCardMetadata(cardPath)
    const activity = useCardConversations(cardPath)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const cardIdentity = card?.header.internalId
    const boardDocument = useBoardDocument(card?.path ?? null, cardIdentity, visible)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [popupContentElement, setPopupContentElement] = useState<HTMLDivElement | null>(null)
    const [titleEdit, setTitleEdit] = useState<TitleEdit>({ path: null, title: '' })
    const titleDraft = titleEdit.path === card?.path ? titleEdit.title : card?.header.title ?? ''
    const cardCommits = useCardCommits(visible ? card?.header.internalId ?? null : null)
    const worktreeRecords = useSyncExternalStore(
        subscribeWorktrees,
        () => worktreeService.getRecords(),
        () => worktreeService.getRecords(),
    )
    const assignedWorktree = card?.header.worktree
    const assignedRecord = Number.isInteger(assignedWorktree) && assignedWorktree
        ? worktreeRecords[assignedWorktree - 1]
        : null
    const currentWorktreeAvailable = !card?.header.worktreeError && isWorktreeIntegratable(assignedRecord)
    const selectedCommit = visible && diffSelection?.kind === 'commit' && diffSelection.cardInternalId === cardIdentity
        ? diffSelection.commit
        : null
    const selectedWorktree = visible && diffSelection?.kind === 'worktree'
    const hasSelectedDiff = !!selectedCommit || selectedWorktree
    const missingCardIdentityError = visible && card && !cardIdentity
        ? new Error(`Card identity was not added before opening: ${card.path}`)
        : null
    useDialogError(missingCardIdentityError, 'Card details could not be opened')

    useEffect(() => {
        if (!visible || !cardPath) {
            cardMarkdownDataSource.setBoardDocument(null)
            historyStore.clear()
            return
        }
        if (!cardIdentity) return
        const currentCard = getProjectCard(cardPath)
        if (!currentCard) return

        const document = openFilesService.openBoardDocument(currentCard)
        cardMarkdownDataSource.setBoardDocument(document)

        return () => {
            cardMarkdownDataSource.setBoardDocument(null)
            historyStore.discardDocument(document)
            openFilesService.closeBoardDocument(document)
        }
    }, [cardIdentity, cardPath, historyStore, visible])

    useEffect(() => () => {
        cardMarkdownDataSource.setBoardDocument(null)
        historyStore.clear()
    }, [historyStore])

    useEffect(() => {
        if (selectedWorktree && !currentWorktreeAvailable) cardBodyPopoverService.clearDiff()
    }, [currentWorktreeAvailable, selectedWorktree])

    useEffect(() => {
        if (diffSelection?.kind === 'commit' && diffSelection.cardInternalId !== cardIdentity) cardBodyPopoverService.clearDiff()
    }, [cardIdentity, diffSelection])

    const closePopover = () => {
        cardMarkdownDataSource.setBoardDocument(null)
        historyStore.clear()
        setIsFullscreen(false)
        setTitleEdit({ path: null, title: '' })
        cardBodyPopoverService.close()
    }

    const handlePopoverClose = (reason?: 'backdropClick' | 'escapeKeyDown') => {
        if (reason === 'escapeKeyDown' && diffSelection) {
            cardBodyPopoverService.clearDiff()
            return
        }
        closePopover()
    }

    const selectCommit = (commit: CardCommit) => {
        try {
            if (!card?.header.internalId) throw new Error('Cannot select card commit without an internal ID')
            cardBodyPopoverService.selectDiff({ cardInternalId: card.header.internalId, commit, kind: 'commit' })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card commit could not be selected' })
        }
    }
    const selectWorktree = () => cardBodyPopoverService.selectDiff({ kind: 'worktree' })
    const clearSelectedDiff = () => cardBodyPopoverService.clearDiff()

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

    const commitTitle = () => {
        if (!card) return
        const nextTitle = titleDraft.trim()
        if (nextTitle.length === 0) {
            setTitleEdit({ path: card.path, title: card.header.title })
            return
        }
        if (nextTitle !== card.header.title) cardMarkdownDataSource.updateActiveCardTitle('board-card', nextTitle)
    }

    const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') commitTitle()
        if (event.key === 'Escape' && card) setTitleEdit({ path: card.path, title: card.header.title })
    }

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen((current) => !current)
    }, [])

    const deleteCard = async (path: string) => {
        setIsFullscreen(false)
        await onDeleteCard(path)
    }

    const titleId = card ? `card-body-popover-${card.header.internalId}` : 'card-body-popover'
    const actionContext: ActionContext = {
        ...(card?.header.internalId ? { cardInternalId: card.header.internalId } : {}),
        ...(card ? { file: card.path } : {}),
        kind: 'card',
    }
    const runningRun = useRunningActionForContext(actionContext)
    const statusLabel = runningRun ? 'Running' : 'Idle'
    const fullscreenSize = `calc(100vw - ${POPOVER_SIDE_MARGIN * 2}px)`
    const fullscreenHeight = `calc(100vh - ${POPOVER_TOP_MARGIN + POPOVER_SIDE_MARGIN}px)`

    return (
        <>
            <ResizablePopover
                anchorElement={anchorElement}
                initialSize={{ height: CARD_BODY_POPOVER_HEIGHT, width: CARD_BODY_POPOVER_WIDTH }}
                sizeStorageKey={isMobile ? undefined : CARD_BODY_POPOVER_SIZE_KEY}
                resizable={!isMobile}
                resizeFromAllSides
                labelId={titleId}
                onClose={handlePopoverClose}
                open={visible && !!card && !!anchorElement}
                paperSx={{
                    backgroundColor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: isMobile ? 0 : '14px',
                    boxSizing: 'border-box',
                    boxShadow: '0 24px 60px rgba(16, 24, 40, 0.28)',
                    flexDirection: 'column',
                    height: isMobile ? '100vh !important' : isFullscreen ? `${fullscreenHeight} !important` : undefined,
                    left: isMobile ? '0 !important' : isFullscreen ? `${POPOVER_SIDE_MARGIN}px !important` : undefined,
                    margin: isMobile ? '0 !important' : undefined,
                    maxHeight: isMobile || isFullscreen ? 'none' : undefined,
                    maxWidth: isMobile || isFullscreen ? 'none' : undefined,
                    top: isMobile ? '0 !important' : isFullscreen ? `${POPOVER_TOP_MARGIN}px !important` : undefined,
                    transform: isMobile || isFullscreen ? 'none !important' : undefined,
                    width: isMobile ? '100vw !important' : isFullscreen ? `${fullscreenSize} !important` : undefined,
                }}
                resizeLabel="Resize card details popup"
            >
                {card ? (
                    <Box
                        ref={setPopupContentElement}
                        sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}
                    >
                        <Box
                            sx={{
                                alignItems: 'center',
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
                            <CardCommitMenu
                                commits={cardCommits.commits}
                                currentWorktreeAvailable={currentWorktreeAvailable}
                                error={cardCommits.error}
                                onSelectCommit={selectCommit}
                                onSelectWorktree={selectWorktree}
                            />
                            <Box sx={{
                                alignItems: 'center',
                                color: 'text.disabled',
                                display: 'flex',
                                flexShrink: 0,
                                fontSize: 11.5,
                                gap: '5px',
                            }}>
                                <Box sx={{ backgroundColor: runningRun ? 'success.main' : 'text.disabled', borderRadius: '50%', height: 7, width: 7 }} />
                                {statusLabel}
                            </Box>
                            <Divider orientation="vertical" sx={{ borderColor: 'divider', height: 20 }} />
                            {boardDocument ? <CardBodySaveStatus document={boardDocument} /> : null}
                            
                            <Tooltip title="Close">
                                <IconButton aria-label="Close card details" onClick={closePopover} size="small" sx={{ height: 30, ml: '4px', width: 30 }}>
                                    <Close sx={{ fontSize: 17 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        {selectedCommit || selectedWorktree ? (
                            <CardCommitDiffPanel
                                binding="board-card"
                                selection={selectedCommit ? { commit: selectedCommit, kind: 'commit' } : { kind: 'worktree' }}
                                key={selectedCommit?.commit ?? 'current-worktree'}
                                onExit={clearSelectedDiff}
                            />
                        ) : null}
                        <Box
                            hidden={hasSelectedDiff}
                            sx={{ display: hasSelectedDiff ? 'none' : 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}
                        >
                            <CardBodyEditor
                                cardTypes={cardTypes}
                                historyStore={historyStore}
                                isFullscreen={isFullscreen}
                                isMobile={isMobile}
                                onToggleFullscreen={toggleFullscreen}
                                overlayContainer={popupContentElement}
                                statusColors={statusColors}
                            />
                        </Box>

                        <Box
                            sx={{
                                alignItems: 'center',
                                backgroundColor: 'background.default',
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                flexShrink: 0,
                                gap: isMobile ? '4px' : '8px',
                                minWidth: 0,
                                padding: isMobile ? '8px' : '12px 16px',
                            }}
                        >
                            {isMobile ? (
                                <>
                                    <Tooltip title="Delete">
                                        <IconButton aria-label="Delete" color="error" onClick={openDeleteCardDialog}>
                                            <DeleteOutline />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Affects">
                                        <IconButton aria-label="Affects" onClick={openAffects}>
                                            <FolderSearchOutline />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Open in file mode">
                                        <IconButton aria-label="Open in file mode" onClick={openInFileMode}>
                                            <FileDocumentOutline />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            ) : (
                                <>
                                    <Button color="error" onClick={openDeleteCardDialog} startIcon={<DeleteOutline />} variant="outlined">Delete</Button>
                                    <Button onClick={openAffects} startIcon={<FolderSearchOutline />} variant="outlined">Affects</Button>
                                    <Button onClick={openInFileMode} startIcon={<FileDocumentOutline />} variant="outlined">Open in file mode</Button>
                                </>
                            )}
                            <AgentUsageDisplay usage={cardAgentTokenUsage(activity?.conversations ?? [])} />
                            <Box sx={{ flex: 1 }} />
                            {!isMobile ? <Button onClick={closePopover} variant="contained">Close</Button> : null}
                        </Box>
                    </Box>
                ) : null}
            </ResizablePopover>
            <CardDeleteDialog cardPath={visible ? deleteCardPath : null} onClose={closeDeleteCardDialog} onDeleteCard={deleteCard} />
        </>
    )
}
