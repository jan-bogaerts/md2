import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import StopOutlined from '@mui/icons-material/StopOutlined'
import { Box, Button, IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material'
import CalendarOutline from 'mdi-material-ui/CalendarOutline'
import Play from 'mdi-material-ui/Play'
import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import {
    isBrowsingHistoricalConversation,
    type ActionConversationStore,
} from '../../conversation/action_conversation_store'
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
import { useActionRunSettings } from '../../shared/use_action_run_settings'
import { ActionPopupFinishButton } from './action_popup_finish_button'
import { ActionAgentSelectors } from '../../agent/action_agent_selectors'
import { MarkdownAttachmentControl } from '../../../editor/markdown_attachment_control'
import {
    attachFilesToCardMarkdown,
    attachFilesToOriginalMarkdown,
} from '../../../../services/attachments/attachment_workflow'
import { dialogService } from '../../../../services/dialog_service'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'

interface ActionPopupBottomRowProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    bindingStore: ActionRunBindingStore
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    /** Embedded inside idle input surfaces; standalone while a command run is active. */
    embedded?: boolean
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    scheduleStore: ActionScheduleStore
    settingsStore: ActionRunSettingsStore
}

/** Agent settings and run controls for the popup footer. */
export function ActionPopupBottomRow(props: ActionPopupBottomRowProps) {
    const {
        action, assignmentContext, bindingStore, conversationStore, embedded = false, historyStore, inputStore, resultStore,
        runValidationError, scheduleStore, settingsStore,
    } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const settings = useActionRunSettings(action, settingsStore)
    const boundRunId = useBoundRunId(bindingStore)
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? 'idle')
    const agentActive = useRunSelector(boundRunId, (run) => {
        const active = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'

        return !!active && run?.activeActionType === 'agent'
    })
    const interactionReady = useRunSelector(boundRunId, (run) => !!run?.interactionReady)
    const liveConversationId = useRunSelector(boundRunId, (run) => run?.conversation?.id ?? null)
    const promptDraft = currentActionPromptDraft(action, assignmentContext, bindingStore, false, agentActive ? '' : undefined)
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
    const browsingHistory = isBrowsingHistoricalConversation(
        liveConversationId ? { id: liveConversationId } : null,
        conversationSnapshot.selectedConversation,
        sessionActive,
    )
    const orphanWaiting = !sessionActive && conversationSnapshot.selectedConversation?.status === 'waitingForInput'
    const running = runStatus === 'queued' || runStatus === 'running'
    const waitingForAgentInput = (runStatus === 'waitingForInput' && agentActive) || orphanWaiting
    const promptHasText = prompt.trim().length > 0
    const hasDisplayedConversation = !!liveConversationId || !!conversationSnapshot.selectedConversation
    const showStop = running || (runStatus === 'waitingForInput' && !agentActive)
    const showFinish = waitingForAgentInput
    const showSchedule = (!sessionActive && !orphanWaiting) || (waitingForAgentInput && promptHasText)
    const showAgentSend = (!sessionActive && !orphanWaiting && action.type === 'agent')
        || (waitingForAgentInput && promptHasText)
        || (agentActive && interactionReady && promptHasText)
    const showCommandRun = !orphanWaiting && !hasDisplayedConversation && action.type === 'command'
    const showStopControl = showStop && !showAgentSend
    const runState = {
        agentActive,
        interactionReady,
        runDisabledMessage: settings.runDisabledMessage,
        runStatus,
    }
    const runDisabled = browsingHistory || actionPopupRunDisabled(
        action,
        runState,
        prompt,
        editorSnapshot.preparationStatus,
    )
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
    const attachmentCopyTarget = assignmentContext.file

    const handleAttachmentFiles = (files: File[]) => {
        const operation = attachmentCopyTarget
            ? attachFilesToCardMarkdown(attachmentCopyTarget, files, promptDraft.requestInsertion)
            : attachFilesToOriginalMarkdown(files, promptDraft.requestInsertion)
        void operation.catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Files could not be attached' })
        })
    }
    const handlePrimaryRun = async () => {
        if (browsingHistory) return

        promptDraft.requestFlush()
        await runPopupAction(operationInput)
    }
    const handleCancel = () => {
        if (browsingHistory) return

        void cancelPopupAction(action, bindingStore, assignmentContext, conversationStore)
    }
    const handleFinish = () => {
        if (browsingHistory) return

        void finishPopupAction(action, bindingStore, assignmentContext, conversationStore)
    }
    const handleToggleSchedule = () => scheduleStore.toggle()

    return (
        <Box
            data-testid="action-popup-bottom-row"
            data-embedded={embedded ? 'true' : undefined}
            sx={{
                bgcolor: embedded ? 'background.paper' : 'background.default', borderColor: 'divider',
                containerType: 'inline-size', flexShrink: 0, px: embedded ? 1 : 2,
                pb: embedded ? 1 : 1.5, pt: embedded ? 0 : 1.5,
            }}
        >
            <Box
                data-footer-layout
                sx={{
                    alignItems: 'center', display: 'flex', gap: 1, justifyContent: 'space-between', minWidth: 0, width: '100%',
                    '@container (max-width: 420px)': { '& [data-footer-selectors]': { minWidth: 0 } },
                }}
            >
                {action.type === 'agent' && !isMobile ? (
                    <MarkdownAttachmentControl
                        disabled={editorSnapshot.preparationStatus !== 'ready'}
                        onFiles={handleAttachmentFiles}
                    />
                ) : null}
                <Box data-footer-selectors sx={{ flexShrink: 1, minWidth: 158, overflow: 'hidden' }}>
                    {action.type === 'agent' ? (
                        <ActionAgentSelectors action={action} bindingStore={bindingStore} settingsStore={settingsStore} />
                    ) : null}
                </Box>
                <Box
                    data-footer-controls
                    sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 1, justifyContent: 'flex-end', minWidth: 64 }}
                >
                    {showFinish ? (
                        <ActionPopupFinishButton
                            disabled={browsingHistory || !settings.backendAvailable || (sessionActive && !interactionReady)}
                            onFinish={handleFinish}
                            onStop={handleCancel}
                        />
                    ) : null}
                    {showSchedule ? (
                        <Tooltip title="Schedule">
                            <span>
                                <IconButton
                                    aria-label="Schedule"
                                    disabled={!settings.backendAvailable}
                                    onClick={handleToggleSchedule}
                                    size="small"
                                >
                                    <CalendarOutline sx={{ fontSize: 18 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    ) : null}
                    {showStopControl ? (
                        <Tooltip title="Stop">
                            <span>
                                <IconButton
                                    aria-label="Stop"
                                    disabled={browsingHistory || !settings.backendAvailable}
                                    onClick={handleCancel}
                                    size="small"
                                >
                                    <StopOutlined sx={{ fontSize: 18 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    ) : null}
                    {showAgentSend ? (
                        <Tooltip title="Send. Ctrl+Enter.">
                            <span>
                                <IconButton aria-label="Send" color="primary" disabled={runDisabled} onClick={handlePrimaryRun} size="small">
                                    <ArrowUpwardOutlined sx={{ fontSize: 18 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    ) : showCommandRun ? (
                        <Tooltip title="Run">
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
                        </Tooltip>
                    ) : null}
                </Box>
            </Box>
        </Box>
    )
}
