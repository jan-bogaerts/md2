import { Box } from '@mui/material'
import { useEffect, useMemo, useSyncExternalStore, type ChangeEvent } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { AgentConversation } from '../../../../data/data_types'
import { useActionRunStores, useRunSelector } from '../../../hooks/use_action_runs'
import { useCardActionUnseenResults } from '../../../hooks/use_card_action_unseen_results'
import { ActionConversationPicker } from './action_conversation_picker'
import { ActionConversationPinButton } from './action_conversation_pin_button'
import type { ConversationPickerConversation } from './action_conversation_picker_data'
import { resolveDisplayedConversation, type ActionConversationStore } from '../state/action_conversation_store'
import type { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import type { ActionRun } from '../../../../services/actions/action_run_registry'

interface ActionConversationPickerOwnerProps {
    actionId: string
    bindingStore: ActionRunBindingStore
    context: ActionContext
    store: ActionConversationStore
}

function createBoundConversationSelector() {
    let selected: ConversationPickerConversation | null = null

    return (run: ActionRun | null) => {
        const conversation = run?.conversation
        if (!conversation) {
            selected = null

            return null
        }
        if (
            selected
            && selected.actionId === conversation.actionId
            && selected.cardInternalId === conversation.cardInternalId
            && selected.hasExplicitTitle === conversation.hasExplicitTitle
            && selected.id === conversation.id
            && selected.path === conversation.path
            && selected.startedAt === conversation.startedAt
            && selected.title === conversation.title
        ) return selected

        selected = {
            actionId: conversation.actionId,
            cardInternalId: conversation.cardInternalId,
            hasExplicitTitle: conversation.hasExplicitTitle,
            id: conversation.id,
            path: conversation.path,
            startedAt: conversation.startedAt,
            title: conversation.title,
        }

        return selected
    }
}

/** Loads and selects conversation history at picker boundary. */
export function ActionConversationPickerOwner(props: ActionConversationPickerOwnerProps) {
    const { actionId, bindingStore, context, store } = props
    const selectBoundConversation = useMemo(() => createBoundConversationSelector(), [])
    const runStores = useActionRunStores(actionId, context)
    const boundRunId = useSyncExternalStore(bindingStore.subscribe, bindingStore.getSnapshot, bindingStore.getSnapshot)
    const boundConversation = useRunSelector(boundRunId, selectBoundConversation)
    const unseenResultConversations = useCardActionUnseenResults([actionId], context)
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    store.configureInitialSelection(unseenResultConversations[0]?.path ?? null)
    const liveConversations: ConversationPickerConversation[] = runStores
        .map(({ getSnapshot }) => getSnapshot().conversation)
        .filter((conversation): conversation is AgentConversation => !!conversation)
    const pickerConversations = boundConversation
        && !liveConversations.some(({ path }) => path === boundConversation.path)
        ? [...liveConversations, boundConversation]
        : liveConversations

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

    const handleTogglePinned = () => {
        if (displayedConversation) void store.togglePinned(displayedConversation)
    }

    return (
        <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 1, gap: { sm: 0.5, xs: 0 }, minWidth: 0 }}>
            <ActionConversationPicker
                conversations={store.conversationOptions(pickerConversations)}
                disabled={false}
                loading={snapshot.loading}
                onChange={handleChange}
                selectedPath={displayedConversation?.path ?? ''}
            />
            <ActionConversationPinButton
                conversation={displayedConversation}
                disabled={snapshot.pinningConversationId !== null}
                onToggle={handleTogglePinned}
            />
        </Box>
    )
}
