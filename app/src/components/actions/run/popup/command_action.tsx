import { Stack, Typography } from '@mui/material'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import { ActionScheduleOwner } from '../schedule/action_schedule_owner'
import { ActionRunHistoryOwner } from '../state/action_run_history_owner'
import { ActionRunStatusOwner } from '../state/action_run_status_owner'
import { ActionPromptOwner } from '../../agent/action_prompt_owner'
import { ActionAgentInteraction } from './action_agent_interaction'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
import type { ActionPopupRuntime } from './action_popup_types'
import { ActionRunDisabledMessage } from './action_run_disabled_message'

interface CommandActionProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    baseContext: ActionContext
    readOnlyMessage: string | null
    runtime: ActionPopupRuntime
}

/** Command status, history, scheduling, and run controls. */
export function CommandAction(props: CommandActionProps) {
    const { action, assignmentContext, baseContext, readOnlyMessage, runtime } = props
    const {
        bindingStore, conversationStore, historyStore, inputStore, resultStore, runValidationError, scheduleStore,
        settingsStore,
    } = runtime
    const boundRunId = useBoundRunId(bindingStore)
    const activeActionType = useRunSelector(boundRunId, (run) => run?.activeActionType ?? null)
    const sessionActive = useRunSelector(boundRunId, (run) => run?.status === 'queued'
        || run?.status === 'running'
        || run?.status === 'waitingForInput')
    const showBottomRow = sessionActive && activeActionType !== 'agent'

    if (readOnlyMessage) {
        return (
            <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                <Typography color="text.secondary" role="note" variant="caption">{readOnlyMessage}</Typography>
            </Stack>
        )
    }

    return (
        <>
            <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                <ActionAgentInteraction action={action} assignmentContext={assignmentContext} runtime={runtime} />
                {!sessionActive ? (
                    <ActionPromptOwner
                        action={action}
                        bindingStore={bindingStore}
                        context={assignmentContext}
                        conversationStore={conversationStore}
                        historyStore={historyStore}
                        inputStore={inputStore}
                        resultStore={resultStore}
                        runValidationError={runValidationError}
                        scheduleStore={scheduleStore}
                        settingsStore={settingsStore}
                    />
                ) : null}
                <ActionScheduleOwner action={action} context={baseContext} store={scheduleStore} />
                <ActionRunStatusOwner bindingStore={bindingStore} resultStore={resultStore} />
                <ActionRunDisabledMessage action={action} settingsStore={settingsStore} />
                {runValidationError ? (
                    <Typography color="error.main" role="alert" variant="caption">
                        {runValidationError}
                    </Typography>
                ) : null}
                <ActionRunHistoryOwner store={historyStore} />
            </Stack>
            {showBottomRow ? (
                <ActionPopupBottomRow
                    action={action}
                    assignmentContext={assignmentContext}
                    bindingStore={bindingStore}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                    inputStore={inputStore}
                    settingsStore={settingsStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    scheduleStore={scheduleStore}
                />
            ) : null}
        </>
    )
}
