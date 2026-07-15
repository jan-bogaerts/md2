import { Box, Button, Chip, Divider, List, ListItem, ListItemText, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import { hasExecutionBackend } from '../../data/electron_action_bridge'
import type { AgentConversation, AgentConversationError } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { useActionExecutions } from '../hooks/use_action_executions'
import { actionStatusLabel } from '../actions/action_status'

const BACKEND_REQUIRED_MESSAGE = 'Action execution requires the Electron desktop app'

interface AgentConversationListProps {
    context: ActionContext
    conversations: AgentConversation[]
    errors: AgentConversationError[]
    onContinue: (conversation: AgentConversation) => void
    onStart: (prompt: string) => void
}

interface ConversationItemProps {
    backendAvailable: boolean
    conversation: AgentConversation
    disabled: boolean
    onContinue: (conversation: AgentConversation) => void
}

function executionStatusColor(status: string) {
    if (status === 'completed') return 'success'
    if (status === 'failed') return 'error'
    if (status === 'okButNotAfter' || status === 'cancelled') return 'warning'

    return 'info'
}

function errorKey(error: AgentConversationError) {
    return `${error.path}:${error.message}`
}

function conversationStatusColor(status: AgentConversation['status']) {
    if (status === 'completed') return 'success'
    if (status === 'failed') return 'error'
    if (status === 'cancelled') return 'warning'

    return 'info'
}

function ConversationItem(props: ConversationItemProps) {
    const { backendAvailable, conversation, disabled, onContinue } = props
    const handleContinue = () => onContinue(conversation)
    const lastMessage = conversation.messages.at(-1)?.content ?? ''

    return (
        <ListItem
            disableGutters
            secondaryAction={(
                <Button disabled={!backendAvailable || disabled} onClick={handleContinue} size="small" variant="outlined">
                    Continue
                </Button>
            )}
            sx={{ alignItems: 'flex-start', pr: 12 }}
        >
            <ListItemText
                primary={(
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="subtitle2">{conversation.title}</Typography>
                        <Chip color={conversationStatusColor(conversation.status)} label={conversation.status} size="small" />
                    </Stack>
                )}
                secondary={lastMessage ? (
                    <Typography color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-wrap' }} variant="body2">
                        {lastMessage}
                    </Typography>
                ) : null}
            />
        </ListItem>
    )
}

/** Shows shared live execution state, action history, and persisted agent conversations for one file. */
export function AgentConversationList(props: AgentConversationListProps) {
    const { context, conversations, errors, onContinue, onStart } = props
    const executions = useActionExecutions().filter((execution) => execution.context.file === context.file)
    const activeExecution = executions.at(-1) ?? null
    const runningExecution = executions.findLast((execution) => execution.status === 'running') ?? null
    const [prompt, setPrompt] = useState('')
    const reportedErrorKeysRef = useRef<Set<string>>(new Set())
    const backendAvailable = hasExecutionBackend()
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

    const handlePromptChange = (event: ChangeEvent<HTMLInputElement>) => setPrompt(event.target.value)

    const handleStart = () => {
        if (prompt.trim().length === 0 || !backendAvailable) return
        onStart(prompt)
        setPrompt('')
    }

    return (
        <Stack spacing={1.5}>
            {!backendAvailable ? (
                <Typography color="text.secondary" role="note" variant="caption">{BACKEND_REQUIRED_MESSAGE}</Typography>
            ) : null}
            <Stack direction="row" spacing={1}>
                <TextField disabled={!!runningExecution} fullWidth label="Agent prompt" onChange={handlePromptChange} size="small" value={prompt} />
                <Button disabled={!backendAvailable || !!runningExecution || prompt.trim().length === 0} onClick={handleStart} size="small" variant="contained">
                    Start
                </Button>
            </Stack>
            {activeExecution ? (
                <Stack spacing={0.75}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="subtitle2">Action {activeExecution.rootActionId}</Typography>
                        <Chip
                            color={executionStatusColor(activeExecution.status)}
                            label={actionStatusLabel(activeExecution.status)}
                            size="small"
                        />
                    </Stack>
                    {activeExecution.logs.map((log, index) => (
                        <Typography
                            color="text.secondary"
                            key={`${log.actionName}-${log.phase}-${index}`}
                            sx={{ whiteSpace: 'pre-wrap' }}
                            variant="body2"
                        >
                            {log.phase}: {log.stdout}{log.stderr}{log.stdout || log.stderr ? '' : log.message}
                        </Typography>
                    ))}
                </Stack>
            ) : null}
            {hasConversations ? (
                <List dense disablePadding>
                    {conversations.map((conversation, index) => (
                        <Box key={conversation.id}>
                            {index > 0 ? <Divider component="li" /> : null}
                            <ConversationItem
                                backendAvailable={backendAvailable}
                                conversation={conversation}
                                disabled={!!runningExecution}
                                onContinue={onContinue}
                            />
                        </Box>
                    ))}
                </List>
            ) : null}
            {!hasConversations && hasErrors ? (
                <Typography color="text.secondary" variant="body2">Agent conversation errors reported.</Typography>
            ) : null}
            {!hasConversations && !hasErrors ? (
                <Typography color="text.secondary" variant="body2">No agent conversations.</Typography>
            ) : null}
        </Stack>
    )
}
