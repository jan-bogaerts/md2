import { Box, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import TrashCanOutline from 'mdi-material-ui/TrashCanOutline';
import { useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { agentAccountService } from '../../services/agents/agent_account_service';
import { useAgentAccount } from '../hooks/use_agent_accounts';
import { AgentAccountRemoveDialog } from './agent_account_remove_dialog';
import { AgentAccountStatusActions } from './agent_account_status_actions';

const NAME_FIELD_WIDTH = 200;

interface AgentAccountRowProps {
    accountId: string
    agent: string
    disabled: boolean
}

/** One account with its editable name, initial label or folder, status actions, and removal. */
export function AgentAccountRow(props: AgentAccountRowProps) {
    const { accountId, agent, disabled } = props;
    const account = useAgentAccount(agent, accountId);
    // Only the text being typed lives here; the persisted name comes from the account service.
    const [nameDraft, setNameDraft] = useState<string | null>(null);
    const [confirmingRemoval, setConfirmingRemoval] = useState(false);
    if (!account) return null;

    const commitName = async () => {
        if (nameDraft === null) return;
        const name = nameDraft.trim();
        if (name.length > 0 && name !== account.name) await agentAccountService.rename(account.id, name);
        setNameDraft(null);
    };

    const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setNameDraft(event.target.value);
    };

    const handleNameBlur = () => {
        void commitName();
    };

    const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        // Blurring commits the name once through the blur handler.
        event.currentTarget.blur();
    };

    const handleRemoveClick = () => {
        setConfirmingRemoval(true);
    };

    const handleRemoveCancel = () => {
        setConfirmingRemoval(false);
    };

    const handleRemoveConfirm = () => {
        setConfirmingRemoval(false);
        void agentAccountService.remove(account.id);
    };

    return (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 1, p: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                <TextField
                    disabled={disabled}
                    onBlur={handleNameBlur}
                    onChange={handleNameChange}
                    size="small"
                    slotProps={{ htmlInput: { 'aria-label': 'Account name', onKeyDown: handleNameKeyDown } }}
                    sx={{ flexShrink: 0, width: NAME_FIELD_WIDTH }}
                    value={nameDraft ?? account.name}
                />
                {account.kind === 'initial' ? (
                    <Box sx={{ flex: 1 }}>
                        <Chip label="Initial" size="small" />
                    </Box>
                ) : (
                    <Tooltip title={account.configDirectory}>
                        <Typography noWrap sx={{ color: 'custom.text3', flex: 1, minWidth: 0 }} variant="body2">
                            {account.configDirectory}
                        </Typography>
                    </Tooltip>
                )}
                {account.kind === 'directory' ? (
                    <Tooltip title={`Remove account ${account.name}`}>
                        <IconButton aria-label={`Remove account ${account.name}`} disabled={disabled} onClick={handleRemoveClick} size="small">
                            <TrashCanOutline fontSize="small" />
                        </IconButton>
                    </Tooltip>
                ) : null}
            </Stack>
            <AgentAccountStatusActions account={account} disabled={disabled} />
            {account.kind === 'directory' ? (
                <AgentAccountRemoveDialog
                    account={account}
                    onClose={handleRemoveCancel}
                    onConfirm={handleRemoveConfirm}
                    open={confirmingRemoval}
                />
            ) : null}
        </Box>
    );
}
