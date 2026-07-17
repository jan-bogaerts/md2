import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { ActionRunInput, ActionRunResult } from '../data/action_run_types'
import { actionExecutionService, cancelActionExecution } from './action_execution_service'
import { dataService } from './data_service'

const EVENT_PROCESSING_ERROR_LIMIT = 100
const eventProcessingErrors = new Map<string, unknown>()

/** Preserve a shared execution-event consumer failure for the matching run promise. */
export function recordActionEventProcessingError(executionId: string, error: unknown) {
    eventProcessingErrors.set(executionId, error)
    if (eventProcessingErrors.size > EVENT_PROCESSING_ERROR_LIMIT) {
        const oldestExecutionId = eventProcessingErrors.keys().next().value
        if (oldestExecutionId) eventProcessingErrors.delete(oldestExecutionId)
    }
}

function takeActionEventProcessingError(executionId: string) {
    const error = eventProcessingErrors.get(executionId)
    eventProcessingErrors.delete(executionId)

    return error
}

/** Start one persisted action through shared renderer execution state. */
export async function runElectronAction(
    action: ActionDefinition,
    context: ActionContext,
    input: ActionRunInput = {},
    onStarted?: (executionId: string) => void,
): Promise<ActionRunResult> {
    let executionId = ''
    const handleStarted = (startedExecutionId: string) => {
        executionId = startedExecutionId
        onStarted?.(startedExecutionId)
    }
    if (dataService.getState().hasPendingSave) await dataService.flushPendingChanges()
    const result = await actionExecutionService.startExecution(action, context, input, handleStarted)
    const processingError = takeActionEventProcessingError(executionId)
    if (processingError) throw processingError
    await dataService.projectLoading.reloadCurrentProjectSnapshot()

    return result
}

export async function cancelElectronAction(executionId: string) {
    await cancelActionExecution(executionId)
}
