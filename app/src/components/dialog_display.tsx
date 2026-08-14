import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Snackbar, Tooltip } from '@mui/material'
import type { SyntheticEvent } from 'react'
import { useEffect, useState } from 'react'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage } from '../services/dialog_service'
import { SelectableAlertMessage } from './selectable_alert_message'
import { GlobalProgressBackdrop } from './global_progress_backdrop'

// const SNACKBAR_AUTO_HIDE_MS = 6000
const IMMEDIATE_TRANSITION_MS = 0
const SNACKBAR_TRANSITION_DURATION_MS = { exit: IMMEDIATE_TRANSITION_MS }

/** Renders dialog service events as snackbars or blocking dialogs. */
export function DialogDisplay() {
    const [dialogMessage, setDialogMessage] = useState<DialogServiceMessage | null>(null)
    const [pendingMessageId, setPendingMessageId] = useState<number | null>(null)
    const [snackbarMessages, setSnackbarMessages] = useState<DialogServiceMessage[]>([])
    const snackbarMessage = snackbarMessages[0] ?? null
    const snackbarSeverity = snackbarMessage?.severity ?? 'info'
    const snackbarAutoHideDuration = null; // temp test snackbarSeverity === 'error' ? null : SNACKBAR_AUTO_HIDE_MS
    const dialogSeverity = dialogMessage?.severity ?? 'info'

    useEffect(() => {
        const handleDialogMessage = (event: Event) => {
            const message = (event as CustomEvent<DialogServiceMessage>).detail
            if (message.critical) setDialogMessage(message)
            else setSnackbarMessages((currentMessages) => [...currentMessages, message])
        }

        dialogService.addEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage)

        return () => dialogService.removeEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage)
    }, [])

    const handleCloseSnackbar = (_event: Event | SyntheticEvent, reason?: string) => {
        if (reason === 'clickaway') return

        setSnackbarMessages((currentMessages) => currentMessages.slice(1))
    }

    const handleCloseSnackbarAlert = () => {
        setSnackbarMessages((currentMessages) => currentMessages.slice(1))
    }

    const handleSnackbarAction = async () => {
        if (!snackbarMessage?.action) return
        const { action, id } = snackbarMessage
        setPendingMessageId(id)
        try {
            await action.callback()
            setSnackbarMessages((currentMessages) => currentMessages.filter((message) => message.id !== id))
        } catch {
            setSnackbarMessages((currentMessages) => {
                if (currentMessages[0]?.id !== id || currentMessages.length === 1) return currentMessages

                return [...currentMessages.slice(1), currentMessages[0]]
            })
        } finally {
            setPendingMessageId((currentId) => currentId === id ? null : currentId)
        }
    }

    const handleCloseDialog = () => {
        setDialogMessage(null)
    }

    return (
        <>
            <GlobalProgressBackdrop />
            <Snackbar
                autoHideDuration={snackbarAutoHideDuration}
                key={snackbarMessage?.id ?? 'dialog-service-snackbar'}
                onClose={handleCloseSnackbar}
                open={!!snackbarMessage}
                transitionDuration={SNACKBAR_TRANSITION_DURATION_MS}
            >
                <Alert
                    action={snackbarMessage?.action ? (
                        <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }}>
                            <Button
                                color="inherit"
                                disabled={pendingMessageId === snackbarMessage.id}
                                onClick={handleSnackbarAction}
                                size="small"
                            >
                                {snackbarMessage.action.label}
                            </Button>
                            <Tooltip title="Close">
                                <IconButton
                                    aria-label="Close"
                                    color="inherit"
                                    onClick={handleCloseSnackbarAlert}
                                    size="small"
                                >
                                    <CloseOutlinedIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    ) : undefined}
                    onClose={snackbarMessage?.action ? undefined : handleCloseSnackbarAlert}
                    severity={snackbarSeverity}
                    sx={{ width: '100%' }}
                    variant="filled"
                >
                    {snackbarMessage ? (
                        <SelectableAlertMessage message={snackbarMessage.message} />
                    ) : null}
                </Alert>
            </Snackbar>
            <Dialog aria-labelledby="dialog-service-title" open={!!dialogMessage}>
                <DialogTitle id="dialog-service-title">{dialogMessage?.title ?? 'Message'}</DialogTitle>
                <DialogContent>
                    <Alert severity={dialogSeverity}>
                        {dialogMessage ? (
                            <SelectableAlertMessage message={dialogMessage.message} />
                        ) : null}
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>OK</Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
