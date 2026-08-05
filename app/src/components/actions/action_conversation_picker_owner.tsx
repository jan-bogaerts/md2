import { useEffect, useMemo, useSyncExternalStore, type ChangeEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionRun } from '../../services/actions/action_run_registry'
import { useActionRunSelector } from '../hooks/use_action_runs'
import { useCardActionUnseenResults } from '../hooks/use_card_action_unseen_results'
import { ActionConversationPicker } from './action_conversation_picker'
import type { ConversationPickerConversation } from './action_conversation_picker_data'
import type { ActionConversationStore } from './action_conversation_store'

interface ActionConversationPickerOwnerProps {
    actionId: string
    context: ActionContext
    store: ActionConversationStore
}

function selectSessionActive(run: ActionRun | null) {
    return run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
}

/** Loads and selects conversation history at picker boundary. */
export function ActionConversationPickerOwner(props: ActionConversationPickerOwnerProps) {
    const { actionId, context, store } = props
    const sessionActive = useActionRunSelector(actionId, context, selectSessionActive)
    const liveActionId = useActionRunSelector(actionId, context, (run) => run?.conversation?.actionId)
    const liveCardInternalId = useActionRunSelector(actionId, context, (run) => run?.conversation?.cardInternalId)
    const liveHasExplicitTitle = useActionRunSelector(actionId, context, (run) => run?.conversation?.hasExplicitTitle)
    const liveId = useActionRunSelector(actionId, context, (run) => run?.conversation?.id ?? null)
    const livePath = useActionRunSelector(actionId, context, (run) => run?.conversation?.path)
    const liveStartedAt = useActionRunSelector(actionId, context, (run) => run?.conversation?.startedAt)
    const liveTitle = useActionRunSelector(actionId, context, (run) => run?.conversation?.title)
    const unseenResultConversations = useCardActionUnseenResults([actionId], context)
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    store.configureInitialSelection(unseenResultConversations[0]?.path ?? null)
    const liveConversation = useMemo<ConversationPickerConversation | null>(() => {
        if (liveId === null) return null
        if (liveHasExplicitTitle === undefined || livePath === undefined || liveStartedAt === undefined || liveTitle === undefined) {
            throw new Error('Live conversation is missing picker metadata')
        }

        return {
            actionId: liveActionId,
            cardInternalId: liveCardInternalId,
            hasExplicitTitle: liveHasExplicitTitle,
            id: liveId,
            path: livePath,
            startedAt: liveStartedAt,
            title: liveTitle,
        }
    }, [liveActionId, liveCardInternalId, liveHasExplicitTitle, liveId, livePath, liveStartedAt, liveTitle])

    useEffect(() => {
        void store.load()
    }, [store])

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        void store.select(event.target.value)
    }

    return (
        <ActionConversationPicker
            conversations={store.conversationOptions(liveConversation)}
            disabled={sessionActive}
            loading={snapshot.loading}
            onChange={handleChange}
            selectedPath={liveConversation?.path ?? snapshot.selectedConversation?.path ?? ''}
        />
    )
}
