import { Button } from '@mui/material';
import { usePrimaryChangesConfirmable } from './hooks/use_primary_changes';

interface PrimaryChangesConfirmButtonProps {
    onConfirm: () => void;
}

/** OK action of the primary changes review; enabled only when the service allows confirming. */
export function PrimaryChangesConfirmButton({ onConfirm }: PrimaryChangesConfirmButtonProps) {
    const confirmable = usePrimaryChangesConfirmable();

    return <Button disabled={!confirmable} onClick={onConfirm} variant="contained">OK</Button>;
}
