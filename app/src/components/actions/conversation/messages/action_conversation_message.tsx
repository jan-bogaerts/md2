import { Box } from '@mui/material'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentConversationMessageEntry } from '../../../../data/data_types'
import { useAppTheme } from '../../../../theme/use_app_theme'
import { ActionConversationLink } from './action_conversation_link'
import { ActionConversationLinkContext } from './action_conversation_link_context'
import { actionConversationUrlTransform } from './action_conversation_url_transform'
import type { ActionConversationChatlogTracker } from '../transcript/action_conversation_chatlog_tracker'
import type { ActionConversationCommandOperations } from '../state/action_conversation_command_service'
import { ActionConversationMessageCommands } from './action_conversation_message_commands'

const MARKDOWN_COMPONENTS = { a: ActionConversationLink }

interface ActionConversationMessageProps {
    commands: ActionConversationCommandOperations
    entry: AgentConversationMessageEntry
    tracker: ActionConversationChatlogTracker
}

/** Renders one referentially stable transcript message. */
export const ActionConversationMessage = memo(function ActionConversationMessage(
    { commands, entry, tracker }: ActionConversationMessageProps,
) {
    const { markdownContentSx } = useAppTheme()
    const conversation = tracker.getConversation()
    if (!conversation) return null

    return (
        <Box
            className="conversation-message"
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
                '&& .mdxeditor-content pre': {
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    boxSizing: 'border-box',
                    maxWidth: '100%',
                    overflowWrap: 'anywhere',
                    p: 1,
                    whiteSpace: 'pre-wrap',
                    width: '100%',
                },
            }}
        >
            <ActionConversationLinkContext value={conversation.cardInternalId ?? null}>
                <Box className="mdxeditor-content">
                    <ReactMarkdown
                        components={MARKDOWN_COMPONENTS}
                        remarkPlugins={[remarkGfm]}
                        urlTransform={actionConversationUrlTransform}
                    >
                        {entry.content}
                    </ReactMarkdown>
                </Box>
            </ActionConversationLinkContext>
            <ActionConversationMessageCommands commands={commands} conversation={conversation} message={entry} />
        </Box>
    )
})
