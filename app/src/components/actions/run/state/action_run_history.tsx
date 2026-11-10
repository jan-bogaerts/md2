import { Box, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import { DEFAULT_AGENT_ACCOUNTS } from '../../../../data/agent_accounts';
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';
import { dialogService } from '../../../../services/dialog_service';
import { useConfigValueOrFallback } from '../../../hooks/use_config_value';
import { HistoryEntryRow } from './action_run_history_entry';
import { newestFirstHistoryEntries } from './action_run_history_order';

interface ActionRunHistoryProps {
    compact?: boolean;
    entries: ActionRunHistoryEntry[];
    error: string | null;
}

/** Presentation-only list of previous action runs. */
export function ActionRunHistory({ compact = false, entries, error }: ActionRunHistoryProps) {
    const accounts = useConfigValueOrFallback('desktop.agentAccounts', DEFAULT_AGENT_ACCOUNTS);
    const reportedErrorRef = useRef<string | null>(null);
    const displayEntries = newestFirstHistoryEntries(entries);

    useEffect(() => {
        if (!error) {
            reportedErrorRef.current = null;

            return;
        }

        if (error === reportedErrorRef.current) return;

        dialogService.error(error);
        reportedErrorRef.current = error;
    }, [error]);

    if (entries.length === 0) return null;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 1 : 0 }}>
            <Typography color="text.secondary" sx={compact ? { fontSize: 12, fontWeight: 600 } : undefined} variant="caption">
                Run history
            </Typography>
            {error ? (
                <Typography color="text.secondary" variant="caption">
                    Run history unavailable.
                </Typography>
            ) : null}
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {displayEntries.map(({ entry, sourceIndex }) => (
                    <HistoryEntryRow accounts={accounts} entry={entry} key={`${entry.completedAt}-${entry.status}-${sourceIndex}`} />
                ))}
            </Stack>
        </Box>
    );
}
