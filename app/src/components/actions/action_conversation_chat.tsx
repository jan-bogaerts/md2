import { Box, Stack, Typography } from '@mui/material'
import type { AgentConversation } from '../../data/data_types'
import type { ActionRunLogEntry } from '../../data/action_run_types'
import type { PopupRunStatus } from './action_popup_defaults'
import { actionStatusLabel } from './action_status'

interface ActionConversationChatProps {
    conversation: AgentConversation | null
    logs: ActionRunLogEntry[]
    status: PopupRunStatus
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, logs, status }: ActionConversationChatProps) {
    const messages = conversation?.messages.filter(({ role }) => role === 'user' || role === 'assistant') ?? []
    const errors = logs.filter(({ status: logStatus, stderr }) => logStatus === 'failed' || stderr.length > 0)

    return (
        <Stack aria-label="Conversation chat" spacing={1} sx={{ minHeight: 72 }}>
            {messages.map((message) => (
                <Box
                    key={message.id}
                    sx={{
                        alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                        bgcolor: message.role === 'user' ? 'custom.primaryBg' : 'custom.track',
                        borderRadius: 1,
                        maxWidth: '88%',
                        px: 1.25,
                        py: 1,
                    }}
                >
                    <Typography sx={{ whiteSpace: 'pre-wrap' }} variant="body2">{message.content}</Typography>
                </Box>
            ))}
            {status !== 'idle' ? (
                <Typography color={status === 'failed' ? 'error.main' : 'text.secondary'} role="status" variant="caption">
                    {actionStatusLabel(status)}
                </Typography>
            ) : null}
            {errors.map((error, index) => (
                <Typography color="error.main" key={`${error.actionName}-${error.phase}-${index}`} variant="caption">
                    {error.stderr || error.message}
                </Typography>
            ))}
        </Stack>
    )
}
