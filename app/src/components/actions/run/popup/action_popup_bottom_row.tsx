import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useSyncExternalStore } from 'react';
import type { ActionContext } from '../../../../data/action_context';
import type { ActionDefinition } from '../../../../data/action_types';
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service';
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs';
import type { ActionConversationStore } from '../../conversation/state/action_conversation_store';
import type { ActionHistoryStore } from '../state/action_history_store';
import { currentActionPromptDraft } from './action_popup_operations';
import type { ActionRunInputStore } from '../state/action_run_input_store';
import type { ActionRunResultStore } from '../state/action_run_result_store';
import type { ActionScheduleStore } from '../schedule/action_schedule_store';
import { ActionAgentSelectors } from '../../agent/action_agent_selectors';
import { ActionPromptMenu } from './action_prompt_menu';
import { ActionPopupRunControls } from './action_popup_run_controls';
import type { ActionRunBindingStore } from '../state/action_run_binding_store';

interface ActionPopupBottomRowProps {
    action: ActionDefinition;
    assignmentContext: ActionContext;
    bindingStore: ActionRunBindingStore;
    conversationStore: ActionConversationStore;
    historyStore: ActionHistoryStore;
    /** Embedded inside idle input surfaces; standalone while a command run is active. */
    embedded?: boolean;
    inputStore: ActionRunInputStore;
    resultStore: ActionRunResultStore;
    runValidationError: string | null;
    scheduleStore: ActionScheduleStore;
    settingsStore: ActionRunSettingsStore;
}

/** Agent settings and run controls for the popup footer. */
export function ActionPopupBottomRow(props: ActionPopupBottomRowProps) {
    const {
        action, assignmentContext, bindingStore, conversationStore, embedded = false, historyStore, inputStore, resultStore,
        runValidationError, scheduleStore, settingsStore,
    } = props;
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const boundRunId = useBoundRunId(bindingStore);
    const agentActive = useRunSelector(boundRunId, (run) => {
        const active = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput';
        return !!active && run?.activeActionType === 'agent';
    });
    useRunSelector(boundRunId, (run) => run?.conversation?.id ?? null);
    useSyncExternalStore(
        conversationStore.subscribe,
        () => conversationStore.getSnapshot().selectedConversation?.id ?? null,
        () => conversationStore.getSnapshot().selectedConversation?.id ?? null,
    );
    const promptDraft = currentActionPromptDraft(
        action, assignmentContext, bindingStore, conversationStore, false, agentActive ? '' : undefined,
    );

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
                {action.type === 'agent' ? (
                    <Box sx={{ alignItems: 'center', display: isMobile ? 'flex' : 'contents', gap: 0, minWidth: 0 }}>
                        <ActionPromptMenu
                            actionId={action.id} bindingStore={bindingStore} context={assignmentContext}
                            conversationStore={conversationStore} promptDraft={promptDraft}
                        />
                        <Box data-footer-selectors sx={{ flexShrink: 1, minWidth: 158, overflow: 'hidden' }}>
                            <ActionAgentSelectors action={action} bindingStore={bindingStore} settingsStore={settingsStore} />
                        </Box>
                    </Box>
                ) : <Box data-footer-selectors sx={{ flexShrink: 1, minWidth: 158, overflow: 'hidden' }} />}
                <ActionPopupRunControls
                    action={action} assignmentContext={assignmentContext} bindingStore={bindingStore}
                    conversationStore={conversationStore} historyStore={historyStore} inputStore={inputStore}
                    resultStore={resultStore} runValidationError={runValidationError}
                    scheduleStore={scheduleStore} settingsStore={settingsStore}
                />
            </Box>
        </Box>
    );
}
