import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import type { ActionPopupController } from './use_action_popup_controller'

/** Applies popup execution readiness rules to the current live prompt. */
export function actionPopupRunDisabled(
    action: ActionDefinition,
    controller: ActionPopupController,
    prompt: string,
    showSaveControls: boolean,
) {
    const sessionActive = controller.runStatus === 'queued'
        || controller.runStatus === 'running'
        || controller.runStatus === 'waitingForInput'

    return !!controller.executionDisabledMessage
        || controller.promptPreparationPending
        || controller.promptPreparationFailed
        || (action.id === CUSTOM_PROMPT_ACTION_ID && prompt.trim().length === 0)
        || (controller.agentActive && (
            !controller.interactionReady
            || prompt.trim().length === 0
            || controller.pendingApprovals.length > 0
            || !!controller.structuredQuestion
        ))
        || (sessionActive && !controller.agentActive)
        || (showSaveControls && controller.saveDisabled)
}
