import { useSyncExternalStore, type ChangeEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionConversationStore } from '../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../run/action_history_store'
import { currentActionPromptDraft, currentActionRun, saveAndRunPopupAction } from '../run/action_popup_operations'
import { actionPopupRunDisabled } from '../run/action_popup_run_disabled'
import type { ActionRunInputStore } from '../run/action_run_input_store'
import type { ActionRunResultStore } from '../run/action_run_result_store'
import { ActionAgentPresetName } from './action_agent_preset_name'
import { useActionRunSettings } from '../shared/use_action_run_settings'

interface ActionAgentPresetNameOwnerProps {
    action: ActionDefinition
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
}

/** Owns preset-name edits at preset field boundary. */
export function ActionAgentPresetNameOwner(props: ActionAgentPresetNameOwnerProps) {
    const { action, context, conversationStore, historyStore, inputStore, resultStore, runValidationError } = props
    const { actionLabel } = useSyncExternalStore(inputStore.subscribe, inputStore.getSnapshot, inputStore.getSnapshot)
    const settings = useActionRunSettings(action, inputStore)
    const handleActionLabelChange = (event: ChangeEvent<HTMLInputElement>) => inputStore.setActionLabel(event.target.value)
    const handleRunShortcut = () => {
        const run = currentActionRun(action, context)
        const runStatus = run?.status ?? 'idle'
        const sessionActive = runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput'
        const promptDraft = currentActionPromptDraft(action, context, false)
        const runState = {
            agentActive: sessionActive && run?.activeActionType === 'agent',
            hasApprovals: !!run?.approvals.length,
            hasQuestion: !!run?.question,
            interactionReady: !!run?.interactionReady,
            runDisabledMessage: settings.runDisabledMessage,
            runStatus,
            saveDisabled: actionLabel.trim().length === 0 || sessionActive || !!settings.runDisabledMessage,
        }
        if (actionPopupRunDisabled(
            action,
            runState,
            promptDraft.getSnapshot(),
            promptDraft.getEditorSnapshot().preparationStatus,
            true,
        )) return

        void saveAndRunPopupAction({
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

    return (
        <ActionAgentPresetName
            actionLabel={actionLabel}
            onActionLabelChange={handleActionLabelChange}
            onRunShortcut={handleRunShortcut}
        />
    )
}
