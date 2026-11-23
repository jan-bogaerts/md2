import { Button } from '@mui/material';
import { usePrimaryChangesCommitting } from './hooks/use_primary_changes';

interface PrimaryChangesCancelButtonProps {
    onCancel: () => void;
}

/** Cancel action of the primary changes review; disabled while the non-cancellable commit runs. */
export function PrimaryChangesCancelButton({ onCancel }: PrimaryChangesCancelButtonProps) {
    const committing = usePrimaryChangesCommitting();

    return <Button disabled={committing} onClick={onCancel} variant="outlined">Cancel</Button>;
}
