import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

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
            await onDeleteCard(cardPath)
            onClose()
        } catch {
            // ProjectWorkspace owns the user-visible delete error.
        }
    }

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={!!cardPath}>
            <DialogTitle>Delete card</DialogTitle>
            <DialogContent>
                {cardPath ? <Typography>Delete {cardPath}?</Typography> : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button color="error" onClick={handleDeleteClick} variant="contained">Delete</Button>
            </DialogActions>
        </Dialog>
    )
}
