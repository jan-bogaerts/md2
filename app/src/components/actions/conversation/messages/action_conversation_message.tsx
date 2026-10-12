import { Box, Typography } from '@mui/material'
import { memo, useSyncExternalStore } from 'react'
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
import { ActionConversationCodeBlock } from './action_conversation_code_block';
import { ActionConversationTable } from './action_conversation_table';
import { ActionQueuedPromptRow } from '../transcript/action_queued_prompt';

const subscribeNoPrompt = () => () => undefined;
const getNoPrompt = () => null;

const MARKDOWN_COMPONENTS = { a: ActionConversationLink, pre: ActionConversationCodeBlock, table: ActionConversationTable };

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
    const conversation = tracker.getConversation();
    const prompt = tracker.getPrompt(entry.id);
    const delivery = useSyncExternalStore(
        prompt?.subscribe ?? subscribeNoPrompt,
        prompt?.getSnapshot ?? getNoPrompt,
        prompt?.getSnapshot ?? getNoPrompt,
    );
    const sent = !delivery || delivery.state === 'sent';
    const label = delivery?.state === 'transmitting' ? 'In transmission' : 'Failed to send';
    const queued = delivery?.state === 'queued' || delivery?.state === 'sending';

    return (
        <Box
            aria-label={sent ? undefined : queued ? 'Queued prompt' : 'Pending prompt'}
            className="conversation-message"
            sx={{
                alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                gap: 0.5,
                maxWidth: '88%',
                minWidth: 0,
            }}
        >
            {queued && delivery.prompt && delivery.runId ? (
                <ActionQueuedPromptRow entry={delivery.prompt} runId={delivery.runId} />
            ) : (
                <Box
                    sx={{
                        bgcolor: entry.role === 'user' ? 'custom.primaryBg' : 'custom.track',
                        borderRadius: 1,
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                        px: 1.25,
                        py: 1,
                        ...markdownContentSx,

                    }}
                >
                    {!sent ? <Typography color="text.secondary" variant="caption">{label}</Typography> : null}
                    {delivery?.error ? <Typography color="error" variant="caption">{delivery.error}</Typography> : null}
                    <ActionConversationLinkContext value={conversation?.cardInternalId ?? null}>
                        <Box className="mdxeditor-content">
                            <ReactMarkdown
                                components={MARKDOWN_COMPONENTS}
                                remarkPlugins={[remarkGfm]}
                                urlTransform={actionConversationUrlTransform}
                            >
                                {delivery?.content ?? entry.content}
                            </ReactMarkdown>
                        </Box>
                    </ActionConversationLinkContext>
                </Box>
            )}
            {sent && conversation ? <ActionConversationMessageCommands commands={commands} message={entry} tracker={tracker} /> : null}
        </Box>
    )
})
