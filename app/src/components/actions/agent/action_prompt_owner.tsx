import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { AgentQuestion } from '../../../data/data_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { dialogService } from '../../../services/dialog_service'
import { remoteConnectionService } from '../../../services/data/remote_connection_service'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentPrompt } from './action_agent_prompt'
import type { RestoredAgentQuestions } from './action_agent_question_owner'
import type { ActionConversationStore } from '../conversation/state/action_conversation_store'
import { pendingConversationQuestions } from '../conversation/state/action_conversation_chat_selectors'
import type { ActionHistoryStore } from '../run/state/action_history_store'
import {
    answerRestoredConversationQuestions,
    currentActionPromptDraft,
    dismissRestoredConversationQuestions,
    runPopupAction,
} from '../run/popup/action_popup_operations'
import { actionPopupRunDisabled } from '../run/popup/action_popup_run_disabled'
import type { ActionRunInputStore } from '../run/state/action_run_input_store'
import type { ActionRunResultStore } from '../run/state/action_run_result_store'
import type { ActionScheduleStore } from '../run/schedule/action_schedule_store'
import { defaultPreparePrompt } from '../run/popup/action_popup_defaults'
import { ActionPopupBottomRow } from '../run/popup/action_popup_bottom_row'
import { useActionRunSettings } from '../shared/use_action_run_settings'
import { ActionPhraseButtonsOwner } from '../editor/action_phrase_buttons_owner'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ActionPromptOwnerProps {
    action: ActionDefinition
    bindingStore: ActionRunBindingStore
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    questionsEnabled: boolean
    resultStore: ActionRunResultStore
    runValidationError: string | null
    scheduleStore: ActionScheduleStore
    settingsStore: ActionRunSettingsStore
}

function selectSessionActive(run: ActionRun | null) {
    return run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
}

/** Owns shared action-input draft binding, agent preparation, and keyboard-run behavior. */
export function ActionPromptOwner(props: ActionPromptOwnerProps) {
    const {
        action, bindingStore, context, conversationStore, historyStore, inputStore, resultStore,
        runValidationError, scheduleStore, settingsStore,
    } = props
    const boundRunId = useBoundRunId(bindingStore)
    const sessionActive = useRunSelector(boundRunId, selectSessionActive)
    const activeActionType = useRunSelector(boundRunId, (run) => run?.activeActionType ?? null)
    const interactionReady = useRunSelector(boundRunId, (run) => !!run?.interactionReady)
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? 'idle')
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const inputSnapshot = useSyncExternalStore(inputStore.subscribe, inputStore.getSnapshot, inputStore.getSnapshot)
    const remoteConnection = useSyncExternalStore(
        remoteConnectionService.subscribe,
        remoteConnectionService.getSnapshot,
        remoteConnectionService.getSnapshot,
    )
    const settings = useActionRunSettings(action, settingsStore)
    const restoredQuestions = sessionActive
        ? null
        : pendingConversationQuestions(conversationSnapshot.selectedConversation)
    const operationInput = {
        action,
        bindingStore,
        context,
        conversationStore,
        historyStore,
        inputStore,
        resultStore,
        runValidationError,
        settings,
        settingsStore,
    }
    const handleRestoredAnswer = async (questions: AgentQuestion[], answers: Record<string, string[]>) => {
        try {
            await answerRestoredConversationQuestions(operationInput, questions, answers)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not answer the agent question' })
        }
    }
    const handleRestoredDismiss = async () => {
        try {
            await dismissRestoredConversationQuestions(operationInput)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not dismiss the agent questions' })
        }
    }
    const restored: RestoredAgentQuestions | null = restoredQuestions
        ? { onAnswer: handleRestoredAnswer, onDismiss: handleRestoredDismiss, questions: restoredQuestions }
        : null
    const newConversationDraft = action.type === 'agent'
        && boundRunId === null
        && !sessionActive
        && runStatus !== 'completed'
        && conversationSnapshot.selectedConversation === null
    const prepare = newConversationDraft && !conversationSnapshot.loading
    const commandInitialValue = sessionActive && activeActionType === 'agent' ? '' : undefined
    const promptDraft = currentActionPromptDraft(action, context, bindingStore, newConversationDraft, commandInitialValue)
    const handleAttachments = useCallback(async (files: File[], insertMarkdown: (markdown: string) => void) => {
        const attachmentWorkflow = await import('../../../services/attachments/attachment_workflow')
        if (context.file) {
            await attachmentWorkflow.attachFilesToCardMarkdown(context.file, files, insertMarkdown)
            return
        }

        await attachmentWorkflow.attachFilesToOriginalMarkdown(files, insertMarkdown)
    }, [context])
    const attachmentHandler = action.type === 'agent' ? handleAttachments : undefined

    useEffect(() => {
        if (!prepare || promptDraft.hasLocalEdits()) return
        if (remoteConnection.status === 'connecting' || remoteConnection.status === 'reconnecting') return

        void promptDraft.prepare(() => defaultPreparePrompt(action, context)).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not prepare action prompt' })
        })
    }, [action, context, prepare, promptDraft, remoteConnection.status])

    const handleRunShortcut = () => {
        const prompt = promptDraft.getSnapshot()
        const runState = {
            agentActive: sessionActive && activeActionType === 'agent',
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

        void runPopupAction(operationInput)
    }

    return (
        <ActionAgentPrompt
            attachmentHandler={attachmentHandler}
            bindingStore={bindingStore}
            bottomRow={(
                <ActionPopupBottomRow
                    action={action}
                    assignmentContext={context}
                    bindingStore={bindingStore}
                    conversationStore={conversationStore}
                    embedded
                    historyStore={historyStore}
                    inputStore={inputStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    scheduleStore={scheduleStore}
                    settingsStore={settingsStore}
                />
            )}
            convertMessage={inputSnapshot.convertMessage}
            monospace={action.type === 'command'}
            onRunShortcut={handleRunShortcut}
            plainText={action.type === 'command'}
            promptDraft={promptDraft}
            questionsEnabled={props.questionsEnabled}
            restoredQuestions={restored}
            responsePrompts={action.type === 'agent' ? (
                <ActionPhraseButtonsOwner
                    action={action}
                    bindingStore={bindingStore}
                    context={context}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                    inputStore={inputStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    settingsStore={settingsStore}
                />
            ) : undefined}
        />
    )
}
