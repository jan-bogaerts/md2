import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useLayoutEffect, useRef, type UIEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentConversation } from '../../data/data_types'
import { useAppTheme } from '../../theme/use_app_theme'
import { buildMarkdownContentSx } from '../editor/markdown_style_sx'
import type { PopupRunStatus } from './action_popup_defaults'
import { actionStatusLabel } from './action_status'
import { ConversationTimer } from './conversation_timer'

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96

interface ActionConversationChatProps {
    conversation: AgentConversation | null
    onConversationViewed?: (conversation: AgentConversation) => void
    status: PopupRunStatus
}

function viewportIsAtEnd(viewport: HTMLDivElement) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= CHAT_END_TOLERANCE
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, onConversationViewed, status }: ActionConversationChatProps) {
    const { markdownStyleConfig } = useAppTheme()
    const markdownContentSx = buildMarkdownContentSx(markdownStyleConfig)
    const messages = conversation?.messages.filter(({ role }) => role === 'user' || role === 'assistant') ?? []
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
            {messages.map((message) => (
                <Box
                    key={message.id}
                    sx={{
                        alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                        bgcolor: message.role === 'user' ? 'custom.primaryBg' : 'custom.track',
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </Box>
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
