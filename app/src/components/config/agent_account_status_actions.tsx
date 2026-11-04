import { Box, Button, Stack, Typography } from '@mui/material';
import type { AgentAccount } from '../../data/agent_accounts';
import { agentAccountService, type AgentAccountStatus } from '../../services/agents/agent_account_service';
import { useAgentAccountStatus } from '../hooks/use_agent_accounts';

const STATUS_DOT_SIZE = 7;
const STATUS_LABELS: Record<AgentAccountStatus, string> = {
    available: 'Signed in',
    checking: 'Checking status...',
    directoryUnavailable: 'Folder missing or unreadable',
    loginInProgress: 'Login in progress',
    loginRequired: 'Login required',
    notIsolated: 'Credentials are not stored in the account folder',
    unknown: 'Status unknown',
};
const STATUS_DOT_COLORS: Record<AgentAccountStatus, string> = {
    available: 'success.main',
    checking: 'custom.text4',
    directoryUnavailable: 'error.main',
    loginInProgress: 'custom.text4',
    loginRequired: 'warning.main',
    notIsolated: 'warning.main',
    unknown: 'custom.text4',
};
const BUSY_STATUSES = new Set<AgentAccountStatus>(['checking', 'loginInProgress']);

interface AgentAccountStatusActionsProps {
    account: AgentAccount
    disabled: boolean
}

/** Shows one account's login status with the login and folder actions that status allows. */
export function AgentAccountStatusActions(props: AgentAccountStatusActionsProps) {
    const { account, disabled } = props;
    const status = useAgentAccountStatus(account.id);
    const busy = BUSY_STATUSES.has(status);
    const directoryUnavailable = status === 'directoryUnavailable';
    const showsFolderAction = account.kind === 'directory' && directoryUnavailable;

    const handleLoginClick = () => {
        void agentAccountService.login(account.id);
    };

    const handleChooseFolderClick = () => {
        void agentAccountService.reselectDirectory(account.id);
    };

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Box sx={{ bgcolor: STATUS_DOT_COLORS[status], borderRadius: '50%', flexShrink: 0, height: STATUS_DOT_SIZE, width: STATUS_DOT_SIZE }} />
            <Typography noWrap sx={{ color: 'custom.text3', flex: 1, minWidth: 0 }} variant="body2">
                {STATUS_LABELS[status]}
            </Typography>
            {showsFolderAction ? (
                <Button disabled={disabled || busy} onClick={handleChooseFolderClick} size="small" variant="outlined">
                    Choose folder
                </Button>
            ) : null}
            <Button disabled={disabled || busy || directoryUnavailable} onClick={handleLoginClick} size="small" variant="outlined">
                {status === 'available' ? 'Reauthenticate' : 'Log in'}
            </Button>
        </Stack>
    );
}
