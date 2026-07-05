import { Alert, Box, Button, Chip, Divider, List, ListItem, ListItemText, Stack, Typography } from '@mui/material'
import type { AgentConversation, AgentConversationError } from '../../data/data_types'

interface AgentConversationListProps {
    conversations: AgentConversation[]
    errors: AgentConversationError[]
    onContinue: (conversation: AgentConversation) => void
}

interface ConversationItemProps {
    conversation: AgentConversation
    onContinue: (conversation: AgentConversation) => void
}

function statusColor(status: AgentConversation['status']) {
    if (status === 'completed') return 'success'
    if (status === 'failed') return 'error'

    return 'info'
}

function lastMessage(conversation: AgentConversation) {
    return conversation.messages.at(-1)?.content ?? ''
}

function ConversationItem(props: ConversationItemProps) {
    const { conversation, onContinue } = props

    const handleContinue = () => {
        onContinue(conversation)
    }

    return (
        <ListItem
            disableGutters
            secondaryAction={(
                <Button onClick={handleContinue} size="small" variant="outlined">
                    Continue
                </Button>
            )}
            sx={{ alignItems: 'flex-start', pr: 12 }}
        >
            <ListItemText
                primary={(
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="subtitle2">{conversation.title}</Typography>
                        <Chip color={statusColor(conversation.status)} label={conversation.status} size="small" />
                    </Stack>
                )}
                secondary={(
                    <Typography color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-wrap' }} variant="body2">
                        {lastMessage(conversation)}
                    </Typography>
                )}
            />
        </ListItem>
    )
}

/** Shows persisted agent conversations plus load/start errors for a card. */
export function AgentConversationList(props: AgentConversationListProps) {
    const { conversations, errors, onContinue } = props
    const hasConversations = conversations.length > 0
    const hasErrors = errors.length > 0

    return (
        <Stack spacing={1.5}>
            {hasErrors ? (
                <Stack spacing={1}>
                    {errors.map((error) => (
                        <Alert key={`${error.path}:${error.message}`} severity="error">
                            {error.path}: {error.message}
                        </Alert>
                    ))}
                </Stack>
            ) : null}
            {hasConversations ? (
                <List dense disablePadding>
                    {conversations.map((conversation, index) => (
                        <Box key={conversation.id}>
                            {index > 0 ? <Divider component="li" /> : null}
                            <ConversationItem conversation={conversation} onContinue={onContinue} />
                        </Box>
                    ))}
                </List>
            ) : null}
            {!hasConversations && !hasErrors ? (
                <Typography color="text.secondary" variant="body2">
                    No agent conversations.
                </Typography>
            ) : null}
        </Stack>
    )
}
