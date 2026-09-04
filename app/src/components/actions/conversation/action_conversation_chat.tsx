import { Stack } from '@mui/material'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import { cardPopupService, subscribeCardPopups } from '../../../services/card_popup_service'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import {
    ActionConversationTranscript,
} from './action_conversation_transcript'
import {
    createAcknowledgementConversationSelector,
} from './action_conversation_chat_selectors'
import { resolveDisplayedConversation, type ActionConversationStore } from './action_conversation_store'
import { ConversationMetaInfo } from './conversation_meta_info'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import type { ActionUsageValuesService } from '../run/popup/action_usage_values_service'

interface ActionConversationChatProps {
    actionId: string
    bindingStore: ActionRunBindingStore
    context: ActionContext
    popupEntryId?: string
    store: ActionConversationStore
    usageValuesService?: ActionUsageValuesService
}

/** Conversation surface; owns selection, live-run, visibility, and acknowledgement subscriptions. */
export function ActionConversationChat(
    { actionId, bindingStore, context, popupEntryId, store, usageValuesService }: ActionConversationChatProps,
) {
    const selectAcknowledgementConversation = useMemo(() => createAcknowledgementConversationSelector(), [])
    const boundRunId = useBoundRunId(bindingStore)
    const liveConversation = useRunSelector(boundRunId, selectAcknowledgementConversation)
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const popupEntries = useSyncExternalStore(
        subscribeCardPopups,
        () => cardPopupService.getSnapshot(),
        () => cardPopupService.getSnapshot(),
    )
    const conversation = resolveDisplayedConversation(liveConversation, selectedConversation)
    const scope = context.cardInternalId ?? null
    const popupVisible = context.kind === 'project' || popupEntries.at(-1)?.id === popupEntryId
    const visible = !!popupEntryId && popupVisible && !!conversation

    useEffect(() => {
        if (!popupEntryId || !conversation) return undefined

        agentAcknowledgementService.setConversationVisible(popupEntryId, scope, actionId, conversation, visible)

        return () => agentAcknowledgementService.setConversationVisible(
            popupEntryId, scope, actionId, conversation, false,
        )
    }, [actionId, conversation, popupEntryId, scope, visible])

    return (
        <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            <ActionConversationTranscript
                bindingStore={bindingStore}
                store={store}
            />
            <ConversationMetaInfo bindingStore={bindingStore} store={store} usageValuesService={usageValuesService} />
        </Stack>
    )
}
