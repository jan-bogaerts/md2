import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { dialogService } from '../../services/dialog_service'
import { useActionRun } from '../hooks/use_action_runs'
import { ActionAgentPrompt } from './action_agent_prompt'
import type { ActionConversationStore } from './action_conversation_store'
import type { ActionHistoryStore } from './action_history_store'
import { currentActionPromptDraft, runPopupAction, saveAndRunPopupAction } from './action_popup_operations'
import { actionPopupRunDisabled } from './action_popup_run_disabled'
import type { ActionRunInputStore } from './action_run_input_store'
import type { ActionRunResultStore } from './action_run_result_store'
import { defaultPreparePrompt } from './action_popup_defaults'
import { useActionRunSettings } from './use_action_run_settings'

interface ActionAgentPromptOwnerProps {
    action: ActionDefinition
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    showSaveControls: boolean
}

/** Owns prompt draft binding, preparation, and keyboard-run behavior. */
export function ActionAgentPromptOwner(props: ActionAgentPromptOwnerProps) {
    const { action, context, conversationStore, historyStore, inputStore, resultStore, runValidationError, showSaveControls } = props
    const run = useActionRun(action.id, context)
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const settings = useActionRunSettings(action, inputStore)
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    const prepare = action.type === 'agent'
        && !sessionActive
        && conversationSnapshot.selectedConversation?.status !== 'waitingForInput'
    const promptDraft = currentActionPromptDraft(action, context, prepare)

    useEffect(() => {
        if (!prepare) return

        void promptDraft.prepare(() => defaultPreparePrompt(action, context)).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not prepare action prompt' })
        })
    }, [action, context, prepare, promptDraft])

    const handleRunShortcut = () => {
        const prompt = promptDraft.getSnapshot()
        const saveDisabled = settings.actionLabel.trim().length === 0 || sessionActive || !!settings.runDisabledMessage
        const runState = {
            agentActive: !!sessionActive && run?.activeActionType === 'agent',
            hasApprovals: !!run?.approvals.length,
            hasQuestion: !!run?.question,
            interactionReady: !!run?.interactionReady,
            runDisabledMessage: settings.runDisabledMessage,
            runStatus: run?.status ?? 'idle',
            saveDisabled,
        }
        if (actionPopupRunDisabled(
            action,
            runState,
            prompt,
            promptDraft.getEditorSnapshot().preparationStatus,
            showSaveControls,
        )) return

        const operationInput = {
            action,
            context,
            conversationStore,
            historyStore,
            inputStore,
            resultStore,
            runValidationError,
            settings,
        }
        if (showSaveControls) void saveAndRunPopupAction(operationInput)
        else void runPopupAction(operationInput)
    }

    return (
        <ActionAgentPrompt
            convertMessage={settings.convertMessage}
            disabled={false}
            onRunShortcut={handleRunShortcut}
            promptDraft={promptDraft}
        />
    )
}
