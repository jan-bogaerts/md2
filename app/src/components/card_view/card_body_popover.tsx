import { alpha, Box, Button, Divider, IconButton, InputBase, Tooltip, Typography } from '@mui/material'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import Close from 'mdi-material-ui/Close'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import FolderSearchOutline from 'mdi-material-ui/FolderSearchOutline'
import type { CardTypeConfig, StateConfig } from '../../data/data_types'
import type { ActionContext } from '../../data/action_context'
import { POPOVER_SIDE_MARGIN, POPOVER_TOP_MARGIN } from '../resizable_popover'
import { ResizablePopper } from '../resizable_popper'
import { useRunningActionForContext } from '../hooks/use_action_runs'
import { CardBodyEditor } from './card_body_editor'
import { CardDeleteDialog } from './card_delete_dialog'
import { AgentUsageDisplay } from '../agents/agent_usage_display'
import { cardAgentTokenUsage } from '../../services/agents/agent_usage'
import { CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { CardBodySaveStatus } from './card_body_save_status'
import { CardCommitMenu } from './card_commit_menu'
import { CardCommitDiffPanel } from './card_commit_diff_panel'
import { useCardCommits } from '../hooks/use_card_commits'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { openFilesService } from '../../services/open_files_service'
import { useCardConversationsByInternalId, useCardMetadataByInternalId } from './use_project_card'
import { useDialogError } from '../hooks/use_dialog_error'
import { dialogService } from '../../services/dialog_service'
import { isWorktreeIntegratable, worktreeService } from '../../services/project/worktree_service'
import { dataService } from '../../services/data/data_service'
import {
    cardPopupService,
    subscribeCardPopups,
    type CardDetailsPopupEntry,
} from '../../services/card_popup_service'
import { MarkdownTypeaheadLayerProvider } from '../editor/markdown_typeahead_layer_provider'
import { useProjectReadOnly } from '../hooks/use_project_read_only'
import { CardStateSelector } from './card_state_selector'
import { NO_DRAG_REGION } from '../shell/drag_region'

const CARD_BODY_POPOVER_WIDTH = 760
const CARD_BODY_POPOVER_HEIGHT = 620
export const CARD_BODY_POPOVER_SIZE_KEY = 'md2.cardBodyPopover.size'

function subscribeWorktrees(onStoreChange: () => void) {
    worktreeService.addEventListener('changed', onStoreChange)

    return () => worktreeService.removeEventListener('changed', onStoreChange)
}

function useBoardDocument(dataSource: CardMarkdownDataSource) {
    const subscribe = useCallback((onStoreChange: () => void) => {
        dataSource.addEventListener('activeDocumentChanged', onStoreChange)

        return () => dataSource.removeEventListener('activeDocumentChanged', onStoreChange)
    }, [dataSource])
    const getSnapshot = useCallback(() => dataSource.getActiveDocument('board-card'), [dataSource])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

interface TitleEdit {
    cardInternalId: string | null
    title: string
}

interface CardBodyPopoverProps {
    cardTypes: CardTypeConfig[]
    isMobile: boolean
    onDeleteCard: (path: string) => Promise<void>
    onOpenAffects: (path: string) => void
    onOpenInFileMode: (path: string) => void
    states: StateConfig[]
    statusColors: Map<string, string>
    visible: boolean
}

interface CardBodyPopoverEntryProps extends CardBodyPopoverProps {
    entry: CardDetailsPopupEntry
    stackPosition: number
}

/** Stable renderer for every shared-manager card-details popup. */
export function CardBodyPopover(props: CardBodyPopoverProps) {
    const entries = useSyncExternalStore(
        subscribeCardPopups,
        () => cardPopupService.getSnapshot(),
        () => cardPopupService.getSnapshot(),
    )
    const topEntryId = entries.at(-1)?.id

    return entries.map((entry, stackPosition) => entry.kind === 'card-details' ? (
        <CardBodyPopoverEntry
            {...props}
            entry={entry}
            key={entry.id}
            stackPosition={stackPosition}
            visible={props.visible && (!props.isMobile || entry.id === topEntryId)}
        />
    ) : null)
}

/** Owns one card editor and all popup-local UI state for its entry lifetime. */
function CardBodyPopoverEntry(props: CardBodyPopoverEntryProps) {
    const {
        cardTypes,
        entry,
        isMobile,
        onDeleteCard,
        onOpenAffects,
        onOpenInFileMode,
        states,
        statusColors,
        stackPosition,
        visible,
    } = props
    const readOnly = useProjectReadOnly()
    const { cardInternalId, diffSelection } = entry
    const anchorElement = entry.anchorElement.isConnected ? entry.anchorElement : entry.fallbackAnchorElement
    const card = useCardMetadataByInternalId(cardInternalId)
    const activity = useCardConversationsByInternalId(cardInternalId)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const [dataSource] = useState(() => {
        const popupDataSource = new CardMarkdownDataSource()
        popupDataSource.init(dataService)
        return popupDataSource
    })
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const cardIdentity = card?.header.internalId
    const boardDocument = useBoardDocument(dataSource)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [popupContentElement, setPopupContentElement] = useState<HTMLDivElement | null>(null)
    const [titleEdit, setTitleEdit] = useState<TitleEdit>({ cardInternalId: null, title: '' })
    const titleDraft = titleEdit.cardInternalId === cardInternalId ? titleEdit.title : card?.header.title ?? ''
    const cardCommits = useCardCommits(card?.header.internalId ?? null)
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
    const selectedCommit = diffSelection?.kind === 'commit' && diffSelection.cardInternalId === cardIdentity
        ? diffSelection.commit
        : null
    const selectedWorktree = diffSelection?.kind === 'worktree'
    const hasSelectedDiff = !!selectedCommit || selectedWorktree
    const missingCardIdentityError = visible && card && !cardIdentity
        ? new Error(`Card identity was not added before opening: ${card.path}`)
        : null
    useDialogError(missingCardIdentityError, 'Card details could not be opened')

    useEffect(() => {
        const currentCard = dataService.getState().snapshot?.activeCards
            .find(({ header }) => header.internalId === cardInternalId)
        if (!currentCard) return

        const document = openFilesService.openBoardDocument(currentCard)
        dataSource.setBoardDocument(document)

        return () => {
            dataSource.setBoardDocument(null)
            historyStore.discardDocument(document)
            openFilesService.closeBoardDocument(document)
        }
    }, [cardInternalId, dataSource, historyStore])

    useEffect(() => () => {
        historyStore.clear()
        dataSource.dispose()
    }, [dataSource, historyStore])

    useEffect(() => {
        if (selectedWorktree && !currentWorktreeAvailable) cardPopupService.clearDiff(entry.id)
    }, [currentWorktreeAvailable, entry.id, selectedWorktree])

    useEffect(() => {
        if (diffSelection?.kind === 'commit' && diffSelection.cardInternalId !== cardIdentity) {
            cardPopupService.clearDiff(entry.id)
        }
    }, [cardIdentity, diffSelection, entry.id])

    const closePopover = () => {
        cardPopupService.close(entry.id)
    }

    const handlePopoverClose = () => {
        if (diffSelection) {
            cardPopupService.clearDiff(entry.id)
            return
        }
        closePopover()
    }

    const selectCommit = (commit: CardCommit) => {
        try {
            if (!card?.header.internalId) throw new Error('Cannot select card commit without an internal ID')
            cardPopupService.selectDiff(entry.id, { cardInternalId: card.header.internalId, commit, kind: 'commit' })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card commit could not be selected' })
        }
    }
    const selectWorktree = () => cardPopupService.selectDiff(entry.id, { kind: 'worktree' })
    const clearSelectedDiff = () => cardPopupService.clearDiff(entry.id)

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
        setTitleEdit({ cardInternalId, title: event.target.value })
    }

    const commitTitle = () => {
        if (!card) return
        const nextTitle = titleDraft.trim()
        if (nextTitle.length === 0) {
            setTitleEdit({ cardInternalId, title: card.header.title })
            return
        }
        if (nextTitle !== card.header.title) dataSource.updateActiveCardTitle('board-card', nextTitle)
    }

    const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') commitTitle()
        if (event.key === 'Escape' && card) setTitleEdit({ cardInternalId, title: card.header.title })
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
    const fullscreenHeight = `calc(100vh - ${POPOVER_TOP_MARGIN}px)`

    return (
        <>
            <ResizablePopper
                anchorElement={anchorElement}
                bottomInset={0}
                constrainSizeToViewport
                draggable={!isMobile && !isFullscreen}
                fullHeight={isMobile}
                initialSize={{ height: CARD_BODY_POPOVER_HEIGHT, width: CARD_BODY_POPOVER_WIDTH }}
                labelId={titleId}
                onActivate={() => cardPopupService.activate(entry.id)}
                onClose={handlePopoverClose}
                open={visible && !!card && !!anchorElement}
                paperSx={{
                    ...NO_DRAG_REGION,
                    backgroundColor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: isMobile ? 0 : '14px',
                    boxSizing: 'border-box',
                    boxShadow: '0 24px 60px rgba(16, 24, 40, 0.28)',
                    flexDirection: 'column',
                    height: isMobile ? '100dvh !important' : isFullscreen ? `${fullscreenHeight} !important` : undefined,
                    left: isMobile ? '0 !important' : isFullscreen ? `${POPOVER_SIDE_MARGIN}px !important` : undefined,
                    margin: isMobile ? '0 !important' : undefined,
                    maxHeight: isMobile || isFullscreen ? 'none' : undefined,
                    maxWidth: isMobile || isFullscreen ? 'none' : undefined,
                    top: isMobile ? '0 !important' : isFullscreen ? `${POPOVER_TOP_MARGIN}px !important` : undefined,
                    transform: isMobile || isFullscreen ? 'none !important' : undefined,
                    width: isMobile ? '100vw !important' : isFullscreen ? `${fullscreenSize} !important` : undefined,
                }}
                resizeFromAllSides={!isFullscreen}
                resizeLabel="Resize card details popup"
                stackPosition={stackPosition}
                storageKey={isMobile ? undefined : CARD_BODY_POPOVER_SIZE_KEY}
            >
                <MarkdownTypeaheadLayerProvider stackPosition={stackPosition}>
                    {card ? (
                        <Box
                            ref={setPopupContentElement}
                            sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}
                        >
                            <Box
                                data-drag-handle={!isMobile && !isFullscreen ? 'true' : undefined}
                                sx={{
                                    alignItems: 'center',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                    cursor: !isMobile && !isFullscreen ? 'move' : undefined,
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
                                    readOnly={readOnly}
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
                                    dataSource={dataSource}
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
                                    dataSource={dataSource}
                                    historyStore={historyStore}
                                    isFullscreen={isFullscreen}
                                    isMobile={isMobile}
                                    onToggleFullscreen={toggleFullscreen}
                                    overlayContainer={popupContentElement}
                                    statusColors={statusColors}
                                />
                            </Box>

                            <Box
                                data-card-details-footer="true"
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
                                <Tooltip title="Delete">
                                    <IconButton aria-label="Delete" color="error" disabled={readOnly} onClick={openDeleteCardDialog}>
                                        <DeleteOutline />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Affects">
                                    <IconButton aria-label="Affects" disabled={readOnly} onClick={openAffects}>
                                        <FolderSearchOutline />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Open in file mode">
                                    <IconButton aria-label="Open in file mode" onClick={openInFileMode}>
                                        <FileDocumentOutline />
                                    </IconButton>
                                </Tooltip>
                            
                                <AgentUsageDisplay usage={cardAgentTokenUsage(activity?.conversations ?? [])} />
                                <Box data-card-details-footer-spacer="true" sx={{ flex: 1 }} />
                                <CardStateSelector
                                    cardPath={card.path}
                                    currentState={card.header.status}
                                    disabled={readOnly}
                                    states={states}
                                    statusColors={statusColors}
                                />
                                {!isMobile ? <Button onClick={closePopover} variant="contained">Close</Button> : null}
                            </Box>
                        </Box>
                    ) : null}
                </MarkdownTypeaheadLayerProvider>
            </ResizablePopper>
            <CardDeleteDialog cardPath={visible ? deleteCardPath : null} onClose={closeDeleteCardDialog} onDeleteCard={deleteCard} />
        </>
    )
}
