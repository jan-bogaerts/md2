import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import type { DirectoryAgentAccount } from '../../data/agent_accounts';

interface AgentAccountRemoveDialogProps {
    account: DirectoryAgentAccount
    onClose: () => void
    onConfirm: () => void
    open: boolean
}

/** Confirms removing a directory account; the folder and its credentials stay on disk. */
export function AgentAccountRemoveDialog(props: AgentAccountRemoveDialogProps) {
    const { account, onClose, onConfirm, open } = props;

    return (
        <Dialog aria-labelledby="agent-account-remove-dialog-title" onClose={onClose} open={open}>
            <DialogTitle id="agent-account-remove-dialog-title">Remove account?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {`"${account.name}" is removed from the account list. The folder ${account.configDirectory} and the credentials in it stay on disk.`}
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ bgcolor: 'background.default', borderTop: 1, borderColor: 'divider' }}>
                <Button autoFocus onClick={onClose} variant="outlined">Cancel</Button>
                <Button color="error" onClick={onConfirm} variant="contained">Remove</Button>
            </DialogActions>
        </Dialog>
    );
}
