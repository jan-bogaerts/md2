import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useLayoutEffect, useRef, type UIEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentConversation, AgentConversationEvent, AgentConversationMessage } from '../../data/data_types'
import { useAppTheme } from '../../theme/use_app_theme'
import { buildMarkdownContentSx } from '../editor/markdown_style_sx'
import type { PopupRunStatus } from './action_popup_defaults'
import { ActionConversationLink } from './action_conversation_link'
import { actionConversationUrlTransform } from './action_conversation_url_transform'
import { actionStatusLabel } from './action_status'
import { ConversationTimer } from './conversation_timer'
import { AgentToolActivity } from './agent_tool_activity'
import { CommandExecutionActivity } from './command_execution_activity'
import { ReasoningActivity } from './reasoning_activity'
import { activityIdentity } from './activity_display'

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96
const MARKDOWN_COMPONENTS = { a: ActionConversationLink }

interface ActionConversationChatProps {
    conversation: AgentConversation | null
    onConversationViewed?: (conversation: AgentConversation) => void
    status: PopupRunStatus
}

type ConversationFeedEntry =
    | { kind: 'activity', order: number, value: AgentConversationEvent }
    | { kind: 'message', order: number, value: AgentConversationMessage }

function viewportIsAtEnd(viewport: HTMLDivElement) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= CHAT_END_TOLERANCE
}

function isCodexConversation(conversation: AgentConversation) {
    return conversation.providerSessions.some(({ agent }) => agent === 'codex')
        || conversation.messages.some(({ agent }) => agent === 'codex')
        || conversation.events.some(({ providerItemId }) => !!providerItemId)
}

function buildConversationFeed(conversation: AgentConversation | null) {
    if (!conversation) return []
    const conversationActive = conversation.status === 'running' || conversation.status === 'waitingForInput'
    const messages: ConversationFeedEntry[] = conversation.messages
        .filter(({ role }) => role === 'user' || role === 'assistant')
        .map((value, order) => ({ kind: 'message', order, value }))
    const activities: ConversationFeedEntry[] = isCodexConversation(conversation)
        ? conversation.events
            .filter(({ status, type }) => conversationActive || type !== 'reasoning' || status !== 'completed')
            .map((value, index) => ({ kind: 'activity', order: messages.length + index, value }))
        : []

    return [...messages, ...activities].sort((left, right) => {
        const leftSequence = left.value.sequence
        const rightSequence = right.value.sequence
        if (leftSequence !== undefined && rightSequence !== undefined) return leftSequence - rightSequence || left.order - right.order
        if (leftSequence !== undefined) return -1
        if (rightSequence !== undefined) return 1

        return left.order - right.order
    })
}

function renderActivity(activity: AgentConversationEvent) {
    if (activity.type === 'reasoning') return <ReasoningActivity activity={activity} />
    if (activity.type === 'commandExecution') return <CommandExecutionActivity activity={activity} />

    return <AgentToolActivity activity={activity} />
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, onConversationViewed, status }: ActionConversationChatProps) {
    const { markdownStyleConfig } = useAppTheme()
    const markdownContentSx = buildMarkdownContentSx(markdownStyleConfig)
    const feed = buildConversationFeed(conversation)
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
            {feed.map((entry) => entry.kind === 'message' ? (
                <Box
                    key={entry.value.id}
                    sx={{
                        alignSelf: entry.value.role === 'user' ? 'flex-end' : 'flex-start',
                        bgcolor: entry.value.role === 'user' ? 'custom.primaryBg' : 'custom.track',
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
                            {entry.value.content}
                        </ReactMarkdown>
                    </Box>
                </Box>
            ) : (
                <Box key={activityIdentity(entry.value)} sx={{ minWidth: 0 }}>
                    {renderActivity(entry.value)}
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
