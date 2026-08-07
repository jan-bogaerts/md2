import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'
import type { ActionPromptPreparationStatus } from '../../../../services/actions/action_prompt_draft_service'

interface ActionPopupRunState {
    agentActive: boolean
    hasApprovals: boolean
    hasQuestion: boolean
    interactionReady: boolean
    runDisabledMessage: string | null
    runStatus: string
}

/** Applies popup run readiness rules to the current live prompt. */
export function actionPopupRunDisabled(
    action: ActionDefinition,
    runState: ActionPopupRunState,
    prompt: string,
    preparationStatus: ActionPromptPreparationStatus,
) {
    const sessionActive = runState.runStatus === 'queued'
        || runState.runStatus === 'running'
        || runState.runStatus === 'waitingForInput'

    return !!runState.runDisabledMessage
        || preparationStatus !== 'ready'
        || (action.id === CUSTOM_PROMPT_ACTION_ID && prompt.trim().length === 0)
        || (runState.agentActive && (
            !runState.interactionReady
            || prompt.trim().length === 0
            || runState.hasApprovals
            || runState.hasQuestion
        ))
        || (sessionActive && !runState.agentActive)
}
