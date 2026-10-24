import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { dialogService } from '../services/dialog_service';
import { primaryChangesService } from '../services/project/primary_changes_service';
import { usePrimaryChangesOpen } from './hooks/use_primary_changes';
import { PrimaryChangeList } from './primary_change_list';
import { PrimaryChangeMessageField } from './primary_change_message_field';
import { PrimaryChangesConfirmButton } from './primary_changes_confirm_button';

async function confirmPrimaryChanges() {
    try {
        await primaryChangesService.confirm();
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Could not commit project changes' });
    }
}

/** Global review of uncommitted primary worktree changes that block a worktree integration. */
export function PrimaryChangesDialog() {
    const open = usePrimaryChangesOpen();

    const handleConfirm = () => {
        void confirmPrimaryChanges();
    };

    const handleCancel = () => {
        primaryChangesService.cancel();
    };

    return (
        <Dialog
            fullWidth
            maxWidth="sm"
            onClose={handleCancel}
            open={open}
            slotProps={{ paper: { sx: { display: 'flex', maxHeight: '80vh' } } }}
        >
            <DialogTitle>Uncommitted project changes</DialogTitle>
            <DialogContent dividers sx={{ minHeight: 0, overflowY: 'auto', py: 2 }}>
                <Stack spacing={2}>
                    <Typography color="text.secondary">
                        The project branch has changes that must be committed before integration.
                    </Typography>
                    <PrimaryChangeList />
                    <PrimaryChangeMessageField onSubmit={handleConfirm} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider', justifyContent: 'flex-end' }}>
                <Button onClick={handleCancel} variant="outlined">Cancel</Button>
                <PrimaryChangesConfirmButton onConfirm={handleConfirm} />
            </DialogActions>
        </Dialog>
    );
}
