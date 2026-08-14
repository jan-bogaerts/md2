import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useSentryImport } from './hooks/use_sentry_import'
import { sentryImportService, type SentryImportService } from '../services/sentry/sentry_import_service'

interface SentryImportConfirmationDialogProps {
    service?: SentryImportService
}

export function SentryImportConfirmationDialog({ service = sentryImportService }: SentryImportConfirmationDialogProps) {
    const snapshot = useSentryImport(service)
    const confirmation = snapshot.confirmation
    const handleCancel = () => service.cancelFirstImport()
    const handleImport = () => {
        void service.confirmFirstImport()
    }

    return (
        <Dialog aria-labelledby="sentry-import-confirmation-title" open={!!confirmation}>
            <DialogTitle id="sentry-import-confirmation-title">Import Sentry issues?</DialogTitle>
            <DialogContent>
                <Typography>
                    {confirmation ? `${confirmation.count} unresolved Sentry issue${confirmation.count === 1 ? '' : 's'} will be imported as bug cards.` : ''}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button disabled={snapshot.isPolling} onClick={handleCancel} variant="outlined">Cancel</Button>
                <Button disabled={snapshot.isPolling} onClick={handleImport} variant="contained">Import</Button>
            </DialogActions>
        </Dialog>
    )
}
