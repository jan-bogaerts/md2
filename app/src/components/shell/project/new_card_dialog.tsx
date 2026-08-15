import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import Close from 'mdi-material-ui/Close'
import Plus from 'mdi-material-ui/Plus'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardDraft, CardTypeConfig, StateConfig } from '../../../data/data_types'
import { useCardCreationState } from '../../hooks/use_card_creation_state'
import { CardTypePillGroup } from './card_type_pill_group'
import { NewCardMarkdownEditor } from './new_card_markdown_editor'
import { projectSessionService } from '../../../services/project/project_session_service'
import { dialogService } from '../../../services/dialog_service'
import { NewCardColumnPicker } from './new_card_column_picker'
import { MarkdownAttachmentControl } from '../../editor/markdown_attachment_control'
import { attachFilesToNewCardMarkdown } from '../../../services/attachments/new_card_attachment_workflow'

const DIALOG_WIDTH = 480
const DISCARD_CARD_MESSAGE = 'Discard this new card draft?'

function attachFilesToNewCardDraft(files: File[]) {
    void attachFilesToNewCardMarkdown(files, projectSessionService.newCardMarkdownDraft.requestInsertion).catch((error: unknown) => {
        dialogService.error(error, { fallbackMessage: 'Files could not be attached' })
    })
}

interface NewCardDialogProps {
    cardBodyTemplate: string
    cardTypes: CardTypeConfig[]
    initialTargetStatus: string
    isLoading: boolean
    isProjectOpen: boolean
    open: boolean
    onClose: () => void
    onCreateCard: (draft: CardDraft, initialState: string) => Promise<void>
    states: StateConfig[]
}

/** Responsive form for creating a card in a selected board column. */
export function NewCardDialog(props: NewCardDialogProps) {
    const {
        cardBodyTemplate,
        cardTypes,
        initialTargetStatus,
        isLoading,
        isProjectOpen,
        onClose,
        onCreateCard,
        open,
        states,
    } = props
    const { isCreatingCard } = useCardCreationState()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const wasOpenRef = useRef(false)
    const [isInsertedTemplateUntouched, setIsInsertedTemplateUntouched] = useState(false)
    const [targetStatus, setTargetStatus] = useState('')
    const [title, setTitle] = useState('')
    const [type, setType] = useState('')
    const defaultType = cardTypes[0]?.type ?? ''
    const defaultStatus = states[0]?.state ?? ''
    const selectedType = cardTypes.some((typeConfig) => typeConfig.type === type) ? type : defaultType
    const selectedStatus = states.some((stateConfig) => stateConfig.state === targetStatus) ? targetStatus : defaultStatus
    const isSubmitDisabled = !isProjectOpen || title.trim().length === 0
        || selectedType.length === 0 || selectedStatus.length === 0 || isLoading || isCreatingCard

    const resetForm = () => {
        projectSessionService.newCardMarkdownDraft.replace('')
        setIsInsertedTemplateUntouched(false)
        setTargetStatus(initialTargetStatus)
        setTitle('')
        setType(defaultType)
    }

    useEffect(() => {
        if ((open && !wasOpenRef.current) || !isProjectOpen) {
            projectSessionService.newCardMarkdownDraft.replace('')
            setIsInsertedTemplateUntouched(false)
            setTargetStatus(initialTargetStatus)
            setTitle('')
            setType(defaultType)
        }
        wasOpenRef.current = open && isProjectOpen
    }, [defaultType, initialTargetStatus, isProjectOpen, open])

    const closeDialog = async () => {
        const body = projectSessionService.newCardMarkdownDraft.getSnapshot()
        const isDirty = title.length > 0
            || body.length > 0
            || selectedType !== defaultType
            || selectedStatus !== initialTargetStatus
            || projectSessionService.hasNewCardDraftImages()
        if (isDirty && !window.confirm(DISCARD_CARD_MESSAGE)) return

        try {
            await projectSessionService.discardNewCardDraftImages()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Pasted draft images could not be removed' })
            return
        }
        resetForm()
        onClose()
    }

    const handleDialogClose = () => {
        void closeDialog()
    }

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTitle(event.target.value)
    }

    const handleBodyDirtyChange = useCallback((dirty: boolean) => {
        if (dirty) setIsInsertedTemplateUntouched(false)
    }, [])

    const handleTemplateClick = () => {
        const body = projectSessionService.newCardMarkdownDraft.getSnapshot()
        if (isInsertedTemplateUntouched && body === cardBodyTemplate) {
            projectSessionService.newCardMarkdownDraft.replace('')
            setIsInsertedTemplateUntouched(false)

            return
        }

        const nextBody = body.length > 0 ? `${body}\n\n${cardBodyTemplate}` : cardBodyTemplate
        projectSessionService.newCardMarkdownDraft.replace(nextBody)
        setIsInsertedTemplateUntouched(body.length === 0)
    }

    const handleCreateClick = async () => {
        if (isSubmitDisabled) return

        await projectSessionService.waitForNewCardImageSaves()
        const body = projectSessionService.newCardMarkdownDraft.getSnapshot()
        const draft: CardDraft = {
            body,
            bodyIncludesTemplate: true,
            title: title.trim(),
            type: selectedType,
        }
        try {
            await onCreateCard(draft, selectedStatus)
        } catch {
            return
        }
        resetForm()
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        await handleCreateClick()
    }

    const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
        if (event.key !== 'Escape') return

        event.preventDefault()
        void closeDialog()
    }

    const handleFormKeyDownCapture = (event: KeyboardEvent<HTMLFormElement>) => {
        if (event.key !== 'Enter' || !event.ctrlKey) return

        event.preventDefault()
        event.stopPropagation()
        void handleCreateClick()
    }

    const templateButtonLabel = isInsertedTemplateUntouched ? 'Clear' : 'Template'
    const createButton = (
        <Button aria-label="Create card" disabled={isSubmitDisabled} type="submit" variant="contained">
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Plus sx={{ fontSize: 17 }} />
                <span>Add</span>
                {!isMobile ? (
                    <Box
                        component="span"
                        sx={{
                            bgcolor: 'rgba(255,255,255,0.18)',
                            borderRadius: '5px',
                            fontSize: 10.5,
                            fontWeight: 600,
                            px: 0.625,
                            py: 0.25,
                        }}
                    >
                        Ctrl+↵
                    </Box>
                ) : null}
            </Stack>
        </Button>
    )

    return (
        <Dialog
            aria-labelledby="new-card-dialog-heading"
            fullScreen={isMobile}
            maxWidth={false}
            onClose={handleDialogClose}
            open={open}
            slotProps={{
                backdrop: { sx: { backdropFilter: 'blur(2px)', backgroundColor: 'rgba(16, 24, 40, 0.45)' } },
                paper: {
                    sx: {
                        border: isMobile ? 0 : 1,
                        borderColor: 'divider',
                        borderRadius: isMobile ? 0 : '14px',
                        boxShadow: isMobile ? 'none' : '0 24px 60px rgba(16,24,40,0.28)',
                        height: isMobile ? '100dvh' : 'auto',
                        maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 32px)',
                        maxWidth: isMobile ? '100%' : 'calc(100% - 32px)',
                        overflow: 'hidden',
                        width: isMobile ? '100%' : DIALOG_WIDTH,
                    },
                },
            }}
        >
            <Box
                component="form"
                onKeyDown={handleFormKeyDown}
                onKeyDownCapture={handleFormKeyDownCapture}
                onSubmit={handleSubmit}
                sx={{ display: 'flex', flexDirection: 'column', height: isMobile ? '100%' : 'auto', maxHeight: '100dvh', minHeight: 0 }}
            >
                <DialogTitle
                    component="div"
                    id="new-card-dialog-header"
                    sx={{
                        alignItems: 'center',
                        borderBottom: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        flexShrink: 0,
                        gap: 1.25,
                        minHeight: isMobile ? 56 : 62,
                        px: isMobile ? 1 : 2.25,
                        py: 1,
                    }}
                >
                    {isMobile ? (
                        <Button onClick={handleDialogClose} sx={{ minHeight: 44, minWidth: 72 }} type="button" variant="text">
                            Cancel
                        </Button>
                    ) : (
                        <Box
                            sx={{
                                alignItems: 'center',
                                bgcolor: 'custom.primaryBg',
                                borderRadius: 1,
                                color: 'primary.main',
                                display: 'flex',
                                height: 30,
                                justifyContent: 'center',
                                width: 30,
                            }}
                        >
                            <Plus sx={{ fontSize: 18 }} />
                        </Box>
                    )}
                    <Typography
                        component="h2"
                        id="new-card-dialog-heading"
                        sx={{
                            flex: 1,
                            fontSize: isMobile ? 16 : 15.5,
                            fontWeight: 700,
                            textAlign: isMobile ? 'center' : 'left',
                        }}
                    >
                        New card
                    </Typography>
                    {isMobile ? (
                        <Button disabled={isSubmitDisabled} sx={{ minHeight: 44, minWidth: 72 }} type="submit" variant="text">
                            Create
                        </Button>
                    ) : (
                        <Tooltip title="Close">
                            <IconButton aria-label="Close" onClick={handleDialogClose} size="small" sx={{ height: 30, width: 30 }}>
                                <Close sx={{ fontSize: 17 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </DialogTitle>
                <DialogContent
                    data-testid="new-card-dialog-content"
                    sx={{
                        display: 'flex',
                        flex: 1,
                        flexDirection: 'column',
                        gap: isMobile ? 2.25 : 2,
                        minHeight: 0,
                        overflowY: 'auto',
                        px: isMobile ? 2 : 2.25,
                        py: isMobile ? 2.25 : 2.25,
                    }}
                >
                    <TextField
                        autoFocus
                        fullWidth
                        id="new-card-title"
                        onChange={handleTitleChange}
                        placeholder="Card title…"
                        slotProps={{ htmlInput: { 'aria-label': 'Title' } }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: isMobile ? '11px' : '9px',
                                mt: 1,
                                height: isMobile ? 48 : 46,
                                '&.Mui-focused': { boxShadow: (currentTheme) => `0 0 0 3px ${currentTheme.palette.custom.primaryBg}` },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'custom.borderStrong' },
                            },
                            '& input': {
                                fontSize: isMobile ? 18 : 17,
                                fontWeight: 600,
                            },
                        }}
                        value={title}
                        variant="outlined"
                    />
                    <CardTypePillGroup
                        cardTypes={cardTypes}
                        isMobile={isMobile}
                        onChange={setType}
                        selectedType={selectedType}
                    />
                    <Stack spacing={isMobile ? 1.125 : 0.875}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography color="text.secondary" id="new-card-description-label" sx={{ fontSize: 12, fontWeight: 600 }}>
                                Description
                            </Typography>
                            {!isMobile ? (
                                <Typography color="custom.text3" sx={{ fontSize: 11.5 }}>
                                    Markdown
                                </Typography>
                            ) : null}
                            <Box sx={{ flex: 1 }} />
                            <Button
                                disabled={cardBodyTemplate.length === 0}
                                onClick={handleTemplateClick}
                                size="small"
                                sx={{ minHeight: isMobile ? 44 : 30 }}
                                type="button"
                                variant="outlined"
                            >
                                {templateButtonLabel}
                            </Button>
                        </Stack>
                        <Box
                            aria-labelledby="new-card-description-label"
                            data-testid="new-card-description"
                            role="group"
                            sx={{
                                bgcolor: 'background.paper',
                                border: 1,
                                borderColor: 'custom.borderStrong',
                                borderRadius: isMobile ? '11px' : '9px',
                                boxSizing: 'border-box',
                                color: 'text.primary',
                                height: isMobile ? 260 : 270,
                                minHeight: isMobile ? 260 : 270,
                                outline: 'none',
                                overflow: 'auto',
                                resize: isMobile ? 'none' : 'vertical',
                                width: '100%',
                                '&:focus-within': {
                                    borderColor: 'primary.main',
                                    boxShadow: (currentTheme) => `0 0 0 3px ${currentTheme.palette.custom.primaryBg}`,
                                },
                                '&:hover:not(:focus-within)': { borderColor: 'custom.borderHover' },
                                '& > [data-sticky-toolbar]': { minHeight: '100%' },
                                '& .light-theme, & .dark-theme': { minHeight: '100%' },
                                '& .mdxeditor-content': {
                                    boxSizing: 'border-box',
                                    minHeight: isMobile ? 258 : 268,
                                    p: 1.625,
                                },
                            }}
                        >
                            <NewCardMarkdownEditor
                                draft={projectSessionService.newCardMarkdownDraft}
                                onDirtyChange={handleBodyDirtyChange}
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions
                    sx={{
                        alignItems: 'stretch',
                        bgcolor: 'background.default',
                        borderTop: 1,
                        borderColor: 'divider',
                        flexDirection: isMobile ? 'column' : 'row',
                        flexShrink: 0,
                        gap: isMobile ? 1.5 : 1,
                        justifyContent: 'space-between',
                        m: 0,
                        px: isMobile ? 2 : 2.25,
                        py: isMobile ? 1.5 : 1.5,
                        pb: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 1.5,
                    }}
                >
                    <Stack
                        data-testid="new-card-footer-start"
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'center', minWidth: 0, width: isMobile ? '100%' : 'auto' }}
                    >
                        <MarkdownAttachmentControl disabled={false} onFiles={attachFilesToNewCardDraft} />
                        <NewCardColumnPicker
                            isMobile={isMobile}
                            onChange={setTargetStatus}
                            selectedStatus={selectedStatus}
                            states={states}
                        />
                    </Stack>
                    {isMobile ? createButton : (
                        <Stack direction="row" spacing={1}>
                            <Button onClick={handleDialogClose} type="button" variant="outlined">
                                Cancel
                            </Button>
                            {createButton}
                        </Stack>
                    )}
                </DialogActions>
            </Box>
        </Dialog>
    )
}
