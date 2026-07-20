import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionRunInput, ActionRunResult } from '../../data/action_run_types'
import { actionExecutionService, cancelActionExecution } from './action_execution_service'
import { dataService } from '../data/data_service'
import { projectPersistenceService } from '../project/project_persistence_service'

/** Start one persisted action through shared renderer execution state. */
export async function runElectronAction(
    action: ActionDefinition,
    context: ActionContext,
    input: ActionRunInput = {},
    onStarted?: (executionId: string) => void,
): Promise<ActionRunResult> {
    const handleStarted = (startedExecutionId: string) => {
        onStarted?.(startedExecutionId)
    }
    if (projectPersistenceService.getSnapshot().hasPendingSave) await projectPersistenceService.flushPendingChanges()
    const result = await actionExecutionService.startExecution(action, context, input, handleStarted)
    await dataService.projectLoading.reloadCurrentProjectSnapshot()

    return result
}

export async function cancelElectronAction(executionId: string) {
    await cancelActionExecution(executionId)
}
