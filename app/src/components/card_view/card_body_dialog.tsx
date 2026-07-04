import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import type { ProjectCard } from '../../data/data_types'
import { CardBodyEditor } from './card_body_editor'

interface CardBodyDialogProps {
    card: ProjectCard | null
    onBodyChange: (path: string, body: string) => void
    onClose: () => void
    onOpenInFileMode: (path: string) => void
}

/** Desktop presentation of a card body: a modal dialog with the body editor. */
export function CardBodyDialog(props: CardBodyDialogProps) {
    const { card, onBodyChange, onClose, onOpenInFileMode } = props

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
                        <Button onClick={() => onOpenInFileMode(card.path)}>Open in file mode</Button>
                        <Button onClick={onClose}>Close</Button>
                    </DialogActions>
                </>
            ) : null}
        </Dialog>
    )
}
