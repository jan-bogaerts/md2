import { Button, Chip, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { actionsForContext, type ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { hasExecutionBackend } from '../../data/electron_action_bridge'
import type { AgentConversation, AgentConversationError } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { useActionExecutions } from '../hooks/use_action_executions'
import { useActions } from '../hooks/use_actions'
import { actionStatusLabel } from '../actions/action_status'
import { defaultLoadHistory } from '../actions/action_popup_defaults'

const BACKEND_REQUIRED_MESSAGE = 'Action execution requires the Electron desktop app'

interface AgentConversationListProps {
    context: ActionContext
    conversations: AgentConversation[]
    errors: AgentConversationError[]
    onContinue: (conversation: AgentConversation) => void
    onSendInput: (executionId: string, input: string) => void
    onStart: (prompt: string) => void
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

function historyActions(actions: ActionDefinition[], context: ActionContext) {
    return actionsForContext(actions, context)
}

/** Shows shared live execution state, action history, and persisted agent conversations for one file. */
export function AgentConversationList(props: AgentConversationListProps) {
    const { context, errors, onSendInput, onStart } = props
    const { actions } = useActions()
    const executions = useActionExecutions().filter((execution) => execution.context.file === context.file)
    const activeExecution = executions.at(-1) ?? null
    const runningExecution = executions.findLast((execution) => execution.status === 'running') ?? null
    const availableActions = useMemo(() => historyActions(actions, context), [actions, context])
    const [, setHistory] = useState<ActionRunHistoryEntry[]>([])
    const [, setHistoryError] = useState<string | null>(null)
    const [input, setInput] = useState('')
    const [prompt, setPrompt] = useState('')
    const reportedErrorKeysRef = useRef<Set<string>>(new Set())
    const backendAvailable = hasExecutionBackend()
    const executionStateKey = executions.map(({ executionId, status }) => `${executionId}:${status}`).join('|')

    useEffect(() => {
        const nextErrorKeys = new Set(errors.map(errorKey))
        for (const error of errors) {
            const key = errorKey(error)
            if (!reportedErrorKeysRef.current.has(key)) dialogService.error(`${error.path}: ${error.message}`)
        }

        reportedErrorKeysRef.current = nextErrorKeys
    }, [errors])

    useEffect(() => {
        let active = true
        const loadHistory = async () => {
            setHistoryError(null)
            try {
                const actionHistories = await Promise.all(availableActions.map((action) => defaultLoadHistory(action, context)))
                if (active) setHistory(actionHistories.flat())
            } catch (error) {
                if (active) setHistoryError(error instanceof Error ? error.message : 'Could not load run history')
            }
        }

        void loadHistory()

        return () => {
            active = false
        }
    }, [availableActions, context, executionStateKey])

    const handlePromptChange = (event: ChangeEvent<HTMLInputElement>) => setPrompt(event.target.value)
    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => setInput(event.target.value)

    const handleStart = () => {
        if (prompt.trim().length === 0 || !backendAvailable) return
        onStart(prompt)
        setPrompt('')
    }

    const handleSendInput = () => {
        if (!runningExecution || input.trim().length === 0 || !backendAvailable) return
        onSendInput(runningExecution.executionId, input)
        setInput('')
    }

    return (
        <Stack spacing={1.5}>
            {!backendAvailable ? (
                <Typography color="text.secondary" role="note" variant="caption">{BACKEND_REQUIRED_MESSAGE}</Typography>
            ) : null}
            <Stack direction="row" spacing={1}>
                <TextField fullWidth label="Agent prompt" onChange={handlePromptChange} size="small" value={prompt} />
                <Button disabled={!backendAvailable || prompt.trim().length === 0} onClick={handleStart} size="small" variant="contained">
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
                    {runningExecution?.activeActionType === 'agent' ? (
                        <Stack direction="row" spacing={1}>
                            <TextField label="Input" onChange={handleInputChange} size="small" value={input} />
                            <Button
                                disabled={!backendAvailable || input.trim().length === 0}
                                onClick={handleSendInput}
                                size="small"
                                variant="outlined"
                            >
                                Send
                            </Button>
                        </Stack>
                    ) : null}
                </Stack>
            ) : null}
            {/* Question: What is run history for here, and is it still needed beside the project-wide run form?
            <ActionRunHistory entries={history} error={historyError} /> */}
            {/* Question: What are persisted conversations for here, and are they still needed in the new FAB workflow?
            {hasConversations ? (
                <List dense disablePadding>
                    {conversations.map((conversation, index) => (
                        <Box key={conversation.id}>
                            {index > 0 ? <Divider component="li" /> : null}
                            <ConversationItem backendAvailable={backendAvailable} conversation={conversation} onContinue={onContinue} />
                        </Box>
                    ))}
                </List>
            ) : null}
            {!hasConversations && hasErrors ? (
                <Typography color="text.secondary" variant="body2">Agent conversation errors reported.</Typography>
            ) : null}
            {!hasConversations && !hasErrors ? (
                <Typography color="text.secondary" variant="body2">No agent conversations.</Typography>
            ) : null} */}
        </Stack>
    )
}
