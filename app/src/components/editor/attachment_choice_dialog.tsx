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
                        Copy beside card stores repository files and uses relative paths.
                        Use original location stores absolute paths and copies nothing.
                    </Typography>
                    {!snapshot?.originalLocationAvailable ? (
                        <Typography color="text.secondary" role="status" variant="caption">
                            Original locations are unavailable because this browser cannot provide trusted absolute file paths.
                        </Typography>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ bgcolor: 'background.default', borderTop: 1, borderColor: 'divider' }}>
                <Button onClick={cancel} variant="outlined">Cancel</Button>
                <Button disabled={!snapshot?.originalLocationAvailable} onClick={useOriginal} variant="outlined">
                    Use original location
                </Button>
                <Button onClick={copy} variant="contained">Copy beside card</Button>
            </DialogActions>
        </Dialog>
    )
}
