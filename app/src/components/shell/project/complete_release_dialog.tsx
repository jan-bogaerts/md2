import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'

interface CompleteReleaseDialogProps {
    errorMessage: string | null
    isLoading: boolean
    open: boolean
    onClose: () => void
    onCompleteRelease: (releaseName: string) => Promise<void>
}

/** Dialog for confirming and naming release completion. */
export function CompleteReleaseDialog(props: CompleteReleaseDialogProps) {
    const { errorMessage, isLoading, onClose, onCompleteRelease, open } = props
    const [releaseName, setReleaseName] = useState('')

    const handleReleaseNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setReleaseName(event.target.value)
    }

    const handleCompleteClick = async () => {
        if (releaseName.length === 0) return

        await onCompleteRelease(releaseName)
        setReleaseName('')
    }

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
            <DialogTitle>Complete release</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
                    <TextField label="Release name" onChange={handleReleaseNameChange} size="small" value={releaseName} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button disabled={releaseName.length === 0 || isLoading} onClick={handleCompleteClick} variant="contained">
                    Complete release
                </Button>
            </DialogActions>
        </Dialog>
    )
}
