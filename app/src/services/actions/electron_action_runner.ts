import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionRunInput, ActionRunResult } from '../../data/action_run_types'
import { actionRunRegistry, cancelActionRun } from './action_run_registry'
import { projectPersistenceService } from '../project/project_persistence_service'

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
    if (projectPersistenceService.getSnapshot().hasPendingSave) await projectPersistenceService.flushPendingChanges()
    return actionRunRegistry.startRun(action, context, input, handleStarted, interactive)
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
