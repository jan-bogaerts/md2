import { Box, CircularProgress, Tooltip } from '@mui/material'
import { memo, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import type { ActionConversationStore } from './action_conversation_store'
import { contextWindowUsedPercent } from './conversation_context_window'

interface ConversationContextUsageProps {
    actionId: string
    context: ActionContext
    store: ActionConversationStore
}

/** Tracks and renders context-window usage without routing its value through the chat. */
export const ConversationContextUsage = memo(function ConversationContextUsage(
    { actionId, context, store }: ConversationContextUsageProps,
) {
    const liveConversationPath = useActionRunSelector(actionId, context, (run) => run?.conversation?.path ?? null)
    const liveContextWindowUsage = useActionRunSelector(
        actionId, context, (run) => run?.conversation?.contextWindowUsage ?? null,
    )
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const contextWindowUsage = selectedConversation && selectedConversation.path !== liveConversationPath
        ? selectedConversation.contextWindowUsage
        : liveContextWindowUsage
    const contextUsedPercent = contextWindowUsedPercent(contextWindowUsage)

    if (contextUsedPercent === null) return null

    return (
        <Box sx={{ display: 'inline-flex', height: 16, position: 'relative', width: 16 }}>
            <CircularProgress aria-hidden="true" size={16}
                sx={{ color: 'action.disabledBackground', left: 0, position: 'absolute', top: 0 }}
                value={100} variant="determinate" />
            <Tooltip describeChild title={`Context usage: ${contextUsedPercent}%`}>
                <CircularProgress aria-label="Context usage" color="info" size={16}
                    sx={{ left: 0, position: 'absolute', top: 0 }} value={contextUsedPercent} variant="determinate" />
            </Tooltip>
        </Box>
    )
})
