import { Box, Stack, Typography } from '@mui/material'
import { memo, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { actionStatusLabel } from '../shared/action_status'
import type { ActionConversationStore } from './action_conversation_store'
import { ConversationContextUsage } from './conversation_context_usage'
import { ConversationTimer } from './conversation_timer'

interface ConversationMetaInfoProps {
    actionId: string
    context: ActionContext
    store: ActionConversationStore
}

/** Bottom metadata row that owns timer, status, and context-usage subscriptions. */
export const ConversationMetaInfo = memo(function ConversationMetaInfo(
    { actionId, context, store }: ConversationMetaInfoProps,
) {
    const liveConversationPath = useActionRunSelector(actionId, context, (run) => run?.conversation?.path ?? null)
    const liveTimer = useActionRunSelector(actionId, context, (run) => run?.conversation?.timer)
    const runStatus = useActionRunSelector(actionId, context, (run) => run?.status ?? 'idle')
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const displayingHistoricalConversation = !!selectedConversation && selectedConversation.path !== liveConversationPath
    const conversationExists = displayingHistoricalConversation ? true : !!liveConversationPath || !!selectedConversation
    const timer = displayingHistoricalConversation ? selectedConversation.timer : liveTimer ?? selectedConversation?.timer
    const status: PopupRunStatus = displayingHistoricalConversation
        ? selectedConversation.status === 'waitingForInput' ? 'waitingForInput' : 'idle'
        : runStatus

    if (!conversationExists && status === 'idle') return null

    return (
        <Stack aria-label="Conversation metadata" direction="row" spacing={1}
            sx={{ alignItems: 'baseline', flexShrink: 0 }}>
            {status !== 'idle' ? (
                <Typography color={status === 'failed' ? 'error.main' : 'text.secondary'} role="status" variant="caption">
                    {actionStatusLabel(status)}
                </Typography>
            ) : null}
            {conversationExists ? <ConversationTimer status={status} timer={timer} /> : null}
            <Box sx={{ flex: 1 }} />
            <ConversationContextUsage actionId={actionId} context={context} store={store} />
        </Stack>
    )
})
