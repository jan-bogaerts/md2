import { useEffect, useMemo, useState } from 'react'
import { actionContextIdentity } from '../../../../data/action_context'
import {
    actionRunSettingsService,
} from '../../../../services/actions/action_run_settings_service'
import { AgentAction } from './agent_action'
import { ActionPopupFrame } from './action_popup_frame'
import { CommandAction } from './command_action'
import { createActionPopupBindings, worktreeValidationMessage } from './action_popup_runtime'
import type { ActionPopupContentProps, ActionPopupRuntime } from './action_popup_types'

/** Selects the action-specific popup content while preserving its runtime for the selected action. */
export function ActionPopupSession(props: ActionPopupContentProps) {
    const { action, assignmentContext, historicalEntries, initialConversationPath, initialRunId } = props
    const settingsContextIdentity = actionContextIdentity(assignmentContext)
    const settingsStore = useMemo(
        () => assignmentContext.cardInternalId
            ? actionRunSettingsService.getCardStore(assignmentContext.cardInternalId, action.id)
            : actionRunSettingsService.getSessionStore(action.id, settingsContextIdentity, assignmentContext.kind),
        [action.id, assignmentContext.cardInternalId, assignmentContext.kind, settingsContextIdentity],
    )
    const [bindings] = useState(
        () => createActionPopupBindings(action, assignmentContext, initialRunId, initialConversationPath, historicalEntries),
    );
    useEffect(() => {
        bindings.conversationStore.setContext(assignmentContext);
        bindings.historyStore.configure(action, assignmentContext, historicalEntries ?? null);
        bindings.usageValuesService.setContext(assignmentContext);
    }, [action, assignmentContext, bindings, historicalEntries]);
    useEffect(() => {
        bindings.usageValuesService.start()

        return () => {
            bindings.usageValuesService.stop()
            bindings.bindingStore.dispose()
        }
    }, [bindings])
    const runtime: ActionPopupRuntime = {
        ...bindings,
        runValidationError: worktreeValidationMessage(action, assignmentContext),
        settingsStore,
    }

    return (
        <ActionPopupFrame
            bindingStore={bindings.bindingStore}
            contentProps={props}
            conversationSearchService={bindings.conversationSearchService}
            conversationStore={bindings.conversationStore}
        >
            {action.type === 'agent'
                ? (
                    <AgentAction
                        action={action}
                        assignmentContext={assignmentContext}
                        baseContext={props.baseContext}
                        popupEntryId={props.popupEntryId}
                        popupVisible={props.popupVisible}
                        readOnlyMessage={props.readOnlyMessage}
                        runtime={runtime}
                        showHistoricalHistory={!!historicalEntries}
                    />
                ) : (
                    <CommandAction
                        action={action}
                        assignmentContext={assignmentContext}
                        baseContext={props.baseContext}
                        readOnlyMessage={props.readOnlyMessage}
                        runtime={runtime}
                        showHistoricalHistory={!!historicalEntries}
                    />
                )}
        </ActionPopupFrame>
    )
}
