import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import StopOutlined from '@mui/icons-material/StopOutlined';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import CalendarOutline from 'mdi-material-ui/CalendarOutline';
import Play from 'mdi-material-ui/Play';
import { useEffect, useSyncExternalStore, type MouseEvent } from 'react';
import type { ActionContext } from '../../../../data/action_context';
import type { ActionDefinition } from '../../../../data/action_types';
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service';
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs';
import { usePendingActionScheduleForCardAndAction } from '../../../hooks/use_pending_action_schedule';
import {
    isBrowsingHistoricalConversation,
    type ActionConversationStore,
} from '../../conversation/state/action_conversation_store';
import type { ActionHistoryStore } from '../state/action_history_store';
import {
    cancelPopupAction,
    currentActionPromptDraft,
    finishPopupAction,
    runPopupAction,
} from './action_popup_operations';
import { actionPopupRunDisabled } from './action_popup_run_disabled';
import type { ActionRunInputStore } from '../state/action_run_input_store';
import type { ActionRunResultStore } from '../state/action_run_result_store';
import type { ActionScheduleStore } from '../schedule/action_schedule_store';
import { useActionRunSettings } from '../../shared/use_action_run_settings';
import { ActionPopupFinishButton } from './action_popup_finish_button';
import type { ActionRunBindingStore } from '../state/action_run_binding_store';

interface ActionPopupRunControlsProps {
    action: ActionDefinition;
    assignmentContext: ActionContext;
    bindingStore: ActionRunBindingStore;
    conversationStore: ActionConversationStore;
    historyStore: ActionHistoryStore;
    inputStore: ActionRunInputStore;
    resultStore: ActionRunResultStore;
    runValidationError: string | null;
    scheduleStore: ActionScheduleStore;
    settingsStore: ActionRunSettingsStore;
}

/** Owns prompt readiness, run operations, and scheduling controls at their rendering boundary. */
export function ActionPopupRunControls(props: ActionPopupRunControlsProps) {
    const {
        action, assignmentContext, bindingStore, conversationStore, historyStore, inputStore, resultStore,
        runValidationError, scheduleStore, settingsStore,
    } = props;
    const settings = useActionRunSettings(action, settingsStore);
    const scheduled = usePendingActionScheduleForCardAndAction(assignmentContext.cardInternalId, action.id);
    const boundRunId = useBoundRunId(bindingStore);
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? 'idle');
    const agentActive = useRunSelector(boundRunId, (run) => {
        const active = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput';

        return !!active && run?.activeActionType === 'agent';
    });
    const interactionReady = useRunSelector(boundRunId, (run) => !!run?.interactionReady);
    const liveConversationId = useRunSelector(boundRunId, (run) => run?.conversation?.id ?? null);
    const promptDraft = currentActionPromptDraft(
        action, assignmentContext, bindingStore, conversationStore, false, agentActive ? '' : undefined,
    );
    const promptEmpty = useSyncExternalStore(promptDraft.subscribe, promptDraft.getEmptySnapshot, promptDraft.getEmptySnapshot);
    const editorSnapshot = useSyncExternalStore(
        promptDraft.subscribeEditor,
        promptDraft.getEditorSnapshot,
        promptDraft.getEditorSnapshot,
    );
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    );
    const scheduleOpen = useSyncExternalStore(
        scheduleStore.subscribe,
        scheduleStore.getOpenSnapshot,
        scheduleStore.getOpenSnapshot,
    );
    const sessionActive = runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput';
    const browsingHistory = isBrowsingHistoricalConversation(
        liveConversationId ? { id: liveConversationId } : null,
        conversationSnapshot.selectedConversation,
        sessionActive,
    );
    const orphanWaiting = !sessionActive && conversationSnapshot.selectedConversation?.status === 'waitingForInput';
    const running = runStatus === 'queued' || runStatus === 'running';
    const waitingForAgentInput = (runStatus === 'waitingForInput' && agentActive) || orphanWaiting;
    const promptHasText = !promptEmpty;
    const hasDisplayedConversation = !!liveConversationId || !!conversationSnapshot.selectedConversation;
    const showStop = running || (runStatus === 'waitingForInput' && !agentActive);
    const showFinish = waitingForAgentInput;
    const showSchedule = (!sessionActive && !orphanWaiting) || (waitingForAgentInput && promptHasText);
    const scheduleAvailable = showSchedule && settings.backendAvailable;
    const showAgentSend = (!sessionActive && !orphanWaiting && action.type === 'agent')
        || (waitingForAgentInput && promptHasText)
        || (agentActive && interactionReady && promptHasText);
    const showCommandRun = !orphanWaiting && !hasDisplayedConversation && action.type === 'command';
    const showStopControl = showStop && !showAgentSend;
    const runState = {
        agentActive,
        interactionReady,
        runDisabledMessage: settings.runDisabledMessage,
        runStatus,
    };
    const runDisabled = browsingHistory || actionPopupRunDisabled(
        action,
        runState,
        promptDraft.getSnapshot(),
        editorSnapshot.preparationStatus,
    );
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
    };
    const handlePrimaryRun = async () => {
        if (browsingHistory) return;

        promptDraft.requestFlush();
        await runPopupAction(operationInput);
    };
    const handleCancel = () => {
        if (browsingHistory) return;

        void cancelPopupAction(bindingStore, conversationStore);
    };
    const handleFinish = () => {
        if (browsingHistory) return;

        void finishPopupAction(bindingStore, conversationStore);
    };
    const handleToggleSchedule = (event: MouseEvent<HTMLButtonElement>) => scheduleStore.toggle(event.currentTarget);

    useEffect(() => {
        if (!scheduleAvailable) scheduleStore.close();

        return () => scheduleStore.close();
    }, [scheduleAvailable, scheduleStore]);

    return (
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
                            aria-expanded={scheduleOpen}
                            aria-haspopup="dialog"
                            aria-label="Schedule"
                            disabled={!settings.backendAvailable}
                            onClick={handleToggleSchedule}
                            size="small"
                            sx={{ color: scheduled ? 'warning.main' : undefined }}
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
    );
}
