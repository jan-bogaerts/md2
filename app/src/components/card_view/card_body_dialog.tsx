import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import type { ProjectCard } from '../../data/data_types'
import { CardBodyEditor } from './card_body_editor'

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

    const openInFileMode = () => {
        if (card) onOpenInFileMode(card.path)
    }

    const deleteCard = async () => {
        if (!card) return

        const confirmed = window.confirm(`Delete ${card.path}?`)
        if (!confirmed) return

        try {
            await onDeleteCard(card.path)
        } catch {
            // ProjectWorkspace owns the user-visible delete error.
        }
    }

    return (
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
                        <Button color="error" onClick={deleteCard}>Delete</Button>
                        <Button onClick={openInFileMode}>Open in file mode</Button>
                        <Button onClick={onClose}>Close</Button>
                    </DialogActions>
                </>
            ) : null}
        </Dialog>
    )
}
