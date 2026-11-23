import { Button, CircularProgress } from '@mui/material';
import { usePrimaryChangesCommitting, usePrimaryChangesConfirmable } from './hooks/use_primary_changes';

interface PrimaryChangesConfirmButtonProps {
    onConfirm: () => void;
}

const SPINNER_SIZE = 16;

/** OK action of the primary changes review; enabled only when the service allows confirming. */
export function PrimaryChangesConfirmButton({ onConfirm }: PrimaryChangesConfirmButtonProps) {
    const confirmable = usePrimaryChangesConfirmable();
    const committing = usePrimaryChangesCommitting();
    const startIcon = committing ? <CircularProgress aria-hidden="true" color="inherit" size={SPINNER_SIZE} /> : undefined;

    return (
        <Button disabled={!confirmable} onClick={onConfirm} startIcon={startIcon} variant="contained">
            {committing ? 'Committing...' : 'OK'}
        </Button>
    );
}
