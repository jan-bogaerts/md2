import { Alert, CircularProgress } from '@mui/material';
import { usePrimaryChangesCommitting } from './hooks/use_primary_changes';

const PROGRESS_SIZE = 20;

/** Progress notice shown while the reviewed project changes are being committed. */
export function PrimaryChangesCommitProgress() {
    const committing = usePrimaryChangesCommitting();
    if (!committing) return null;

    return (
        <Alert icon={<CircularProgress aria-label="Committing project changes" size={PROGRESS_SIZE} />} severity="info">
            Committing project changes...
        </Alert>
    );
}
