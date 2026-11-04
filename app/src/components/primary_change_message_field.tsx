import { TextField } from '@mui/material';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { primaryChangesService } from '../services/project/primary_changes_service';
import { usePrimaryChangesMessage } from './hooks/use_primary_changes';

interface PrimaryChangeMessageFieldProps {
    onSubmit: () => void;
}

/** Commit message for the reviewed primary worktree entries; Enter submits like OK. */
export function PrimaryChangeMessageField({ onSubmit }: PrimaryChangeMessageFieldProps) {
    const message = usePrimaryChangesMessage();

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        primaryChangesService.setMessage(event.target.value);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter') return;

        event.preventDefault();
        onSubmit();
    };

    return (
        <TextField
            autoFocus
            fullWidth
            label="Commit message"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            size="small"
            value={message}
        />
    );
}
