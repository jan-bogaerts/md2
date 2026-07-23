import { Box, Stack, Typography } from '@mui/material'
import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentConversation } from '../../data/data_types'
import { useAppTheme } from '../../theme/use_app_theme'
import { buildMarkdownContentSx } from '../editor/markdown_style_sx'
import type { PopupRunStatus } from './action_popup_defaults'
import { actionStatusLabel } from './action_status'
import { ConversationTimer } from './conversation_timer'

interface ActionConversationChatProps {
    conversation: AgentConversation | null
    onConversationViewed?: (conversation: AgentConversation) => void
    status: PopupRunStatus
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, onConversationViewed, status }: ActionConversationChatProps) {
    const { markdownStyleConfig } = useAppTheme()
    const markdownContentSx = buildMarkdownContentSx(markdownStyleConfig)
    const messages = conversation?.messages.filter(({ role }) => role === 'user' || role === 'assistant') ?? []

    useEffect(() => {
        if (!conversation?.completedAt || conversation.status === 'running') return

        onConversationViewed?.(conversation)
    }, [conversation, onConversationViewed])

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
                        overflowX: 'auto',
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
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
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
