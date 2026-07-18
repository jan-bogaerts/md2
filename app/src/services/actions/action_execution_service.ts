import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversationMessage } from '../../data/data_types'
import type {
    ActionExecutionEvent,
    ActionExecutionStatus,
    ActionExecutionUpdate,
    ActionRunInput,
    ActionRunLogEntry,
    ActionRunResult,
    ActionRunStatus,
} from '../../data/action_run_types'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionService } from './action_service'
import { register } from '.././service_injector'

const TERMINAL_STATUSES = new Set<ActionRunStatus>(['cancelled', 'completed', 'failed', 'okButNotAfter'])
const RETAINED_EXECUTION_LIMIT = 100

export interface LiveActionExecution {
    activeActionId: string | null
    activeActionType: ActionDefinition['type'] | null
    agentTurn: LiveAgentTurn | null
    context: ActionContext
    executionId: string
    logs: ActionRunLogEntry[]
    reference: string | null
    rootActionId: string
    status: ActionExecutionStatus
}

export interface LiveAgentTurn {
    assistantText: string
    conversationId: string
    reference: string
    startedAt: string
    title: string
    userMessage: AgentConversationMessage
}

export interface ActionExecutionSnapshot {
    executions: LiveActionExecution[]
}

type EventListener = (event: ActionExecutionEvent) => void

function actionName(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.label ?? actionId
}

function actionType(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.type ?? null
}

function createLog(event: ActionExecutionEvent): ActionRunLogEntry {
    return {
        actionId: event.actionId,
        actionName: actionName(event.actionId),
        command: event.type === 'action' ? event.command ?? null : null,
        message: event.type === 'action' ? event.message ?? `${actionName(event.actionId)} ${event.status}` : `${actionName(event.actionId)} running`,
        phase: event.phase,
        status: event.status,
        stderr: '',
        stdout: '',
        ...(event.type === 'action' && event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
    }
}

function runningLogIndex(logs: ActionRunLogEntry[], event: ActionExecutionEvent) {
    return logs.findLastIndex((log) => log.actionId === event.actionId && log.phase === event.phase && log.status === 'running')
}

function updateActionLogs(logs: ActionRunLogEntry[], event: Extract<ActionExecutionEvent, { type: 'action' }>) {
    const currentIndex = runningLogIndex(logs, event)
    if (currentIndex < 0) return [...logs, createLog(event)]
    const current = logs[currentIndex]
    const next = [...logs]
    next[currentIndex] = {
        ...current,
        command: event.command ?? current.command,
        message: event.message ?? `${actionName(event.actionId)} ${event.status}`,
        status: event.status,
        ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
    }

    return next
}

function updateOutputLogs(
    logs: ActionRunLogEntry[],
    event: Extract<ActionExecutionEvent, { type: 'update' }>,
    update: Extract<ActionExecutionUpdate, { kind: 'error' | 'output' }>,
) {
    const currentIndex = logs.findLastIndex((log) => (
        log.actionId === event.actionId && log.phase === event.phase && log.status === 'running'
    ))
    const current = currentIndex >= 0 ? logs[currentIndex] : createLog(event)
    const updated = {
        ...current,
        command: update.command ?? current.command,
        stderr: update.kind === 'error' ? `${current.stderr}${update.content}` : current.stderr,
        stdout: update.kind === 'output' ? `${current.stdout}${update.content}` : current.stdout,
    }
    if (currentIndex < 0) return [...logs, updated]
    const next = [...logs]
    next[currentIndex] = updated

    return next
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
    private runningSnapshot: LiveActionExecution[] = []
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

    getRunningSnapshot() {
        return this.runningSnapshot
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

        return this.runningSnapshot.find((execution) => (
            contextKey(execution.context) === expectedContext
        )) ?? null
    }

    getRunningExecutionForFile(filePath: string | null) {
        if (!filePath) return null

        return this.runningSnapshot.find((execution) => execution.context.file === filePath) ?? null
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
            agentTurn: null,
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
                logs: updateActionLogs(next.logs, event),
                reference: event.reference ?? next.reference,
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentStarted') {
            const { conversationId, reference, startedAt, title, userMessage } = event.update
            next = { ...next, agentTurn: { assistantText: '', conversationId, reference, startedAt, title, userMessage } }
        }
        if (event.type === 'update' && event.update.kind !== 'agentStarted') {
            const agentTurn = event.update.kind === 'output' && next.agentTurn
                ? { ...next.agentTurn, assistantText: `${next.agentTurn.assistantText}${event.update.content}` }
                : next.agentTurn
            next = { ...next, agentTurn, logs: updateOutputLogs(next.logs, event, event.update) }
        }
        this.executions.set(event.executionId, next)
        while (this.executions.size > RETAINED_EXECUTION_LIMIT) this.executions.delete(this.executions.keys().next().value as string)
        this.publish()
        for (const listener of this.eventListeners) listener(event)
    }

    private publish() {
        this.snapshot = { executions: [...this.executions.values()] }
        const nextRunningSnapshot = this.snapshot.executions.filter(({ status }) => status === 'running')
        const runningChanged = nextRunningSnapshot.length !== this.runningSnapshot.length
            || nextRunningSnapshot.some(({ executionId }, index) => this.runningSnapshot[index]?.executionId !== executionId)
        if (runningChanged) this.runningSnapshot = nextRunningSnapshot
        this.dispatchEvent(new CustomEvent('changed'))
        if (runningChanged) this.dispatchEvent(new CustomEvent('runningChanged'))
    }
}

export const actionExecutionService = new ActionExecutionService()
