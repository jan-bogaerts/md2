import { Stack } from '@mui/material'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { useActionRunSelector } from '../../../hooks/use_action_runs'
import { ActionAgentApprovals } from '../../agent/action_agent_approvals'
import { ActionAgentPromptOwner } from '../../agent/action_agent_prompt_owner'
import { ActionAgentQuestionOwner } from '../../agent/action_agent_question_owner'
import { ActionConversationChatOwner } from '../../conversation/action_conversation_chat_owner'
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
        conversationStore, historyStore, inputStore, resultStore, runValidationError, scheduleStore,
        settingsStore, usageScopeStore,
    } = runtime
    const activeActionType = useActionRunSelector(action.id, assignmentContext, (run) => run?.activeActionType ?? null)
    const visible = action.type === 'agent' || activeActionType === 'agent'

    return (
        <Stack sx={{ display: visible ? 'contents' : 'none' }}>
            <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                <ActionLogErrorOwner actionId={action.id} context={assignmentContext} resultStore={resultStore} />
                <ActionConversationChatOwner
                    actionId={action.id}
                    context={assignmentContext}
                    popupEntryId={popupEntryId}
                    store={conversationStore}
                />
                <ActionAgentPromptOwner
                    action={action}
                    context={assignmentContext}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                    inputStore={inputStore}
                    settingsStore={settingsStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    scheduleStore={scheduleStore}
                    usageScopeStore={usageScopeStore}
                />
                <ActionAgentApprovals actionId={action.id} context={assignmentContext} />
                <ActionAgentQuestionOwner actionId={action.id} context={assignmentContext} />
            </Stack>
        </Stack>
    )
}
