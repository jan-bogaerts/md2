import { useMemo } from 'react'
import { actionContextIdentity } from '../../../../data/action_context'
import {
    actionRunSettingsService,
} from '../../../../services/actions/action_run_settings_service'
import { AgentAction } from './agent_action'
import { ActionPopupFrame } from './action_popup_frame'
import { CommandAction } from './command_action'
import { createActionPopupBindings, worktreeValidationMessage } from './action_popup_runtime'
import type { ActionPopupContentProps, ActionPopupRuntime } from './action_popup_types'

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_frame'

/** Selects the action-specific popup content while preserving its runtime for the selected action. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const { action, assignmentContext } = props
    const settingsContextIdentity = actionContextIdentity(assignmentContext)
    const settingsStore = useMemo(
        () => assignmentContext.cardInternalId
            ? actionRunSettingsService.getCardStore(assignmentContext.cardInternalId, action.id)
            : actionRunSettingsService.getSessionStore(action.id, settingsContextIdentity),
        [action.id, assignmentContext.cardInternalId, settingsContextIdentity],
    )
    const bindings = useMemo(
        () => createActionPopupBindings(action, assignmentContext),
        [action, assignmentContext],
    )
    const runtime: ActionPopupRuntime = {
        ...bindings,
        runValidationError: worktreeValidationMessage(action, assignmentContext),
        settingsStore,
    }

    return (
        <ActionPopupFrame contentProps={props} conversationStore={bindings.conversationStore}>
            {action.type === 'agent'
                ? (
                    <AgentAction
                        action={action}
                        assignmentContext={assignmentContext}
                        baseContext={props.baseContext}
                        popupEntryId={props.popupEntryId}
                        readOnlyMessage={props.readOnlyMessage}
                        runtime={runtime}
                    />
                ) : (
                    <CommandAction
                        action={action}
                        assignmentContext={assignmentContext}
                        baseContext={props.baseContext}
                        readOnlyMessage={props.readOnlyMessage}
                        runtime={runtime}
                    />
                )}
        </ActionPopupFrame>
    )
}
