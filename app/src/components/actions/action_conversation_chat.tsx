import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useLayoutEffect, useRef, type UIEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentConversation, AgentConversationEvent } from '../../data/data_types'
import { useAppTheme } from '../../theme/use_app_theme'
import { buildMarkdownContentSx } from '../editor/markdown_style_sx'
import type { PopupRunStatus } from './action_popup_defaults'
import { ActionConversationLink } from './action_conversation_link'
import { actionConversationUrlTransform } from './action_conversation_url_transform'
import { actionStatusLabel } from './action_status'
import { ConversationTimer } from './conversation_timer'
import { AgentToolEvent } from './agent_tool_event'
import { CommandExecutionEvent } from './command_execution_event'
import { ReasoningEvent } from './reasoning_event'
import { eventIdentity } from './event_display'

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96
const MARKDOWN_COMPONENTS = { a: ActionConversationLink }

interface ActionConversationChatProps {
    conversation: AgentConversation | null
    onConversationViewed?: (conversation: AgentConversation) => void
    status: PopupRunStatus
}

function viewportIsAtEnd(viewport: HTMLDivElement) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= CHAT_END_TOLERANCE
}

function isCodexConversation(conversation: AgentConversation) {
    return conversation.providerSessions.some(({ agent }) => agent === 'codex')
        || conversation.entries.some((entry) => entry.kind === 'message' && entry.agent === 'codex')
        || conversation.entries.some((entry) => entry.kind === 'event' && !!entry.providerItemId)
}

function visibleConversationEntries(conversation: AgentConversation | null) {
    if (!conversation) return []
    const showEvents = isCodexConversation(conversation)

    return conversation.entries.filter((entry) => entry.kind === 'message'
        || (showEvents && (entry.type !== 'reasoning' || entry.status !== 'completed')))
}

function renderEvent(event: AgentConversationEvent) {
    if (event.type === 'reasoning') return <ReasoningEvent event={event} />
    if (event.type === 'commandExecution') return <CommandExecutionEvent event={event} />

    return <AgentToolEvent event={event} />
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, onConversationViewed, status }: ActionConversationChatProps) {
    const { markdownStyleConfig } = useAppTheme()
    const markdownContentSx = buildMarkdownContentSx(markdownStyleConfig)
    const entries = visibleConversationEntries(conversation)
    const viewportRef = useRef<HTMLDivElement>(null)
    const conversationPathRef = useRef<string | null | undefined>(undefined)
    const stuckToEndRef = useRef(true)

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        stuckToEndRef.current = viewportIsAtEnd(event.currentTarget)
    }

    useEffect(() => {
        if (!conversation?.completedAt || conversation.status === 'running' || conversation.status === 'waitingForInput') return

        onConversationViewed?.(conversation)
    }, [conversation, onConversationViewed])

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const conversationPath = conversation?.path ?? null
        const conversationChanged = conversationPathRef.current !== conversationPath
        conversationPathRef.current = conversationPath
        if (conversationChanged) stuckToEndRef.current = true
        if (!stuckToEndRef.current) return

        viewport.scrollTop = viewport.scrollHeight
    })

    return (
        <Stack
            aria-label="Conversation chat"
            onScroll={handleScroll}
            ref={viewportRef}
            spacing={1}
            sx={{ flex: 1, minHeight: MIN_CHAT_HEIGHT, overflowX: 'hidden', overflowY: 'auto' }}
        >
            {entries.map((entry) => entry.kind === 'message' ? (
                <Box
                    key={entry.id}
                    sx={{
                        alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start',
                        bgcolor: entry.role === 'user' ? 'custom.primaryBg' : 'custom.track',
                        borderRadius: 1,
                        flexShrink: 0,
                        maxWidth: '88%',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                        px: 1.25,
                        py: 1,
                        ...markdownContentSx,
                    }}
                >
                    <Box className="mdxeditor-content">
                        <ReactMarkdown
                            components={MARKDOWN_COMPONENTS}
                            remarkPlugins={[remarkGfm]}
                            urlTransform={actionConversationUrlTransform}
                        >
                            {entry.content}
                        </ReactMarkdown>
                    </Box>
                </Box>
            ) : (
                <Box key={eventIdentity(entry)} sx={{ minWidth: 0 }}>
                    {renderEvent(entry)}
                </Box>
            ))}
            {status !== 'idle' ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                    <Typography color={status === 'failed' ? 'error.main' : 'text.secondary'} role="status" variant="caption">
                        {actionStatusLabel(status)}
                    </Typography>
                    {conversation ? (
                        <ConversationTimer completedAt={conversation.completedAt} startedAt={conversation.startedAt} />
                    ) : null}
                </Stack>
            ) : null}
        </Stack>
    )
}
