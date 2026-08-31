import { Box, Stack, Typography } from '@mui/material'
import { memo, useSyncExternalStore } from 'react'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { ActionUsageSummaryOwner } from '../run/popup/action_usage_summary_owner'
import type { ActionUsageValuesService } from '../run/popup/action_usage_values_service'
import { actionStatusLabel } from '../shared/action_status'
import type { ActionConversationStore } from './action_conversation_store'
import { ConversationContextUsage } from './conversation_context_usage'
import { ConversationTimer } from './conversation_timer'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ConversationMetaInfoProps {
    bindingStore: ActionRunBindingStore
    store: ActionConversationStore
    usageValuesService?: ActionUsageValuesService
}

/** Bottom metadata row that owns timer, status, and context-usage subscriptions. */
export const ConversationMetaInfo = memo(function ConversationMetaInfo(
    { bindingStore, store, usageValuesService }: ConversationMetaInfoProps,
) {
    const boundRunId = useBoundRunId(bindingStore)
    const liveConversationPath = useRunSelector(boundRunId, (run) => run?.conversation?.path ?? null)
    const liveTimer = useRunSelector(boundRunId, (run) => run?.conversation?.timer)
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? 'idle')
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const displayingHistoricalConversation = !!selectedConversation && selectedConversation.path !== liveConversationPath
    const conversationExists = displayingHistoricalConversation ? true : !!liveConversationPath || !!selectedConversation
    const timer = displayingHistoricalConversation ? selectedConversation.timer : liveTimer ?? selectedConversation?.timer
    const status: PopupRunStatus = displayingHistoricalConversation
        ? selectedConversation.status === 'waitingForInput' ? 'waitingForInput' : 'idle'
        : runStatus

    if (!conversationExists && status === 'idle' && !usageValuesService) return null

    return (
        <Stack aria-label="Conversation metadata" direction="row" spacing={1}
            sx={{ alignItems: 'baseline', containerType: 'inline-size', flexShrink: 0 }}>
            {status !== 'idle' ? (
                <Typography color={status === 'failed' ? 'error.main' : 'text.secondary'} role="status" variant="caption">
                    {actionStatusLabel(status)}
                </Typography>
            ) : null}
            {conversationExists ? <ConversationTimer status={status} timer={timer} /> : null}
            <Box sx={{ flex: 1, justifyContent: 'center', display: 'flex' }}>
                {usageValuesService ? <ActionUsageSummaryOwner service={usageValuesService} /> : null}
            </Box>
            <ConversationContextUsage bindingStore={bindingStore} store={store} />
        </Stack>
    )
})
