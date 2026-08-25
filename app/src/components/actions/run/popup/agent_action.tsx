import { Stack, Typography } from '@mui/material'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { ActionConversationChat } from '../../conversation/action_conversation_chat'
import { ActionScheduleOwner } from '../schedule/action_schedule_owner'
import { ActionAgentInteraction } from './action_agent_interaction'
import { ActionRunDisabledMessage } from './action_run_disabled_message'
import type { ActionPopupRuntime } from './action_popup_types'

interface AgentActionProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    baseContext: ActionContext
    popupEntryId?: string
    readOnlyMessage: string | null
    runtime: ActionPopupRuntime
}

/** Agent conversation, prompt, interaction, and scheduling content. */
export function AgentAction(props: AgentActionProps) {
    const { action, assignmentContext, baseContext, popupEntryId, readOnlyMessage, runtime } = props
    const { conversationStore, runValidationError, scheduleStore, settingsStore } = runtime

    if (readOnlyMessage) {
        return (
            <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                <ActionConversationChat
                    actionId={action.id}
                    context={assignmentContext}
                    popupEntryId={popupEntryId}
                    store={conversationStore}
                />
                <Typography color="text.secondary" role="note" variant="caption">{readOnlyMessage}</Typography>
            </Stack>
        )
    }

    return (
        <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
            <ActionAgentInteraction
                action={action}
                assignmentContext={assignmentContext}
                popupEntryId={popupEntryId}
                runtime={runtime}
            />
            <ActionScheduleOwner action={action} context={baseContext} store={scheduleStore} />
            <ActionRunDisabledMessage action={action} settingsStore={settingsStore} />
            {runValidationError ? (
                <Typography color="error.main" role="alert" variant="caption">
                    {runValidationError}
                </Typography>
            ) : null}
        </Stack>
    )
}
