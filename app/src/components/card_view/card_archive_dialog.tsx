import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { dialogService } from '../../services/dialog_service'

interface CardArchiveDialogProps {
    cardPath: string | null
    onArchiveCard: (path: string) => Promise<void>
    onClose: () => void
}

/** Dialog for confirming that a card moves into the archived folder. */
export function CardArchiveDialog(props: CardArchiveDialogProps) {
    const { cardPath, onArchiveCard, onClose } = props

    const handleArchiveClick = async () => {
        if (!cardPath) return
        try {
            onClose();
            await onArchiveCard(cardPath);
        } catch {
            dialogService.error(`Could not archive card at path: ${cardPath}`);
        }
    }

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={!!cardPath}>
            <DialogTitle>Archive card</DialogTitle>
            <DialogContent sx={{ wordBreak: 'break-all' }} >
                Are you sure you want to archive this card?
                {cardPath ? <Typography>Path: {cardPath}?</Typography> : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button color="primary" onClick={handleArchiveClick} variant="contained">Archive</Button>
            </DialogActions>
        </Dialog>
    )
}
