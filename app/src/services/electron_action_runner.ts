import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type {
    ActionExecutionEvent,
    ActionRunInput,
    ActionRunLogEntry,
    ActionRunResult,
    ActionRunStatus,
} from '../data/action_run_types'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import { actionService } from './action_service'
import { dataService } from './data_service'

const TERMINAL_EXECUTION_STATUSES = new Set<ActionRunStatus>(['cancelled', 'completed', 'failed', 'okButNotAfter'])
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

function actionName(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.name ?? actionId
}

function logFromEvent(event: ActionExecutionEvent): ActionRunLogEntry {
    return {
        actionName: actionName(event.actionId),
        command: event.command ?? null,
        message: event.message ?? `${actionName(event.actionId)} ${event.status}`,
        phase: event.phase,
        status: event.status === 'completed' ? 'completed' : 'failed',
        stderr: event.stderr ?? '',
        stdout: event.stdout ?? '',
        ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
    }
}

/** Start one persisted action through Electron and collect its event stream for current UI consumers. */
export async function runElectronAction(
    action: ActionDefinition,
    context: ActionContext,
    input: ActionRunInput = {},
    onStarted?: (executionId: string) => void,
): Promise<ActionRunResult> {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Action execution requires Electron')

    const logs: ActionRunLogEntry[] = []
    const pendingEvents: ActionExecutionEvent[] = []
    let executionId: string | null = null
    let eventChain = Promise.resolve()
    let subscribed = false
    let unsubscribe: () => void = () => undefined
    let rejectRun: (error: unknown) => void = () => undefined
    let resolveRun: (result: ActionRunResult) => void = () => undefined
    let settled = false
    const resultPromise = new Promise<ActionRunResult>((resolve, reject) => {
        rejectRun = reject
        resolveRun = resolve
    })
    const cleanup = () => {
        if (!subscribed) return

        subscribed = false
        unsubscribe()
    }
    const processEvent = async (event: ActionExecutionEvent) => {
        if (settled || event.executionId !== executionId) return
        if (event.type === 'action' && event.status !== 'running') {
            logs.push(logFromEvent(event))
        }
        if (event.type !== 'execution' || !TERMINAL_EXECUTION_STATUSES.has(event.status as ActionRunStatus)) return

        cleanup()
        const eventProcessingError = takeActionEventProcessingError(event.executionId)
        if (eventProcessingError) throw eventProcessingError
        await dataService.projectLoading.reloadCurrentProjectSnapshot()
        settled = true
        resolveRun({ logs, status: event.status as ActionRunStatus })
    }
    const rejectProcessing = (error: unknown) => {
        if (settled) return

        settled = true
        cleanup()
        rejectRun(error)
    }
    const handleEvent = (event: ActionExecutionEvent) => {
        if (settled) return
        if (executionId === null) {
            pendingEvents.push(event)
            return
        }
        eventChain = eventChain.then(async () => processEvent(event)).catch(rejectProcessing)
    }
    unsubscribe = bridge.onActionExecution(handleEvent)
    subscribed = true

    try {
        executionId = await bridge.startAction({ actionId: action.id, context, runInput: input })
        onStarted?.(executionId)
        for (const event of pendingEvents) handleEvent(event)
    } catch (error) {
        settled = true
        cleanup()
        throw error
    }

    return resultPromise
}

export async function cancelElectronAction(executionId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Action cancellation requires Electron')

    await bridge.cancelActionExecution(executionId)
}
