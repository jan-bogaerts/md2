import { Box } from '@mui/material'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentConversationMessageEntry } from '../../../data/data_types'
import { useAppTheme } from '../../../theme/use_app_theme'
import { ActionConversationLink } from './action_conversation_link'
import { actionConversationUrlTransform } from './action_conversation_url_transform'

const MARKDOWN_COMPONENTS = { a: ActionConversationLink }

interface ActionConversationMessageProps {
    entry: AgentConversationMessageEntry
}

/** Renders one referentially stable transcript message. */
export const ActionConversationMessage = memo(function ActionConversationMessage({ entry }: ActionConversationMessageProps) {
    const { markdownContentSx } = useAppTheme()

    return (
        <Box
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
    )
})
