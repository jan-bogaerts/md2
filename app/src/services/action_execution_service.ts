import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { AgentConversation } from '../data/data_types'
import type {
    ActionExecutionEvent,
    ActionExecutionStatus,
    ActionRunInput,
    ActionRunLogEntry,
    ActionRunResult,
    ActionRunStatus,
} from '../data/action_run_types'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import type { ElectronActionBridge } from '../data/electron_action_bridge'
import { actionService } from './action_service'
import { register } from './service_injector'

const TERMINAL_STATUSES = new Set<ActionRunStatus>(['cancelled', 'completed', 'failed', 'okButNotAfter'])
const RETAINED_EXECUTION_LIMIT = 100

export interface LiveActionExecution {
    activeActionId: string | null
    activeActionType: ActionDefinition['type'] | null
    conversation: AgentConversation | null
    context: ActionContext
    executionId: string
    logs: ActionRunLogEntry[]
    reference: string | null
    rootActionId: string
    status: ActionExecutionStatus
}

export interface ActionExecutionSnapshot {
    executions: LiveActionExecution[]
}

type EventListener = (event: ActionExecutionEvent) => void

function actionName(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.name ?? actionId
}

function actionType(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.type ?? null
}

function createLog(event: ActionExecutionEvent): ActionRunLogEntry {
    return {
        actionName: actionName(event.actionId),
        command: event.command ?? null,
        message: event.message ?? `${actionName(event.actionId)} ${event.status}`,
        phase: event.phase,
        status: event.status,
        stderr: event.stderr ?? '',
        stdout: event.stdout ?? '',
        ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
    }
}

function updateLogs(logs: ActionRunLogEntry[], event: ActionExecutionEvent) {
    const currentIndex = logs.findLastIndex((log) => (
        log.actionName === actionName(event.actionId) && log.phase === event.phase && log.status === 'running'
    ))
    if (event.status === 'running' && currentIndex >= 0) {
        const current = logs[currentIndex]
        const next = [...logs]
        next[currentIndex] = {
            ...current,
            command: event.command ?? current.command,
            message: event.message ?? current.message,
            stderr: `${current.stderr}${event.stderr ?? ''}`,
            stdout: `${current.stdout}${event.stdout ?? ''}`,
        }

        return next
    }
    if (event.status !== 'running' && currentIndex >= 0) {
        const next = [...logs]
        next[currentIndex] = createLog(event)

        return next
    }

    return [...logs, createLog(event)]
}

function contextKey(context: ActionContext) {
    return Object.entries(context)
        .filter(([, value]) => value !== undefined)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, value]) => `${key}=${value}`)
        .join('\u0000')
}

export async function cancelActionExecution(executionId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Action cancellation requires Electron')

    await bridge.cancelActionExecution(executionId)
}

/** Owns one renderer-wide subscription and all live/recent action execution state. */
export class ActionExecutionService extends EventTarget {
    private eventListeners = new Set<EventListener>()
    private executions = new Map<string, LiveActionExecution>()
    private snapshot: ActionExecutionSnapshot = { executions: [] }
    private subscribedBridge: ElectronActionBridge | null = null
    private unsubscribeBridge: (() => void) | null = null

    constructor() {
        super()
        register('actionExecutionService', this)
    }

    start() {
        const bridge = getElectronActionBridge()
        if (!bridge) return
        if (this.unsubscribeBridge && bridge === this.subscribedBridge) return

        this.unsubscribeBridge?.()
        this.subscribedBridge = bridge
        this.unsubscribeBridge = bridge.onActionExecution((event) => this.handleEvent(event))
    }

    stop() {
        this.unsubscribeBridge?.()
        this.subscribedBridge = null
        this.unsubscribeBridge = null
        this.eventListeners.clear()
        this.executions = new Map()
        this.publish()
    }

    getSnapshot() {
        return this.snapshot
    }

    getExecution(actionId: string, context: ActionContext) {
        const expectedContext = contextKey(context)

        return this.snapshot.executions.findLast((execution) => (
            execution.rootActionId === actionId && contextKey(execution.context) === expectedContext
        )) ?? null
    }

    getRunningExecutionForContext(context: ActionContext) {
        if (context.file) return this.getRunningExecutionForFile(context.file)

        const expectedContext = contextKey(context)

        return this.snapshot.executions.find((execution) => (
            execution.status === 'running' && contextKey(execution.context) === expectedContext
        )) ?? null
    }

    getRunningExecutionForFile(filePath: string | null) {
        if (!filePath) return null

        return this.snapshot.executions.find((execution) => execution.status === 'running' && execution.context.file === filePath) ?? null
    }

    subscribeEvents(listener: EventListener) {
        this.eventListeners.add(listener)
        this.start()

        return () => this.eventListeners.delete(listener)
    }

    async startExecution(
        action: ActionDefinition,
        context: ActionContext,
        runInput: ActionRunInput = {},
        onStarted?: (executionId: string) => void,
    ) {
        const bridge = getElectronActionBridge()
        if (!bridge) throw new Error('Action execution requires Electron')
        this.start()
        const executionId = await bridge.startAction({ actionId: action.id, context, runInput })
        onStarted?.(executionId)

        return this.waitForExecution(executionId)
    }

    private waitForExecution(executionId: string): Promise<ActionRunResult> {
        const current = this.executions.get(executionId)
        if (current && TERMINAL_STATUSES.has(current.status as ActionRunStatus)) {
            return Promise.resolve({ logs: current.logs, status: current.status as ActionRunStatus })
        }

        return new Promise((resolve) => {
            const unsubscribe = this.subscribeEvents((event) => {
                if (event.executionId !== executionId || event.type !== 'execution') return
                if (!TERMINAL_STATUSES.has(event.status as ActionRunStatus)) return

                unsubscribe()
                const execution = this.executions.get(executionId)
                resolve({ logs: execution?.logs ?? [], status: event.status as ActionRunStatus })
            })
        })
    }

    private handleEvent(event: ActionExecutionEvent) {
        const current = this.executions.get(event.executionId) ?? {
            activeActionId: null,
            activeActionType: null,
            conversation: null,
            context: event.context,
            executionId: event.executionId,
            logs: [],
            reference: null,
            rootActionId: event.rootActionId,
            status: 'running' as const,
        }
        let next = { ...current, context: event.context, rootActionId: event.rootActionId }
        if (event.type === 'execution') next = { ...next, status: event.status }
        if (event.type === 'action') {
            next = {
                ...next,
                activeActionId: event.status === 'running' ? event.actionId : null,
                activeActionType: event.status === 'running' ? actionType(event.actionId) : null,
                conversation: event.conversation ?? next.conversation,
                logs: updateLogs(next.logs, event),
                reference: event.reference ?? next.reference,
            }
        }
        if (event.type === 'agent' && event.agentEvent) {
            const { agentEvent } = event
            const streamEvent = {
                ...event,
                stderr: agentEvent.type === 'error' || agentEvent.type === 'stderr' ? agentEvent.content : '',
                stdout: agentEvent.type === 'output' ? agentEvent.content : '',
                type: 'action' as const,
            }
            next = {
                ...next,
                conversation: agentEvent.conversation,
                logs: streamEvent.stderr || streamEvent.stdout ? updateLogs(next.logs, streamEvent) : next.logs,
            }
        }
        this.executions.set(event.executionId, next)
        while (this.executions.size > RETAINED_EXECUTION_LIMIT) this.executions.delete(this.executions.keys().next().value as string)
        this.publish()
        for (const listener of this.eventListeners) listener(event)
    }

    private publish() {
        this.snapshot = { executions: [...this.executions.values()] }
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

export const actionExecutionService = new ActionExecutionService()
