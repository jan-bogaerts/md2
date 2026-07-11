import { Box, Button, Divider, IconButton, Stack, Typography } from '@mui/material'
import CalendarOutline from 'mdi-material-ui/CalendarOutline'
import Close from 'mdi-material-ui/Close'
import Play from 'mdi-material-ui/Play'
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
import { ActionSelector } from './action_selector'
import { useActionPopupController } from './use_action_popup_controller'

interface ActionPopupProps {
    action: ActionDefinition
    actions?: ActionDefinition[]
    anchorElement: HTMLElement | null
    context: ActionContext
    /** Open a new popup for a related (`before`/`after`) action with the same context. */
    onNavigate: (action: ActionDefinition) => void
    onAddAction?: () => void
    onClose: () => void
    onSelectAction?: (action: ActionDefinition) => void
    showSaveControls?: boolean
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
    const { action, actions, anchorElement, onAddAction, onClose, onNavigate, onSelectAction, showSaveControls = false } = props
    const controller = useActionPopupController(props)
    const titleId = useId()
    const isCardRunDialog = !!actions && !!onAddAction && !!onSelectAction

    if (isCardRunDialog) {
        const handlePrimaryRun = showSaveControls ? controller.handleSaveAndRun : controller.handleRun
        const runDisabled = controller.runStatus === 'running' || (showSaveControls && controller.saveDisabled)

        return (
            <ResizablePopover
                anchorElement={anchorElement}
                initialSize={{ height: 450, width: 400 }}
                labelId={titleId}
                onClose={onClose}
                open={!!anchorElement}
                paperSx={{
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: '14px',
                    boxShadow: '0 24px 60px rgba(16,24,40,0.28)',
                    flexDirection: 'column',
                }}
                resizeLabel="Resize action popup"
            >
                <Typography
                    id={titleId}
                    sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
                >
                    Run actions
                </Typography>
                <Box sx={{ alignItems: 'flex-start', borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1, px: 1.5, py: 1.5 }}>
                    <ActionSelector
                        adding={showSaveControls}
                        actions={actions}
                        onAdd={onAddAction}
                        onSelect={onSelectAction}
                        selectedAction={action}
                    />
                    <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ flexShrink: 0, height: 30, width: 30 }}>
                        <Close sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
                <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2.5, py: 2.25 }}>
                    {action.description ? (
                        <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.5 }}>
                            {action.description}
                        </Typography>
                    ) : null}
                    {action.type === 'agent' ? (
                        <ActionAgentForm
                            actionLabel={controller.actionLabel}
                            agent={controller.agent}
                            agentProfiles={controller.agentProfiles}
                            compact
                            convertMessage={controller.convertMessage}
                            extraPrompt={controller.extraPrompt}
                            model={controller.model}
                            onActionLabelChange={controller.handleActionLabelChange}
                            onAgentChange={controller.handleAgentChange}
                            onConvertToAction={controller.handleConvertToAction}
                            onExtraPromptChange={controller.handleExtraPromptChange}
                            onModelChange={controller.handleModelChange}
                            onRunShortcut={runDisabled ? undefined : handlePrimaryRun}
                            onSaveAndRun={controller.handleSaveAndRun}
                            saveDisabled={controller.saveDisabled}
                            selectedAgentModels={controller.selectedAgentModels}
                            showSaveControls={showSaveControls}
                        />
                    ) : null}
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
                    {controller.runStatus !== 'idle' ? (
                        <ActionRunStatus
                            color={statusColor(controller.runStatus)}
                            result={controller.runResult}
                            status={controller.runStatus}
                        />
                    ) : null}
                    <ActionRunHistory compact entries={controller.history} error={controller.historyError} />
                    <RelatedActions actions={action.before} label="Before" onNavigate={onNavigate} />
                    <RelatedActions actions={action.after} label="After" onNavigate={onNavigate} />
                </Stack>
                <Box sx={{ alignItems: 'center', bgcolor: 'background.default', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1, px: 2, py: 1.5 }}>
                    <Button
                        onClick={onClose}
                        size="small"
                        sx={{
                            bgcolor: 'background.paper',
                            borderColor: 'divider',
                            color: 'text.secondary',
                            height: 34,
                            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                        }}
                        variant="outlined"
                    >
                        Close
                    </Button>
                    <Box sx={{ flex: 1 }} />
                    <Button
                        disabled={controller.runStatus === 'running'}
                        onClick={controller.handleToggleSchedule}
                        size="small"
                        startIcon={<CalendarOutline sx={{ fontSize: '14px !important' }} />}
                        sx={{
                            bgcolor: 'background.paper',
                            borderColor: 'divider',
                            color: 'text.secondary',
                            height: 34,
                            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                        }}
                        variant="outlined"
                    >
                        Schedule
                    </Button>
                    <Button
                        disabled={runDisabled}
                        onClick={handlePrimaryRun}
                        size="small"
                        startIcon={<Play sx={{ fontSize: '13px !important' }} />}
                        sx={{ height: 34, px: 2 }}
                        variant="contained"
                    >
                        Run
                    </Button>
                </Box>
            </ResizablePopover>
        )
    }

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
                        onSaveAndRun={controller.handleSaveAndRun}
                        saveDisabled={controller.saveDisabled}
                        selectedAgentModels={controller.selectedAgentModels}
                        showSaveControls={showSaveControls}
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
