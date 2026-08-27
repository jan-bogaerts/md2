import { Stack } from '@mui/material'
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { ActionContext } from '../../../data/action_context'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import { cardPopupService, subscribeCardPopups } from '../../../services/card_popup_service'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import {
    ActionConversationTranscript,
} from './action_conversation_transcript'
import {
    createAcknowledgementConversationSelector,
    createConversationTranscriptSelector,
    selectedConversationTranscript,
} from './action_conversation_chat_selectors'
import { resolveDisplayedConversation, type ActionConversationStore } from './action_conversation_store'
import { ConversationMetaInfo } from './conversation_meta_info'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

const EMPTY_QUEUED_PROMPTS: never[] = []

interface ActionConversationChatProps {
    actionId: string
    bindingStore: ActionRunBindingStore
    context: ActionContext
    metadataContent?: ReactNode
    popupEntryId?: string
    store: ActionConversationStore
}

/** Conversation surface; owns selection, live-run, visibility, and acknowledgement subscriptions. */
export function ActionConversationChat(
    { actionId, bindingStore, context, metadataContent, popupEntryId, store }: ActionConversationChatProps,
) {
    const selectLiveTranscript = useMemo(() => createConversationTranscriptSelector(), [])
    const selectAcknowledgementConversation = useMemo(() => createAcknowledgementConversationSelector(), [])
    const boundRunId = useBoundRunId(bindingStore)
    const liveConversation = useRunSelector(boundRunId, selectAcknowledgementConversation)
    const liveTranscript = useRunSelector(boundRunId, selectLiveTranscript)
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? 'idle')
    const runId = useRunSelector(boundRunId, (run) => run?.runId ?? null)
    const queuedPrompts = useRunSelector(boundRunId, (run) => run?.queuedPrompts ?? EMPTY_QUEUED_PROMPTS)
    const { selectedConversation } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const popupEntries = useSyncExternalStore(
        subscribeCardPopups,
        () => cardPopupService.getSnapshot(),
        () => cardPopupService.getSnapshot(),
    )
    const selectedTranscript = useMemo(
        () => selectedConversationTranscript(selectedConversation),
        [selectedConversation],
    )
    const conversation = resolveDisplayedConversation(liveConversation, selectedConversation)
    const transcript = resolveDisplayedConversation(liveTranscript, selectedTranscript)
    const displayingLiveConversation = !selectedConversation || selectedConversation.path === liveConversation?.path
    const status: PopupRunStatus = displayingLiveConversation
        ? runStatus
        : conversation?.status === 'waitingForInput' ? 'waitingForInput' : 'idle'
    const cardInternalId = context.cardInternalId
    const visible = !!popupEntryId && popupEntries.at(-1)?.id === popupEntryId && !!cardInternalId && !!conversation

    useEffect(() => {
        if (!popupEntryId || !cardInternalId || !conversation) return undefined

        agentAcknowledgementService.setConversationVisible(popupEntryId, cardInternalId, actionId, conversation, visible)

        return () => agentAcknowledgementService.setConversationVisible(
            popupEntryId, cardInternalId, actionId, conversation, false,
        )
    }, [actionId, cardInternalId, conversation, popupEntryId, visible])

    return (
        <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            <ActionConversationTranscript
                conversation={transcript}
                queuedPrompts={displayingLiveConversation ? queuedPrompts : EMPTY_QUEUED_PROMPTS}
                runId={displayingLiveConversation ? runId : null}
                status={status}
            />
            <ConversationMetaInfo bindingStore={bindingStore} metadataContent={metadataContent} store={store} />
        </Stack>
    )
}
