import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { useSyncExternalStore } from 'react'
import { attachmentChoiceService } from '../../services/attachments/attachment_choice_service'

/** Application-wide choice shown once for each file selection or drop. */
export function AttachmentChoiceDialog() {
    const snapshot = useSyncExternalStore(
        attachmentChoiceService.subscribe,
        attachmentChoiceService.getSnapshot,
        attachmentChoiceService.getSnapshot,
    )
    const cancel = () => attachmentChoiceService.cancel()
    const copy = () => attachmentChoiceService.select('copy')
    const useOriginal = () => attachmentChoiceService.select('original')

    return (
        <Dialog aria-labelledby="attachment-choice-title" onClose={cancel} open={snapshot !== null}>
            <DialogTitle id="attachment-choice-title">
                Attach {snapshot?.fileCount ?? 0} file{snapshot?.fileCount === 1 ? '' : 's'}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography color="text.secondary">
                        Copy into project saves a copy next to the card, so it stays with the project.
                        Link without copying keeps each file where it is and links to it using its full path.
                    </Typography>
                    {!snapshot?.originalLocationAvailable ? (
                        <Typography color="text.secondary" role="status" variant="caption">
                            Linking without copying is unavailable because this browser cannot access the files&apos; full paths.
                        </Typography>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ bgcolor: 'background.default', borderTop: 1, borderColor: 'divider' }}>
                <Button onClick={cancel} variant="outlined">Cancel</Button>
                <Button disabled={!snapshot?.originalLocationAvailable} onClick={useOriginal} variant="outlined">
                    Link without copying
                </Button>
                <Button onClick={copy} variant="contained">Copy into project</Button>
            </DialogActions>
        </Dialog>
    )
}
