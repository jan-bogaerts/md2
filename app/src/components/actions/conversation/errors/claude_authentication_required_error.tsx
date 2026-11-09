import { Box, Button, Stack, Typography } from '@mui/material'
import { agentAccountService } from '../../../../services/agents/agent_account_service'
import type { ClaudeAuthenticationRequiredEvent } from './claude_authentication_required_event'

interface ClaudeAuthenticationRequiredErrorProps {
    event: ClaudeAuthenticationRequiredEvent
}

/** Offers the existing account login flow without changing or rerunning the failed conversation. */
export function ClaudeAuthenticationRequiredError({ event }: ClaudeAuthenticationRequiredErrorProps) {
    const login = () => {
        void agentAccountService.login(event.accountId)
    }

    return (
        <Box
            role="alert"
            sx={{ border: '1px solid', borderColor: 'error.main', borderRadius: 1, p: 1 }}
        >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography color="error.main" sx={{ flex: 1, minWidth: 0 }} variant="body2">
                    {event.content}
                </Typography>
                <Button color="error" onClick={login} size="small" variant="outlined">Log in</Button>
            </Stack>
        </Box>
    )
}
