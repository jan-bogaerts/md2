import { Stack } from '@mui/material'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import { ActionAgentApprovals } from '../../agent/action_agent_approvals'
import { ActionPromptOwner } from '../../agent/action_prompt_owner'
import { ActionAgentQuestionOwner } from '../../agent/action_agent_question_owner'
import { ActionConversationChat } from '../../conversation/action_conversation_chat'
import { ActionLogErrorOwner } from '../../conversation/action_log_error_owner'
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
                    questionsPanel={question ? <ActionAgentQuestionOwner bindingStore={bindingStore} /> : null}
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
