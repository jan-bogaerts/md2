import { useEffect, useSyncExternalStore, type ChangeEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { AgentConversation } from '../../../data/data_types'
import { useActionRunStores } from '../../hooks/use_action_runs'
import { useCardActionUnseenResults } from '../../hooks/use_card_action_unseen_results'
import { ActionConversationPicker } from './action_conversation_picker'
import type { ConversationPickerConversation } from './action_conversation_picker_data'
import { resolveDisplayedConversation, type ActionConversationStore } from './action_conversation_store'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ActionConversationPickerOwnerProps {
    actionId: string
    bindingStore: ActionRunBindingStore
    context: ActionContext
    store: ActionConversationStore
}

/** Loads and selects conversation history at picker boundary. */
export function ActionConversationPickerOwner(props: ActionConversationPickerOwnerProps) {
    const { actionId, bindingStore, context, store } = props
    const runStores = useActionRunStores(actionId, context)
    const boundRunId = useSyncExternalStore(bindingStore.subscribe, bindingStore.getSnapshot, bindingStore.getSnapshot)
    const unseenResultConversations = useCardActionUnseenResults([actionId], context)
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    store.configureInitialSelection(unseenResultConversations[0]?.path ?? null)
    const liveConversations: ConversationPickerConversation[] = runStores
        .map(({ getSnapshot }) => getSnapshot().conversation)
        .filter((conversation): conversation is AgentConversation => !!conversation)
    const boundConversation = runStores
        .find(({ getSnapshot }) => getSnapshot().runId === boundRunId)
        ?.getSnapshot().conversation ?? null

    useEffect(() => {
        void store.load()
    }, [store])

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        void store.select(event.target.value)
    }
    const displayedConversation = resolveDisplayedConversation<ConversationPickerConversation>(
        boundConversation,
        snapshot.selectedConversation,
    )

    return (
        <ActionConversationPicker
            conversations={store.conversationOptions(liveConversations)}
            disabled={false}
            loading={snapshot.loading}
            onChange={handleChange}
            selectedPath={displayedConversation?.path ?? ''}
        />
    )
}
