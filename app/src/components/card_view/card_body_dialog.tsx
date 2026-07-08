import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { useState } from 'react'
import type { ProjectCard } from '../../data/data_types'
import { CardBodyEditor } from './card_body_editor'
import { CardDeleteDialog } from './card_delete_dialog'

interface CardBodyDialogProps {
    card: ProjectCard | null
    onBodyChange: (path: string, body: string) => void
    onClose: () => void
    onDeleteCard: (path: string) => Promise<void>
    onOpenInFileMode: (path: string) => void
}

/** Desktop presentation of a card body: a modal dialog with the body editor. */
export function CardBodyDialog(props: CardBodyDialogProps) {
    const { card, onBodyChange, onClose, onDeleteCard, onOpenInFileMode } = props
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

    return (
        <>
            <Dialog fullWidth maxWidth="md" onClose={onClose} open={!!card}>
                {card ? (
                    <>
                        <DialogTitle>
                            {card.header.id} {card.header.title}
                        </DialogTitle>
                        <DialogContent>
                            <CardBodyEditor card={card} onBodyChange={onBodyChange} />
                        </DialogContent>
                        <DialogActions>
                            <Button color="error" onClick={openDeleteCardDialog}>Delete</Button>
                            <Button onClick={openInFileMode}>Open in file mode</Button>
                            <Button onClick={onClose}>Close</Button>
                        </DialogActions>
                    </>
                ) : null}
            </Dialog>
            <CardDeleteDialog cardPath={deleteCardPath} onClose={closeDeleteCardDialog} onDeleteCard={onDeleteCard} />
        </>
    )
}
