import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import StopOutlined from '@mui/icons-material/StopOutlined'
import { Box, Button, IconButton, Tooltip } from '@mui/material'
import CalendarOutline from 'mdi-material-ui/CalendarOutline'
import Play from 'mdi-material-ui/Play'
import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { actionPopupRunDisabled } from './action_popup_run_disabled'
import { ActionUsageSummary } from './action_usage_summary'
import type { ActionPopupController } from './use_action_popup_controller'
import type { ActionPromptDraft } from './action_prompt_draft'

interface ActionPopupBottomRowProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    baseContext: ActionContext
    controller: ActionPopupController
    promptDraft: ActionPromptDraft
    showSaveControls: boolean
}

/** Bottom action row; only this popup section subscribes to live prompt changes. */
export function ActionPopupBottomRow(props: ActionPopupBottomRowProps) {
    const { action, assignmentContext, baseContext, controller, promptDraft, showSaveControls } = props
    const prompt = useSyncExternalStore(promptDraft.subscribe, promptDraft.getSnapshot, promptDraft.getSnapshot)
    const sessionActive = controller.runStatus === 'queued'
        || controller.runStatus === 'running'
        || controller.runStatus === 'waitingForInput'
    const showAgentSend = sessionActive ? controller.agentActive : action.type === 'agent'
    const showCommandRun = !sessionActive && action.type === 'command'
    const showUsageSummary = baseContext.kind === 'card' && !!baseContext.file
    const runDisabled = actionPopupRunDisabled(action, controller, prompt, showSaveControls)

    const handlePrimaryRun = async () => {
        const currentPrompt = promptDraft.getSnapshot()
        if (showSaveControls) await controller.handleSaveAndRun(currentPrompt)
        else await controller.handleRun(currentPrompt)
    }

    const handleSave = async () => {
        await controller.handleConvertToAction(promptDraft.getSnapshot())
    }

    return (
        <Box sx={{ alignItems: 'center', bgcolor: 'background.default', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1, px: 2, py: 1.5 }}>
            {showUsageSummary && action.type === 'agent' && assignmentContext.cardInternalId ? (
                <ActionUsageSummary
                    actionId={action.id}
                    cardInternalId={assignmentContext.cardInternalId}
                    conversations={controller.conversations}
                    history={controller.history}
                />
            ) : null}
            <Box sx={{ flex: 1 }} />
            {sessionActive ? (
                <Tooltip title="Stop">
                    <span>
                        <IconButton
                            aria-label="Stop"
                            disabled={!controller.backendAvailable}
                            onClick={controller.handleCancel}
                            size="small"
                        >
                            <StopOutlined sx={{ fontSize: 18 }} />
                        </IconButton>
                    </span>
                </Tooltip>
            ) : null}
            {controller.manualFinishAvailable ? (
                <Tooltip title="Finish">
                    <span>
                        <IconButton
                            aria-label="Finish"
                            disabled={!controller.backendAvailable || !controller.interactionReady}
                            onClick={controller.handleFinish}
                            size="small"
                        >
                            <CheckOutlined sx={{ fontSize: 18 }} />
                        </IconButton>
                    </span>
                </Tooltip>
            ) : null}
            {showSaveControls ? (
                <Button disabled={controller.saveDisabled} onClick={handleSave} size="small" variant="outlined">
                    Save
                </Button>
            ) : null}
            <Button
                disabled={sessionActive || !controller.backendAvailable}
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
            {showAgentSend ? (
                <Tooltip title="Send">
                    <span>
                        <IconButton
                            aria-label="Send"
                            color="primary"
                            disabled={runDisabled}
                            onClick={handlePrimaryRun}
                            size="small"
                        >
                            <ArrowUpwardOutlined sx={{ fontSize: 18 }} />
                        </IconButton>
                    </span>
                </Tooltip>
            ) : showCommandRun ? (
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
            ) : null}
        </Box>
    )
}
