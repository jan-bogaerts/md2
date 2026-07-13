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

async function recordAgentEvent(context: ActionContext, event: ActionExecutionEvent) {
    if (!context.file) return
    if (event.agentEvent) dataService.agents.recordAgentRunEvent(context.file, event.agentEvent)
    if (!event.conversation || !event.reference || event.status !== 'completed') return

    const reference = event.executionWorktree === null || event.executionWorktree === undefined
        ? event.reference
        : `worktree:${event.executionWorktree}:${event.reference}`
    await dataService.agents.linkAgentConversation(context.file, event.conversation, reference)
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
    let cleanup = () => undefined
    let resolveRun: (result: ActionRunResult) => void = () => undefined
    const resultPromise = new Promise<ActionRunResult>((resolve) => {
        resolveRun = resolve
    })
    const processEvent = async (event: ActionExecutionEvent) => {
        if (event.executionId !== executionId) return
        if (event.type === 'agent') await recordAgentEvent(context, event)
        if (event.type === 'action' && event.status !== 'running') {
            logs.push(logFromEvent(event))
            await recordAgentEvent(context, event)
        }
        if (event.type !== 'execution' || !TERMINAL_EXECUTION_STATUSES.has(event.status as ActionRunStatus)) return

        cleanup()
        await dataService.projectLoading.reloadCurrentProjectSnapshot()
        resolveRun({ logs, status: event.status as ActionRunStatus })
    }
    const handleEvent = (event: ActionExecutionEvent) => {
        if (executionId === null) {
            pendingEvents.push(event)
            return
        }
        eventChain = eventChain.then(async () => processEvent(event))
    }
    cleanup = bridge.onActionExecution(handleEvent)

    try {
        executionId = await bridge.startAction({ actionId: action.id, context, runInput: input })
        onStarted?.(executionId)
        for (const event of pendingEvents) handleEvent(event)
    } catch (error) {
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
