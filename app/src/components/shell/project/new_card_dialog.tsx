import {
    alpha,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
    type Theme,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import Close from 'mdi-material-ui/Close'
import Plus from 'mdi-material-ui/Plus'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { useRef, useState } from 'react'
import type { CardDraft, CardTypeConfig } from '../../../data/data_types'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../editor/markdown_editor'

const CONTROL_HEIGHT = 42
const DIALOG_WIDTH = 480

function fieldSx(theme: Theme) {
    return {
        '& .MuiOutlinedInput-root': {
            borderRadius: '9px',
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.14)}` },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.divider },
            '&:not(.MuiInputBase-multiline)': { height: CONTROL_HEIGHT },
        },
    }
}

function selectSx(theme: Theme) {
    return {
        borderRadius: '9px',
        height: CONTROL_HEIGHT,
        '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.14)}` },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.divider },
    }
}

function markdownEditorFrameSx(theme: Theme) {
    return {
        border: 1,
        borderColor: 'divider',
        borderRadius: '9px',
        overflow: 'hidden',
        '&:focus-within': {
            borderColor: 'primary.main',
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.14)}`,
        },
        '& .mdxeditor-toolbar': {
            borderBottom: 1,
            borderColor: 'divider',
            borderRadius: 0,
            flexWrap: 'wrap',
            gap: 0.25,
            padding: 0.5,
        },
        '& .mdxeditor-content': {
            minHeight: 120,
            padding: '12px 14px',
        },
    }
}

function iconBadgeSx(theme: Theme) {
    return {
        alignItems: 'center',
        backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.1),
        borderRadius: '8px',
        color: 'primary.main',
        display: 'flex',
        height: 30,
        justifyContent: 'center',
        width: 30,
    }
}

interface NewCardDialogProps {
    cardBodyTemplate: string
    cardTypes: CardTypeConfig[]
    isLoading: boolean
    isProjectOpen: boolean
    open: boolean
    onClose: () => void
    onCreateCard: (draft: CardDraft) => Promise<void>
}

/** Dialog for creating a new project card. */
export function NewCardDialog(props: NewCardDialogProps) {
    const { cardBodyTemplate, cardTypes, isLoading, isProjectOpen, onClose, onCreateCard, open } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    // The editor is uncontrolled while typing; `body` only keeps the draft across
    // dialog close/reopen (populated by the editor's flush on unmount).
    const [body, setBody] = useState(cardBodyTemplate)
    const bodyEditorRef = useRef<MarkdownEditorHandle>(null)
    const [dialogPaperElement, setDialogPaperElement] = useState<HTMLDivElement | null>(null)
    const [title, setTitle] = useState('')
    const [type, setType] = useState('feature')
    const selectedType = cardTypes.some((typeConfig) => typeConfig.type === type) ? type : cardTypes[0]?.type ?? ''
    const isSubmitDisabled = !isProjectOpen || title.length === 0 || selectedType.length === 0 || isLoading

    const handleTypeChange = (event: SelectChangeEvent) => {
        setType(event.target.value)
    }

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTitle(event.target.value)
    }

    const handleCreateClick = async () => {
        if (isSubmitDisabled) return

        const draft: CardDraft = {
            body: bodyEditorRef.current?.getMarkdown() ?? body,
            bodyIncludesTemplate: true,
            title,
            type: selectedType,
        }
        try {
            await onCreateCard(draft)
        } catch {
            return
        }
        bodyEditorRef.current?.setMarkdown(cardBodyTemplate)
        setBody(cardBodyTemplate)
        setTitle('')
        setType('feature')
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        await handleCreateClick()
    }

    const handleBodyKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return

        event.preventDefault()
        void handleCreateClick()
    }

    return (
        <Dialog
            maxWidth={false}
            onClose={onClose}
            open={open}
            slotProps={{
                backdrop: { sx: { backdropFilter: 'blur(2px)', backgroundColor: 'rgba(16, 24, 40, 0.45)' } },
                paper: {
                    ref: setDialogPaperElement,
                    sx: {
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: '14px',
                        boxShadow: '0 24px 60px rgba(16,24,40,0.28)',
                        maxHeight: 'calc(100dvh - 32px)',
                        maxWidth: 'calc(100% - 32px)',
                        overflow: 'hidden',
                        width: DIALOG_WIDTH,
                    },
                },
            }}
        >
            <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)', minHeight: 0, overflow: 'hidden' }}
            >
                <DialogTitle
                    sx={{
                        alignItems: 'center',
                        borderBottom: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        gap: 1.25,
                        minHeight: 66,
                        px: 2.5,
                        py: 1.5,
                        flexShrink: 0,
                    }}
                >
                    <Box sx={iconBadgeSx}>
                        <Plus fontSize="small" />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
                            New card
                        </Typography>
                        <Typography aria-hidden color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.35 }}>
                            Add a card to the board
                        </Typography>
                    </Box>
                    <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: 'text.disabled', height: 30, width: 30 }}>
                        <Close sx={{ fontSize: 17 }} />
                    </IconButton>
                </DialogTitle>
                <DialogContent
                    data-testid="new-card-dialog-content"
                    sx={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 2.25, minHeight: 0, overflowY: 'auto', px: 2.5, py: 2.5 }}
                >
                    <Stack data-testid="new-card-heading-row" direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
                        <Stack spacing={0.75} sx={{ flex: isMobile ? '0 0 72px' : '0 0 150px', minWidth: 0 }}>
                            <Typography color="text.secondary" id="card-type-label" sx={{ fontSize: 12, fontWeight: 600 }}>
                                Card type
                            </Typography>
                            <Select
                                labelId="card-type-label"
                                onChange={handleTypeChange}
                                renderValue={() => {
                                    const selectedTypeConfig = cardTypes.find((typeConfig) => typeConfig.type === selectedType)

                                    return (
                                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                            <Box
                                                aria-hidden
                                                data-testid="selected-card-type-icon"
                                                sx={{ backgroundColor: selectedTypeConfig?.color, borderRadius: '50%', height: 9, width: 9 }}
                                            />
                                            {!isMobile ? <span>{selectedTypeConfig?.label}</span> : null}
                                        </Stack>
                                    )
                                }}
                                size="small"
                                sx={selectSx}
                                value={selectedType}
                            >
                                {cardTypes.map((typeConfig) => (
                                    <MenuItem key={typeConfig.type} value={typeConfig.type}>
                                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                            <Box aria-hidden sx={{ backgroundColor: typeConfig.color, borderRadius: '50%', height: 9, width: 9 }} />
                                            <span>{typeConfig.label}</span>
                                        </Stack>
                                    </MenuItem>
                                ))}
                            </Select>
                        </Stack>
                        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
                            <Typography color="text.secondary" component="label" htmlFor="new-card-title" sx={{ fontSize: 12, fontWeight: 600 }}>
                                Title
                            </Typography>
                            <TextField
                                autoFocus
                                id="new-card-title"
                                onChange={handleTitleChange}
                                placeholder="Short, descriptive name"
                                size="small"
                                sx={fieldSx}
                                value={title}
                                variant="outlined"
                            />
                        </Stack>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Stack direction="row" spacing={1}>
                            <Typography color="text.secondary" id="new-card-body-label" sx={{ fontSize: 12, fontWeight: 600 }}>
                                Body
                            </Typography>
                            <Typography color="text.disabled" sx={{ fontSize: 11.5 }}>
                                Markdown supported
                            </Typography>
                        </Stack>
                        <Box
                            aria-labelledby="new-card-body-label"
                            onKeyDownCapture={handleBodyKeyDown}
                            role="group"
                            sx={markdownEditorFrameSx}
                        >
                            <MarkdownEditor
                                hideToolbar
                                markdown={body}
                                onChange={setBody}
                                overlayContainer={dialogPaperElement}
                                ref={bodyEditorRef}
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions
                    sx={{
                        backgroundColor: 'background.default',
                        borderColor: 'divider',
                        borderTop: 1,
                        justifyContent: 'space-between',
                        minHeight: 65,
                        px: 2.5,
                        py: 1.5,
                        flexShrink: 0,
                    }}
                >
                    {!isMobile ? (
                        <>
                            <Stack color="text.secondary" direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                                <CardsOutline sx={{ fontSize: 14 }} />
                                <Typography sx={{ fontSize: 12 }}>
                                    Adds to <Box component="strong" sx={{ color: 'text.primary', fontWeight: 600, ml: 0.5 }}>New</Box>
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1.25}>
                                <Button onClick={onClose} type="button" variant="outlined">
                                    Cancel
                                </Button>
                                <Button disabled={isSubmitDisabled} startIcon={<Plus />} type="submit" variant="contained">
                                    Create card
                                </Button>
                            </Stack>
                        </>
                    ) : (
                        <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'flex-end', width: '100%' }}>
                            <Tooltip title="Cancel">
                                <IconButton aria-label="Cancel" onClick={onClose} type="button">
                                    <Close />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Create card">
                                <span>
                                    <IconButton
                                        aria-label="Create card"
                                        disabled={isSubmitDisabled}
                                        sx={{
                                            backgroundColor: 'primary.main',
                                            color: 'primary.contrastText',
                                            '&:hover': { backgroundColor: 'primary.dark' },
                                        }}
                                        type="submit"
                                    >
                                        <Plus />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Stack>
                    )}
                </DialogActions>
            </Box>
        </Dialog>
    )
}
