import { Box, Button, Popover, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { ProjectCard } from '../../data/data_types'
import { CardBodyEditor } from './card_body_editor'
import { CardDeleteDialog } from './card_delete_dialog'

const CARD_BODY_POPOVER_WIDTH = 720

interface CardBodyPopoverProps {
    anchorElement: HTMLElement | null
    card: ProjectCard | null
    isMobile: boolean
    onBodyChange: (path: string, body: string) => void
    onClose: () => void
    onDeleteCard: (path: string) => Promise<void>
    onOpenAffects: (path: string) => void
    onOpenInFileMode: (path: string) => void
}

/** Card body editor anchored to the card that opened it. */
export function CardBodyPopover(props: CardBodyPopoverProps) {
    const { anchorElement, card, isMobile, onBodyChange, onClose, onDeleteCard, onOpenAffects, onOpenInFileMode } = props
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)

    const openInFileMode = () => {
        if (card) onOpenInFileMode(card.path)
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

    const titleId = card ? `card-body-popover-${card.header.internalId}` : undefined

    return (
        <>
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                onClose={onClose}
                open={!!card && !!anchorElement}
                slotProps={{
                    paper: {
                        'aria-labelledby': titleId,
                        role: 'dialog',
                        sx: { maxHeight: 'calc(100vh - 32px)', maxWidth: 'calc(100vw - 32px)', width: CARD_BODY_POPOVER_WIDTH },
                    },
                }}
                transformOrigin={{ horizontal: 'left', vertical: 'top' }}
            >
                {card ? (
                    <Stack spacing={2} sx={{ p: 2 }}>
                        <Typography id={titleId} variant="h6">
                            {card.header.id} {card.header.title}
                        </Typography>
                        <Box sx={{ minHeight: 0, overflow: 'auto' }}>
                            <CardBodyEditor card={card} isMobile={isMobile} onBodyChange={onBodyChange} />
                        </Box>
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                            <Button color="error" onClick={openDeleteCardDialog}>Delete</Button>
                            <Button onClick={openAffects}>Affects</Button>
                            <Button onClick={openInFileMode}>Open in file mode</Button>
                            <Button onClick={onClose}>Close</Button>
                        </Stack>
                    </Stack>
                ) : null}
            </Popover>
            <CardDeleteDialog cardPath={deleteCardPath} onClose={closeDeleteCardDialog} onDeleteCard={onDeleteCard} />
        </>
    )
}
