import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import StopOutlined from '@mui/icons-material/StopOutlined'
import { Box, Button, IconButton, Tooltip } from '@mui/material'
import CalendarOutline from 'mdi-material-ui/CalendarOutline'
import Play from 'mdi-material-ui/Play'
import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service'
import { useActionRunSelector } from '../../../hooks/use_action_runs'
import type { ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import {
    cancelPopupAction,
    currentActionPromptDraft,
    finishPopupAction,
    runPopupAction,
} from './action_popup_operations'
import { actionPopupRunDisabled } from './action_popup_run_disabled'
import type { ActionRunInputStore } from '../state/action_run_input_store'
import type { ActionRunResultStore } from '../state/action_run_result_store'
import type { ActionScheduleStore } from '../schedule/action_schedule_store'
import { ActionUsageSummaryOwner } from './action_usage_summary_owner'
import { useActionRunSettings } from '../../shared/use_action_run_settings'

interface ActionPopupBottomRowProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    scheduleStore: ActionScheduleStore
    settingsStore: ActionRunSettingsStore
}

/** Run controls; subscribes only to run and prompt values used by this row. */
export function ActionPopupBottomRow(props: ActionPopupBottomRowProps) {
    const {
        action, assignmentContext, conversationStore, historyStore, inputStore, resultStore,
        runValidationError, scheduleStore, settingsStore,
    } = props
    const settings = useActionRunSettings(action, settingsStore)
    const runStatus = useActionRunSelector(action.id, assignmentContext, (run) => run?.status ?? 'idle')
    const agentActive = useActionRunSelector(action.id, assignmentContext, (run) => {
        const active = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'

        return !!active && run?.activeActionType === 'agent'
    })
    const interactionReady = useActionRunSelector(action.id, assignmentContext, (run) => !!run?.interactionReady)
    const manualFinishAvailable = useActionRunSelector(
        action.id,
        assignmentContext,
        (run) => run?.activeActionType === 'agent' && !!run.activeActionStreaming && !run.activeActionAutoFinish,
    )
    const hasApprovals = useActionRunSelector(action.id, assignmentContext, (run) => !!run?.approvals.length)
    const hasQuestion = useActionRunSelector(action.id, assignmentContext, (run) => !!run?.question)
    const promptDraft = currentActionPromptDraft(action, assignmentContext, action.type === 'agent')
    const prompt = useSyncExternalStore(promptDraft.subscribe, promptDraft.getSnapshot, promptDraft.getSnapshot)
    const editorSnapshot = useSyncExternalStore(
        promptDraft.subscribeEditor,
        promptDraft.getEditorSnapshot,
        promptDraft.getEditorSnapshot,
    )
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const sessionActive = runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput'
    const orphanWaiting = !sessionActive && conversationSnapshot.selectedConversation?.status === 'waitingForInput'
    const showAgentSend = sessionActive ? agentActive : action.type === 'agent'
    const showCommandRun = !sessionActive && action.type === 'command'
    const runState = {
        agentActive,
        hasApprovals,
        hasQuestion,
        interactionReady,
        runDisabledMessage: settings.runDisabledMessage,
        runStatus,
    }
    const runDisabled = actionPopupRunDisabled(
        action,
        runState,
        prompt,
        editorSnapshot.preparationStatus,
    )
    const operationInput = {
        action,
        context: assignmentContext,
        conversationStore,
        historyStore,
        inputStore,
        resultStore,
        runValidationError,
        settings,
        settingsStore,
    }

    const handlePrimaryRun = async () => {
        await runPopupAction(operationInput)
    }
    const handleCancel = () => void cancelPopupAction(action, assignmentContext, conversationStore)
    const handleFinish = () => void finishPopupAction(action, assignmentContext, conversationStore)
    const handleToggleSchedule = () => scheduleStore.toggle()

    return (
        <Box sx={{ alignItems: 'center', bgcolor: 'background.default', borderTop: 1, borderColor: 'divider', display: 'flex', flexShrink: 0, gap: 1, px: 2, py: 1.5 }}>
            <ActionUsageSummaryOwner
                action={action}
                context={assignmentContext}
                conversationStore={conversationStore}
                historyStore={historyStore}
            />
            <Box sx={{ flex: 1 }} />
            {sessionActive || orphanWaiting ? (
                <Tooltip title="Stop">
                    <span>
                        <IconButton aria-label="Stop" disabled={!settings.backendAvailable} onClick={handleCancel} size="small">
                            <StopOutlined sx={{ fontSize: 18 }} />
                        </IconButton>
                    </span>
                </Tooltip>
            ) : null}
            {manualFinishAvailable || orphanWaiting ? (
                <Tooltip title="Finish">
                    <span>
                        <IconButton
                            aria-label="Finish"
                            disabled={!settings.backendAvailable || (sessionActive && !interactionReady)}
                            onClick={handleFinish}
                            size="small"
                        >
                            <CheckOutlined sx={{ fontSize: 18 }} />
                        </IconButton>
                    </span>
                </Tooltip>
            ) : null}
            <Button
                disabled={sessionActive || !settings.backendAvailable}
                onClick={handleToggleSchedule}
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
                        <IconButton aria-label="Send" color="primary" disabled={runDisabled} onClick={handlePrimaryRun} size="small">
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
