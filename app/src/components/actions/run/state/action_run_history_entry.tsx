import { Box, Typography } from '@mui/material';
import type { AgentAccount } from '../../../../data/agent_accounts';
import { agentSpeedLabel } from '../../../../data/agent_speed_label';
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';
import { CommitReferenceRow } from '../../conversation/events/commit_reference_row';

interface HistoryEntryRowProps {
    accounts: AgentAccount[];
    entry: ActionRunHistoryEntry;
}

/** One run history line with commits produced across its action chain. */
export function HistoryEntryRow({ accounts, entry }: HistoryEntryRowProps) {
    const accountName = entry.type === 'agent' && entry.accountId
        ? accounts.find(({ id }) => id === entry.accountId)?.name ?? `${entry.accountId} — unavailable`
        : null;
    const configuration = entry.type === 'agent'
        ? [entry.agent, accountName, entry.model, entry.thinkingLevel, entry.permissionMode, agentSpeedLabel(entry)]
            .filter((value) => !!value).join(' / ')
        : '';
    const agentLabel = configuration ? ` (${configuration})` : '';
    const completedAt = new Date(entry.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const summary = entry.type === 'agent'
        ? `${entry.status}${agentLabel} · ${completedAt}`
        : `${entry.status}: ${entry.output} · ${completedAt}`;

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                {summary}
            </Typography>
            {entry.commits?.map((commitReference) => (
                <CommitReferenceRow
                    commitReference={commitReference}
                    key={`${commitReference.repositoryRoot}-${commitReference.commit}`}
                />
            ))}
        </Box>
    );
}
