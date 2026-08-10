import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { dialogService } from '../../../services/dialog_service'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentPrompt } from './action_agent_prompt'
import type { ActionConversationStore } from '../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../run/state/action_history_store'
import { currentActionPromptDraft, runPopupAction } from '../run/popup/action_popup_operations'
import { actionPopupRunDisabled } from '../run/popup/action_popup_run_disabled'
import type { ActionRunInputStore } from '../run/state/action_run_input_store'
import type { ActionRunResultStore } from '../run/state/action_run_result_store'
import type { ActionScheduleStore } from '../run/schedule/action_schedule_store'
import { defaultPreparePrompt } from '../run/popup/action_popup_defaults'
import { ActionPopupBottomRow } from '../run/popup/action_popup_bottom_row'
import type { ActionUsageScopeStore } from '../run/popup/action_usage_scope_store'
import { useActionRunSettings } from '../shared/use_action_run_settings'
import { ActionPhraseButtonsOwner } from '../editor/action_phrase_buttons_owner'

interface ActionAgentPromptOwnerProps {
    action: ActionDefinition
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    scheduleStore: ActionScheduleStore
    settingsStore: ActionRunSettingsStore
    usageScopeStore: ActionUsageScopeStore
}

function selectSessionActive(run: ActionRun | null) {
    return run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
}

/** Owns prompt draft binding, preparation, and keyboard-run behavior. */
export function ActionAgentPromptOwner(props: ActionAgentPromptOwnerProps) {
    const {
        action, context, conversationStore, historyStore, inputStore, resultStore, runValidationError,
        scheduleStore, settingsStore, usageScopeStore,
    } = props
    const sessionActive = useActionRunSelector(action.id, context, selectSessionActive)
    const activeActionType = useActionRunSelector(action.id, context, (run) => run?.activeActionType ?? null)
    const hasApprovals = useActionRunSelector(action.id, context, (run) => !!run?.approvals.length)
    const hasQuestion = useActionRunSelector(action.id, context, (run) => !!run?.question)
    const interactionReady = useActionRunSelector(action.id, context, (run) => !!run?.interactionReady)
    const runStatus = useActionRunSelector(action.id, context, (run) => run?.status ?? 'idle')
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const inputSnapshot = useSyncExternalStore(inputStore.subscribe, inputStore.getSnapshot, inputStore.getSnapshot)
    const settings = useActionRunSettings(action, settingsStore)
    const prepare = action.type === 'agent'
        && !sessionActive
        && runStatus !== 'completed'
        && conversationSnapshot.selectedConversation === null
    const promptDraft = currentActionPromptDraft(action, context, prepare)

    useEffect(() => {
        if (!prepare) return

        void promptDraft.prepare(() => defaultPreparePrompt(action, context)).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not prepare action prompt' })
        })
    }, [action, context, prepare, promptDraft])

    const handleRunShortcut = () => {
        const prompt = promptDraft.getSnapshot()
        const runState = {
            agentActive: sessionActive && activeActionType === 'agent',
            hasApprovals,
            hasQuestion,
            interactionReady,
            runDisabledMessage: settings.runDisabledMessage,
            runStatus,
        }
        if (actionPopupRunDisabled(
            action,
            runState,
            prompt,
            promptDraft.getEditorSnapshot().preparationStatus,
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
            settingsStore,
        }
        void runPopupAction(operationInput)
    }

    return (
        <ActionAgentPrompt
            bottomRow={action.type === 'agent' || activeActionType === 'agent' ? (
                <ActionPopupBottomRow
                    action={action}
                    assignmentContext={context}
                    conversationStore={conversationStore}
                    embedded
                    historyStore={historyStore}
                    inputStore={inputStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    scheduleStore={scheduleStore}
                    settingsStore={settingsStore}
                    usageScopeStore={usageScopeStore}
                />
            ) : undefined}
            convertMessage={inputSnapshot.convertMessage}
            disabled={false}
            onRunShortcut={handleRunShortcut}
            promptDraft={promptDraft}
            responsePrompts={(
                <ActionPhraseButtonsOwner
                    action={action}
                    context={context}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                    inputStore={inputStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    settingsStore={settingsStore}
                />
            )}
        />
    )
}
