import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { dialogService } from '../../services/dialog_service'
import { useActionRun } from '../hooks/use_action_runs'
import type { ActionConversationStore } from './action_conversation_store'
import type { ActionHistoryStore } from './action_history_store'
import { currentActionPromptDraft, runPopupAction } from './action_popup_operations'
import { ActionPhraseButtons } from './action_phrase_buttons'
import type { ActionRunInputStore } from './action_run_input_store'
import type { ActionRunResultStore } from './action_run_result_store'
import { useActionRunSettings } from './use_action_run_settings'

interface ActionPhraseButtonsOwnerProps {
    action: ActionDefinition
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
}

/** Owns follow-up visibility and phrase actions. */
export function ActionPhraseButtonsOwner(props: ActionPhraseButtonsOwnerProps) {
    const { action, context, conversationStore, historyStore, inputStore, resultStore, runValidationError } = props
    const run = useActionRun(action.id, context)
    useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot, conversationStore.getSnapshot)
    const settings = useActionRunSettings(action, inputStore)
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    const agentActive = sessionActive && run?.activeActionType === 'agent'
    const continuationPath = conversationStore.continuationPath(run?.conversation ?? null)
    const isFollowUp = action.type === 'agent' && (agentActive || (!sessionActive && !!continuationPath))
    if (!isFollowUp || action.phrases.length === 0) return null

    const handleSelect = (text: string) => {
        const promptDraft = currentActionPromptDraft(action, context, false)
        promptDraft.replace(text)
        void promptDraft.synchronize().catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not queue agent prompt' })
        })
        inputStore.setConvertMessage(null)
    }
    const handleDoubleClick = (text: string) => {
        handleSelect(text)
        void runPopupAction({
            action,
            context,
            conversationStore,
            historyStore,
            inputStore,
            resultStore,
            runValidationError,
            settings,
        })
    }

    return <ActionPhraseButtons onDoubleClick={handleDoubleClick} onSelect={handleSelect} phrases={action.phrases} />
}
