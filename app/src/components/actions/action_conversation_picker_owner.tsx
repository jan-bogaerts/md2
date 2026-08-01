import { useEffect, useSyncExternalStore, type ChangeEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import { useActionRun } from '../hooks/use_action_runs'
import { ActionConversationPicker } from './action_conversation_picker'
import type { ActionConversationStore } from './action_conversation_store'

interface ActionConversationPickerOwnerProps {
    actionId: string
    context: ActionContext
    store: ActionConversationStore
}

/** Loads and selects conversation history at picker boundary. */
export function ActionConversationPickerOwner(props: ActionConversationPickerOwnerProps) {
    const { actionId, context, store } = props
    const run = useActionRun(actionId, context)
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    const liveConversation = run?.conversation ?? null

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
