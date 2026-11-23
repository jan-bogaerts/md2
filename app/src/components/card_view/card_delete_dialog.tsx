import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useRef } from 'react'
import type { FocusEvent } from 'react'
import { dialogService } from '../../services/dialog_service'

interface CardDeleteDialogProps {
    cardPath: string | null
    onClose: () => void
    onDeleteCard: (path: string) => Promise<void>
}

/**
 * Dialog for confirming card deletion without blocking the renderer.
 * Focus is only restored on cancel: after a delete the opener is being removed and the caller picks a replacement.
 */
export function CardDeleteDialog(props: CardDeleteDialogProps) {
    const { cardPath, onClose, onDeleteCard } = props
    const restoreFocusElementRef = useRef<HTMLElement | null>(null)

    const handleDialogFocus = (event: FocusEvent<HTMLElement>) => {
        if (restoreFocusElementRef.current || !(event.relatedTarget instanceof HTMLElement)) return
        if (event.currentTarget.contains(event.relatedTarget)) return
        restoreFocusElementRef.current = event.relatedTarget
    }

    const handleCancel = () => {
        const restoreFocusElement = restoreFocusElementRef.current
        restoreFocusElementRef.current = null
        onClose();
        if (restoreFocusElement) queueMicrotask(() => restoreFocusElement.focus())
    }

    const handleDeleteClick = async () => {
        if (!cardPath) return
        restoreFocusElementRef.current = null
        try {
            onClose();
            await onDeleteCard(cardPath);
        } catch {
            dialogService.error(`Could not delete card at path: ${cardPath}`);
        }
    }

    return (
        <Dialog disableRestoreFocus fullWidth maxWidth="xs" onClose={handleCancel} onFocus={handleDialogFocus} open={!!cardPath}>
            <DialogTitle>Delete card</DialogTitle>
            <DialogContent sx={{ wordBreak: 'break-all' }} >
                Are you sure you want to delete this card?
                {cardPath ? <Typography>Path: {cardPath}?</Typography> : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCancel}>Cancel</Button>
                <Button color="error" onClick={handleDeleteClick} variant="contained">Delete</Button>
            </DialogActions>
        </Dialog>
    )
}
