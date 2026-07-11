import { Box, Button, Divider, Stack, Typography } from '@mui/material'
import { useId } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { ResizablePopover } from '../resizable_popover'
import {
    statusColor,
    type ConvertPromptToAction,
    type LoadHistory,
    type RunAction,
    type ScheduleAction,
} from './action_popup_defaults'
import { RelatedActions } from './action_related_actions'
import { ActionRunHistory } from './action_run_history'
import { ActionRunStatus } from './action_run_status'
import { ActionScheduleForm } from './action_schedule_form'
import { ActionAgentForm } from './action_agent_form'
import { useActionPopupController } from './use_action_popup_controller'

interface ActionPopupProps {
    action: ActionDefinition
    anchorElement: HTMLElement | null
    context: ActionContext
    /** Open a new popup for a related (`before`/`after`) action with the same context. */
    onNavigate: (action: ActionDefinition) => void
    onClose: () => void
    convertPromptToAction?: ConvertPromptToAction
    loadHistory?: LoadHistory
    runAction?: RunAction
    scheduleAction?: ScheduleAction
}

/**
 * The execution surface for a selected action and context: a resizable popup with
 * a `Run` command and shortcuts to the action's `before` and `after` actions.
 */
export function ActionPopup(props: ActionPopupProps) {
    const { action, anchorElement, onClose, onNavigate } = props
    const controller = useActionPopupController(props)
    const titleId = useId()

    return (
        <ResizablePopover
            anchorElement={anchorElement}
            initialSize={{ height: 320, width: 420 }}
            labelId={titleId}
            onClose={onClose}
            open={!!anchorElement}
            resizeLabel="Resize action popup"
        >
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
                <Box>
                    <Typography id={titleId} variant="h6">{action.label}</Typography>
                    {action.description ? (
                        <Typography color="text.secondary" variant="body2">
                            {action.description}
                        </Typography>
                    ) : null}
                </Box>

                <Stack direction="row" spacing={1}>
                    <Button disabled={controller.runStatus === 'running'} onClick={controller.handleToggleSchedule} variant="outlined">
                        Schedule
                    </Button>
                    <Button disabled={controller.runStatus === 'running'} onClick={controller.handleRun} variant="contained">
                        Run
                    </Button>
                    <Button onClick={onClose}>Close</Button>
                </Stack>

                {controller.scheduleOpen ? (
                    <ActionScheduleForm
                        afterActionName={controller.scheduleAfterActionName}
                        message={controller.scheduleMessage}
                        onAfterActionNameChange={controller.handleScheduleAfterActionNameChange}
                        onRegister={controller.handleScheduleAction}
                        onTimestampChange={controller.handleScheduleTimestampChange}
                        onTriggerTypeChange={controller.handleScheduleTriggerTypeChange}
                        timestamp={controller.scheduleTimestamp}
                        triggerType={controller.scheduleTriggerType}
                    />
                ) : null}

                {action.type === 'agent' ? (
                    <ActionAgentForm
                        actionLabel={controller.actionLabel}
                        agent={controller.agent}
                        agentProfiles={controller.agentProfiles}
                        convertMessage={controller.convertMessage}
                        extraPrompt={controller.extraPrompt}
                        model={controller.model}
                        onActionLabelChange={controller.handleActionLabelChange}
                        onAgentChange={controller.handleAgentChange}
                        onConvertToAction={controller.handleConvertToAction}
                        onExtraPromptChange={controller.handleExtraPromptChange}
                        onModelChange={controller.handleModelChange}
                        selectedAgentModels={controller.selectedAgentModels}
                    />
                ) : null}

                {controller.runStatus !== 'idle' ? (
                    <ActionRunStatus
                        color={statusColor(controller.runStatus)}
                        result={controller.runResult}
                        status={controller.runStatus}
                    />
                ) : null}

                <Divider />

                <ActionRunHistory entries={controller.history} error={controller.historyError} />

                <RelatedActions actions={action.before} label="Before" onNavigate={onNavigate} />
                <RelatedActions actions={action.after} label="After" onNavigate={onNavigate} />
            </Stack>
        </ResizablePopover>
    )
}
