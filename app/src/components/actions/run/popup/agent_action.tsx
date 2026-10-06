import { Box, Stack, Typography } from '@mui/material'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { ActionConversationChat } from '../../conversation/action_conversation_chat'
import { ActionScheduleOwner } from '../schedule/action_schedule_owner'
import { ActionRunHistoryOwner } from '../state/action_run_history_owner'
import { ActionPromptOwner } from '../../agent/action_prompt_owner';
import { ActionAgentApprovals } from '../../agent/action_agent_approvals';
import { ActionLogErrorOwner } from '../../conversation/errors/action_log_error_owner';
import { ActionRunStatusOwner } from '../state/action_run_status_owner';
import { ActionInputSplitter } from './action_input_splitter';
import { ActionLayoutSurface } from './action_layout_surface';
import { ActionRunDisabledMessage } from './action_run_disabled_message'
import type { ActionPopupRuntime } from './action_popup_types'

interface AgentActionProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    baseContext: ActionContext
    popupEntryId?: string
    popupVisible?: boolean
    readOnlyMessage: string | null
    runtime: ActionPopupRuntime
    showHistoricalHistory?: boolean
}

/** Agent conversation, prompt, interaction, and scheduling content. */
export function AgentAction(props: AgentActionProps) {
    const { action, assignmentContext, baseContext, popupEntryId, popupVisible, readOnlyMessage, runtime, showHistoricalHistory } = props
    const {
        agentLayoutStore, bindingStore, conversationSearchService, conversationStore, historyStore,
        inputStore, resultStore, usageValuesService,
    } = runtime;
    const { runValidationError, scheduleStore, settingsStore } = runtime

    if (readOnlyMessage) {
        return (
            <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                <ActionConversationChat
                    actionId={action.id}
                    bindingStore={bindingStore}
                    context={assignmentContext}
                    popupEntryId={popupEntryId}
                    popupVisible={popupVisible}
                    searchService={conversationSearchService}
                    store={conversationStore}
                />
                {showHistoricalHistory ? <ActionRunHistoryOwner store={historyStore} /> : null}
                <Typography color="text.secondary" role="note" variant="caption">{readOnlyMessage}</Typography>
            </Stack>
        )
    }

    return (
        <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
            <ActionScheduleOwner action={action} context={baseContext} store={scheduleStore} />
            {action.type === 'command' ? <ActionRunStatusOwner bindingStore={bindingStore} resultStore={resultStore} /> : null}
            <ActionRunDisabledMessage action={action} settingsStore={settingsStore} />
            {runValidationError ? (
                <Typography color="error.main" role="alert" variant="caption">
                    {runValidationError}
                </Typography>
            ) : null}
            <ActionLayoutSurface store={agentLayoutStore}>
                <Box data-layout-adjacent sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
                    <ActionLogErrorOwner bindingStore={bindingStore} resultStore={resultStore} />
                    <ActionConversationChat
                        actionId={action.id}
                        bindingStore={bindingStore}
                        context={assignmentContext}
                        popupEntryId={popupEntryId}
                        popupVisible={popupVisible}
                        searchService={conversationSearchService}
                        store={conversationStore}
                        usageValuesService={action.type === 'agent'
                            && (assignmentContext.kind === 'project'
                                || (assignmentContext.kind === 'card' && !!assignmentContext.file && !!assignmentContext.cardInternalId))
                            ? usageValuesService : undefined}
                    />
                </Box>
                <ActionInputSplitter store={agentLayoutStore} />
                <ActionPromptOwner
                    action={action}
                    bindingStore={bindingStore}
                    context={assignmentContext}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                    inputStore={inputStore}
                    layoutStore={agentLayoutStore}
                    questionsEnabled
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    scheduleStore={scheduleStore}
                    settingsStore={settingsStore}
                />
            </ActionLayoutSurface>
            <ActionAgentApprovals bindingStore={bindingStore} />
            {showHistoricalHistory || action.type === 'command' ? (
                <Box sx={{ flexShrink: 1, minHeight: 0, overflowY: 'auto' }}><ActionRunHistoryOwner store={historyStore} /></Box>
            ) : null}
        </Stack>
    )
}
