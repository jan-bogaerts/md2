import { actionContextIdentity } from '../../data/action_context'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversationMessage } from '../../data/data_types'
import type {
    AgentQuestion,
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
    activeActionAutoFinish: ActionDefinition['autoFinish']
    activeActionId: string | null
    activeActionStreaming: boolean
    activeActionType: ActionDefinition['type'] | null
    agentTurn: LiveAgentTurn | null
    context: ActionContext
    executionId: string
    logs: ActionRunLogEntry[]
    interactionReady: boolean
    question: LiveAgentQuestion | null
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
    messages: AgentConversationMessage[]
}

export interface LiveAgentQuestion {
    questions: AgentQuestion[]
    requestId: number | string | null
}

export interface ActionExecutionSnapshot {
    executions: LiveActionExecution[]
}

type EventListener = (event: ActionExecutionEvent) => void
interface PromptDraft {
    revision: number
    value: string
}

function actionName(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.label ?? actionId
}

function actionType(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.type ?? null
}

function actionStreaming(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.streaming ?? false
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
    return actionContextIdentity(context)
}

function idlePromptDraftKey(actionId: string, context: ActionContext) {
    return `idle\u0000${actionId}\u0000${contextKey(context)}`
}

function executionPromptDraftKey(executionId: string, actionId: string) {
    return `execution\u0000${executionId}\u0000${actionId}`
}

function promptDraftKey(actionId: string, context: ActionContext, execution: LiveActionExecution | null) {
    if (execution?.activeActionId) return executionPromptDraftKey(execution.executionId, execution.activeActionId)

    return idlePromptDraftKey(actionId, context)
}

export async function cancelActionExecution(executionId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Action cancellation requires Electron')

    await bridge.cancelActionExecution(executionId)
}

export async function sendActionMessage(executionId: string, content: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.sendActionMessage) throw new Error('Streaming agent messaging requires Electron')

    await bridge.sendActionMessage(executionId, content)
}

export async function setActionQueuedMessage(executionId: string, content: string, revision: number) {
    const bridge = getElectronActionBridge()
    if (!bridge?.setActionQueuedMessage) throw new Error('Agent prompt queue requires Electron')

    await bridge.setActionQueuedMessage(executionId, content, revision)
}

export async function sendActionQueuedMessage(executionId: string, revision: number) {
    const bridge = getElectronActionBridge()
    if (!bridge?.sendActionQueuedMessage) throw new Error('Sending queued agent prompt requires Electron')

    await bridge.sendActionQueuedMessage(executionId, revision)
}

export async function answerActionQuestion(
    executionId: string,
    requestId: number | string | null,
    answers: Record<string, string[]>,
) {
    const bridge = getElectronActionBridge()
    if (!bridge?.answerActionQuestion) throw new Error('Streaming agent questions require Electron')

    await bridge.answerActionQuestion(executionId, requestId, answers)
}

export async function finishActionExecution(executionId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.finishActionExecution) throw new Error('Finishing a streaming agent requires Electron')

    await bridge.finishActionExecution(executionId)
}

export async function notifyActionCardStateChange(cardInternalId: string | null, state: string) {
    if (!cardInternalId) return
    const bridge = getElectronActionBridge()
    if (!bridge?.notifyActionCardStateChange) throw new Error('Automatic agent finish requires Electron')

    await bridge.notifyActionCardStateChange(cardInternalId, state)
}

/** Owns one renderer-wide subscription and all live/recent action execution state. */
export class ActionExecutionService extends EventTarget {
    private eventListeners = new Set<EventListener>()
    private executions = new Map<string, LiveActionExecution>()
    private promptDrafts = new Map<string, PromptDraft>()
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
        this.promptDrafts = new Map()
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

    getPromptDraft(actionId: string, context: ActionContext) {
        const execution = this.getRunningExecutionForContext(context)
        const key = promptDraftKey(actionId, context, execution)

        return this.promptDrafts.get(key)?.value ?? ''
    }

    async setPromptDraft(actionId: string, context: ActionContext, value: string) {
        const execution = this.getRunningExecutionForContext(context)
        const key = promptDraftKey(actionId, context, execution)
        const previous = this.promptDrafts.get(key)
        const draft = { revision: (previous?.revision ?? -1) + 1, value }
        this.promptDrafts.set(key, draft)
        this.dispatchEvent(new CustomEvent('changed'))
        if (!execution?.interactionReady || execution.activeActionType !== 'agent') return

        await setActionQueuedMessage(execution.executionId, value, draft.revision)
    }

    async sendPromptDraft(actionId: string, context: ActionContext) {
        const execution = this.getRunningExecutionForContext(context)
        if (!execution?.activeActionId) throw new Error('Action execution has no active agent')
        const key = promptDraftKey(actionId, context, execution)
        const draft = this.promptDrafts.get(key)
        if (!draft || draft.value.trim().length === 0) throw new Error('Queued agent prompt is empty')

        await sendActionQueuedMessage(execution.executionId, draft.revision)
    }

    clearPromptDraft(actionId: string, context: ActionContext) {
        const execution = this.getRunningExecutionForContext(context)
        this.promptDrafts.delete(promptDraftKey(actionId, context, execution))
        this.promptDrafts.delete(idlePromptDraftKey(actionId, context))
        this.dispatchEvent(new CustomEvent('changed'))
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
        interactive = true,
    ) {
        const bridge = getElectronActionBridge()
        if (!bridge) throw new Error('Action execution requires Electron')
        this.start()
        const start = interactive ? bridge.startAction.bind(bridge) : bridge.startUnattendedAction?.bind(bridge)
        if (!start) throw new Error('Unattended action execution requires Electron')
        const executionId = await start({ actionId: action.id, context, runInput })
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
            activeActionAutoFinish: null,
            activeActionId: null,
            activeActionStreaming: false,
            activeActionType: null,
            agentTurn: null,
            context: event.context,
            executionId: event.executionId,
            logs: [],
            interactionReady: false,
            question: null,
            reference: null,
            rootActionId: event.rootActionId,
            status: 'running' as const,
        }
        let next = { ...current, context: event.context, rootActionId: event.rootActionId }
        if (event.type === 'execution') next = { ...next, status: event.status }
        if (event.type === 'execution' && TERMINAL_STATUSES.has(event.status as ActionRunStatus)) {
            this.clearExecutionPromptDrafts(event.executionId)
        }
        if (event.type === 'agentState') next = { ...next, status: event.status }
        if (event.type === 'action') {
            const active = event.status === 'running'
            const activeType = event.actionType ?? actionType(event.actionId)
            next = {
                ...next,
                activeActionAutoFinish: active ? event.autoFinish ?? null : null,
                activeActionId: active ? event.actionId : null,
                activeActionStreaming: active && (event.streaming ?? actionStreaming(event.actionId)),
                activeActionType: active ? activeType : null,
                interactionReady: active && !!event.interactionReady,
                logs: updateActionLogs(next.logs, event),
                reference: event.reference ?? next.reference,
            }
            if (!active) this.clearExecutionPromptDraft(event.executionId, event.actionId)
        }
        if (event.type === 'agentState') {
            next = {
                ...next,
                activeActionAutoFinish: event.autoFinish ?? null,
                activeActionId: event.actionId,
                activeActionStreaming: event.streaming ?? actionStreaming(event.actionId),
                activeActionType: event.actionType ?? actionType(event.actionId),
                interactionReady: event.interactionReady ?? true,
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentStarted') {
            const { continued, conversationId, reference, startedAt, title, userMessage } = event.update
            next = {
                ...next,
                agentTurn: { assistantText: '', conversationId, messages: [userMessage], reference, startedAt, title },
            }
            if (continued) this.clearExecutionPromptDraft(event.executionId, event.actionId)
        }
        if (event.type === 'update' && event.update.kind === 'agentQuestion') {
            next = { ...next, question: { questions: event.update.questions, requestId: event.update.requestId } }
        }
        if (
            event.type === 'update'
            && (event.update.kind === 'agentUserMessage' || event.update.kind === 'agentQuestionAnswer')
            && next.agentTurn
        ) {
            const assistantMessage = next.agentTurn.assistantText.length > 0
                ? [{
                    content: next.agentTurn.assistantText,
                    id: `${event.update.userMessage.id}-previous-assistant`,
                    role: 'assistant' as const,
                    timestamp: event.update.userMessage.timestamp,
                }]
                : []
            next = {
                ...next,
                agentTurn: {
                    ...next.agentTurn,
                    assistantText: '',
                    messages: [...next.agentTurn.messages, ...assistantMessage, event.update.userMessage],
                },
                question: null,
            }
            if (event.update.kind === 'agentUserMessage') {
                this.clearExecutionPromptDraft(event.executionId, event.actionId)
            }
        }
        if (event.type === 'update' && (event.update.kind === 'output' || event.update.kind === 'error')) {
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

    private clearExecutionPromptDraft(executionId: string, actionId: string) {
        this.promptDrafts.delete(executionPromptDraftKey(executionId, actionId))
        this.dispatchEvent(new CustomEvent('promptDraftCleared', { detail: { actionId, executionId } }))
    }

    private clearExecutionPromptDrafts(executionId: string) {
        const prefix = `execution\u0000${executionId}\u0000`
        for (const key of this.promptDrafts.keys()) {
            if (key.startsWith(prefix)) this.promptDrafts.delete(key)
        }
    }

    private publish() {
        this.snapshot = { executions: [...this.executions.values()] }
        const nextRunningSnapshot = this.snapshot.executions.filter(({ status }) => (
            status === 'running' || status === 'waitingForInput'
        ))
        const runningChanged = nextRunningSnapshot.length !== this.runningSnapshot.length
            || nextRunningSnapshot.some(({ executionId }, index) => this.runningSnapshot[index]?.executionId !== executionId)
        this.runningSnapshot = nextRunningSnapshot
        this.dispatchEvent(new CustomEvent('changed'))
        if (runningChanged) this.dispatchEvent(new CustomEvent('runningChanged'))
    }
}

export const actionExecutionService = new ActionExecutionService()
