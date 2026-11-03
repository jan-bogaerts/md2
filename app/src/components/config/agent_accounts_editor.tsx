import { Stack, Typography } from '@mui/material';
import { useEffect } from 'react';
import { agentAccountService } from '../../services/agents/agent_account_service';
import { AgentAccountsSection } from './agent_accounts_section';

const ACCOUNT_PROVIDERS = [
    { agent: 'codex', label: 'Codex' },
    { agent: 'claude', label: 'Claude' },
];

interface AgentAccountsEditorProps {
    disabled: boolean
}

/** Manages Codex and Claude accounts through the desktop; changes persist immediately, not on config save. */
export function AgentAccountsEditor(props: AgentAccountsEditorProps) {
    const { disabled } = props;
    const available = agentAccountService.isAvailable();

    useEffect(() => {
        if (available) void agentAccountService.load();
    }, [available]);

    if (!available) {
        return (
            <Typography color="text.secondary" variant="body2">
                Account management requires the desktop app.
            </Typography>
        );
    }

    return (
        <Stack spacing={2}>
            {ACCOUNT_PROVIDERS.map(({ agent, label }) => (
                <AgentAccountsSection agent={agent} disabled={disabled} key={agent} label={label} />
            ))}
        </Stack>
    );
}
