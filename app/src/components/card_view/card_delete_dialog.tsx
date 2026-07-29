import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { dialogService } from '../../services/dialog_service'

interface CardDeleteDialogProps {
    cardPath: string | null
    onClose: () => void
    onDeleteCard: (path: string) => Promise<void>
}

/** Dialog for confirming card deletion without blocking the renderer. */
export function CardDeleteDialog(props: CardDeleteDialogProps) {
    const { cardPath, onClose, onDeleteCard } = props

    const handleDeleteClick = async () => {
        if (!cardPath) return
        try {
            onClose();
            await onDeleteCard(cardPath);
        } catch {
            dialogService.error(`Could not delete card at path: ${cardPath}`);
        }
    }

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={!!cardPath}>
            <DialogTitle>Delete card</DialogTitle>
            <DialogContent sx={{ wordBreak: 'break-all' }} >
                Are you sure you want to delete this card?
                {cardPath ? <Typography>Path: {cardPath}?</Typography> : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button color="error" onClick={handleDeleteClick} variant="contained">Delete</Button>
            </DialogActions>
        </Dialog>
    )
}
