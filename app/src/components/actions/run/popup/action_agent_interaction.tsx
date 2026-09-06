import { Stack } from '@mui/material'
import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import type { AgentQuestion } from '../../../../data/data_types'
import { dialogService } from '../../../../services/dialog_service'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import { ActionAgentApprovals } from '../../agent/action_agent_approvals'
import { ActionPromptOwner } from '../../agent/action_prompt_owner'
import { ActionAgentQuestionOwner } from '../../agent/action_agent_question_owner'
import { ActionConversationChat } from '../../conversation/action_conversation_chat'
import { pendingConversationQuestions } from '../../conversation/action_conversation_chat_selectors'
import { ActionLogErrorOwner } from '../../conversation/action_log_error_owner'
import { useActionRunSettings } from '../../shared/use_action_run_settings'
import {
    answerRestoredConversationQuestions,
    dismissRestoredConversationQuestions,
} from './action_popup_operations'
import type { ActionPopupRuntime } from './action_popup_types'

interface ActionAgentInteractionProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    popupEntryId?: string
    runtime: ActionPopupRuntime
}

/** Agent interaction surface, including agent children started by command actions. */
export function ActionAgentInteraction(props: ActionAgentInteractionProps) {
    const { action, assignmentContext, popupEntryId, runtime } = props
    const {
        bindingStore, conversationStore, historyStore, inputStore, resultStore, runValidationError, scheduleStore,
        settingsStore, usageValuesService,
    } = runtime
    const boundRunId = useBoundRunId(bindingStore)
    const activeActionType = useRunSelector(boundRunId, (run) => run?.activeActionType ?? null)
    const question = useRunSelector(boundRunId, (run) => run?.question ?? null)
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? 'idle')
    const settings = useActionRunSettings(action, settingsStore)
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const sessionActive = runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput'
    const restoredQuestions = question || sessionActive
        ? null
        : pendingConversationQuestions(conversationSnapshot.selectedConversation)
    const operationInput = {
        action,
        bindingStore,
        context: assignmentContext,
        conversationStore,
        historyStore,
        inputStore,
        resultStore,
        runValidationError,
        settings,
        settingsStore,
    }
    const restored = restoredQuestions
        ? {
            onAnswer: async (questions: AgentQuestion[], answers: Record<string, string[]>) => {
                try {
                    await answerRestoredConversationQuestions(operationInput, questions, answers)
                } catch (error) {
                    dialogService.error(error, { fallbackMessage: 'Could not answer the agent question' })
                }
            },
            onDismiss: async () => {
                try {
                    await dismissRestoredConversationQuestions(operationInput)
                } catch (error) {
                    dialogService.error(error, { fallbackMessage: 'Could not dismiss the agent questions' })
                }
            },
            questions: restoredQuestions,
        }
        : null
    const visible = action.type === 'agent' || activeActionType === 'agent'
    const displayedUsageValuesService = action.type === 'agent'
        && assignmentContext.kind === 'card'
        && !!assignmentContext.file
        && !!assignmentContext.cardInternalId
        ? usageValuesService
        : undefined

    if (!visible) return null

    return (
        <Stack sx={{ display: 'contents' }}>
            <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                <ActionLogErrorOwner bindingStore={bindingStore} resultStore={resultStore} />
                <ActionConversationChat
                    actionId={action.id}
                    bindingStore={bindingStore}
                    context={assignmentContext}
                    popupEntryId={popupEntryId}
                    store={conversationStore}
                    usageValuesService={displayedUsageValuesService}
                />
                <ActionPromptOwner
                    action={action}
                    bindingStore={bindingStore}
                    context={assignmentContext}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                    inputStore={inputStore}
                    questionsPanel={question || restored
                        ? <ActionAgentQuestionOwner bindingStore={bindingStore} restored={restored} />
                        : null}
                    settingsStore={settingsStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    scheduleStore={scheduleStore}
                />
                <ActionAgentApprovals bindingStore={bindingStore} />
            </Stack>
        </Stack>
    )
}
