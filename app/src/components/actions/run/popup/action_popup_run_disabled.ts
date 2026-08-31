import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'
import type { ActionPromptPreparationStatus } from '../../../../services/actions/action_prompt_draft_service'

interface ActionPopupRunState {
    agentActive: boolean
    interactionReady: boolean
    runDisabledMessage: string | null
    runStatus: string
}

/** Explains action-definition data that prevents a manual run. */
export function actionRunDefinitionDisabledMessage(action: ActionDefinition) {
    if (action.type === 'command' && (action.command === null || action.command.trim().length === 0)) {
        return 'Command text is required'
    }

    return null
}

/** Applies popup run readiness rules to the current live prompt. */
export function actionPopupRunDisabled(
    action: ActionDefinition,
    runState: ActionPopupRunState,
    prompt: string,
    preparationStatus: ActionPromptPreparationStatus,
) {
    return !!actionRunDefinitionDisabledMessage(action)
        || !!runState.runDisabledMessage
        || preparationStatus !== 'ready'
        || (action.type === 'command' && prompt.trim().length === 0)
        || (action.id === CUSTOM_PROMPT_ACTION_ID && prompt.trim().length === 0)
        || (runState.agentActive && (
            !runState.interactionReady
            || prompt.trim().length === 0
        ))
}
