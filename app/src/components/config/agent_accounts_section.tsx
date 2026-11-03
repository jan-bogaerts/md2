import { Box, Button, Stack, Typography } from '@mui/material';
import Add from 'mdi-material-ui/Plus';
import { agentAccountService } from '../../services/agents/agent_account_service';
import { useAgentAccounts } from '../hooks/use_agent_accounts';
import { AgentAccountRow } from './agent_account_row';

interface AgentAccountsSectionProps {
    agent: string
    disabled: boolean
    label: string
}

/** Accounts of one provider in configuration order, with the action that adds a directory account. */
export function AgentAccountsSection(props: AgentAccountsSectionProps) {
    const { agent, disabled, label } = props;
    const accounts = useAgentAccounts(agent);
    const headingId = `${agent}-agent-accounts-heading`;

    const handleAddClick = () => {
        void agentAccountService.addAccount(agent);
    };

    return (
        <Stack aria-labelledby={headingId} component="section" spacing={1}>
            <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                <Typography id={headingId} sx={{ color: 'custom.colHead', fontWeight: 700 }} variant="overline">
                    {label}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Button disabled={disabled} onClick={handleAddClick} size="small" startIcon={<Add />} variant="outlined">
                    Add account
                </Button>
            </Box>
            {accounts.map(({ id }) => <AgentAccountRow accountId={id} agent={agent} disabled={disabled} key={id} />)}
        </Stack>
    );
}
