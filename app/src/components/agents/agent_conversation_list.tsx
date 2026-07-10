import { Box, Button, Chip, Divider, List, ListItem, ListItemText, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { AgentConversation, AgentConversationError } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'

interface AgentConversationListProps {
    conversations: AgentConversation[]
    errors: AgentConversationError[]
    onContinue: (conversation: AgentConversation) => void
    onSendInput: (runId: string, input: string) => void
    onStart: (prompt: string) => void
}

interface ConversationItemProps {
    conversation: AgentConversation
    onContinue: (conversation: AgentConversation) => void
    onSendInput: (runId: string, input: string) => void
}

function statusColor(status: AgentConversation['status']) {
    if (status === 'completed') return 'success'
    if (status === 'failed') return 'error'

    return 'info'
}

function lastMessage(conversation: AgentConversation) {
    return conversation.messages.at(-1)?.content ?? ''
}

function errorKey(error: AgentConversationError) {
    return `${error.path}:${error.message}`
}

function ConversationItem(props: ConversationItemProps) {
    const { conversation, onContinue, onSendInput } = props
    const [input, setInput] = useState('')

    const handleContinue = () => {
        onContinue(conversation)
    }

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        setInput(event.target.value)
    }

    const handleSendInput = () => {
        if (input.trim().length === 0) return

        onSendInput(conversation.id, input)
        setInput('')
    }

    const isRunning = conversation.status === 'running'

    return (
        <ListItem
            disableGutters
            secondaryAction={!isRunning ? (
                <Button onClick={handleContinue} size="small" variant="outlined">
                    Continue
                </Button>
            ) : undefined}
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
                    <Box>
                        <Typography color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-wrap' }} variant="body2">
                            {lastMessage(conversation)}
                        </Typography>
                        {isRunning ? (
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                <TextField label="Input" onChange={handleInputChange} size="small" value={input} />
                                <Button disabled={input.trim().length === 0} onClick={handleSendInput} size="small" variant="outlined">
                                    Send
                                </Button>
                            </Stack>
                        ) : null}
                    </Box>
                )}
            />
        </ListItem>
    )
}

/** Shows persisted agent conversations and reports load/start errors for a card. */
export function AgentConversationList(props: AgentConversationListProps) {
    const { conversations, errors, onContinue, onSendInput, onStart } = props
    const [prompt, setPrompt] = useState('')
    const reportedErrorKeysRef = useRef<Set<string>>(new Set())
    const hasConversations = conversations.length > 0
    const hasErrors = errors.length > 0

    useEffect(() => {
        const nextErrorKeys = new Set(errors.map(errorKey))
        for (const error of errors) {
            const key = errorKey(error)
            if (!reportedErrorKeysRef.current.has(key)) dialogService.error(`${error.path}: ${error.message}`)
        }

        reportedErrorKeysRef.current = nextErrorKeys
    }, [errors])

    const handlePromptChange = (event: ChangeEvent<HTMLInputElement>) => {
        setPrompt(event.target.value)
    }

    const handleStart = () => {
        if (prompt.trim().length === 0) return

        onStart(prompt)
        setPrompt('')
    }

    return (
        <Stack spacing={1.5}>
            <Stack direction="row" spacing={1}>
                <TextField fullWidth label="Agent prompt" onChange={handlePromptChange} size="small" value={prompt} />
                <Button disabled={prompt.trim().length === 0} onClick={handleStart} size="small" variant="contained">
                    Start
                </Button>
            </Stack>
            {hasConversations ? (
                <List dense disablePadding>
                    {conversations.map((conversation, index) => (
                        <Box key={conversation.id}>
                            {index > 0 ? <Divider component="li" /> : null}
                            <ConversationItem conversation={conversation} onContinue={onContinue} onSendInput={onSendInput} />
                        </Box>
                    ))}
                </List>
            ) : null}
            {!hasConversations && hasErrors ? (
                <Typography color="text.secondary" variant="body2">
                    Agent conversation errors reported.
                </Typography>
            ) : null}
            {!hasConversations && !hasErrors ? (
                <Typography color="text.secondary" variant="body2">
                    No agent conversations.
                </Typography>
            ) : null}
        </Stack>
    )
}
