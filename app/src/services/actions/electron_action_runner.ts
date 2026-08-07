import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversationReservation, ActionRunInput, ActionRunResult } from '../../data/action_run_types'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import { actionRunRegistry, cancelActionRun } from './action_run_registry'
import { dataService } from '../data/data_service'
import { projectPersistenceService } from '../project/project_persistence_service'

function shouldReserveConversation(action: ActionDefinition, context: ActionContext, input: ActionRunInput) {
    return action.type === 'agent'
        && !input.continueFrom
        && (context.kind === 'card' || context.kind === 'file')
        && !!context.cardInternalId
        && !!context.file
}

/** Start one persisted action through shared renderer run state. */
export async function runElectronAction(
    action: ActionDefinition,
    context: ActionContext,
    input: ActionRunInput = {},
    onStarted?: (runId: string) => void,
    interactive = true,
): Promise<ActionRunResult> {
    const handleStarted = (startedRunId: string) => {
        onStarted?.(startedRunId)
    }
    const requiresReservation = shouldReserveConversation(action, context, input)
    const bridge = getElectronActionBridge()
    const resumeAutomaticCommit = requiresReservation ? dataService.cards.deferAutomaticCommit() : null
    let conversationReservation: AgentConversationReservation | undefined
    try {
        conversationReservation = requiresReservation
            ? await bridge?.reserveActionConversation?.({ actionId: action.id, context, runInput: input })
            : undefined
        if (requiresReservation && !conversationReservation) {
            throw new Error('Starting a card agent requires conversation reservation support')
        }
        if (conversationReservation && context.file) {
            dataService.cards.addAgentLogReference(context.file, conversationReservation.reference)
        }
    } finally {
        resumeAutomaticCommit?.()
    }
    if (projectPersistenceService.getSnapshot().hasPendingSave) await projectPersistenceService.flushPendingChanges()
    return actionRunRegistry.startRun(action, context, input, handleStarted, interactive, conversationReservation)
}

/** Finish one idle streaming run, persist it, then continue through a new process. */
export async function restartElectronAction(
    previousRunId: string,
    action: ActionDefinition,
    context: ActionContext,
    input: ActionRunInput,
    onStarted?: (runId: string) => void,
): Promise<ActionRunResult> {
    if (projectPersistenceService.getSnapshot().hasPendingSave) await projectPersistenceService.flushPendingChanges()

    return actionRunRegistry.restartRun(previousRunId, action, context, input, onStarted)
}

export async function cancelElectronAction(runId: string) {
    await cancelActionRun(runId)
}
