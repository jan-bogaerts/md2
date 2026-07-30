import { actionContextIdentity } from '../../data/action_context'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversationEvent, AgentConversationMessage } from '../../data/data_types'
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
    activities: AgentConversationEvent[]
    conversationId: string
    currentAssistantMessageId?: string
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
    pending: Promise<void>
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
    return logs.findLastIndex((log) => (
        log.actionId === event.actionId
        && log.phase === event.phase
        && (log.status === 'queued' || log.status === 'running')
    ))
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

function activityIdentity(activity: AgentConversationEvent) {
    return activity.providerItemId ?? activity.id
}

function upsertAgentActivity(activities: AgentConversationEvent[], activity: AgentConversationEvent) {
    const identity = activityIdentity(activity)
    const currentIndex = activities.findIndex((current) => activityIdentity(current) === identity)
    if (currentIndex < 0) return [...activities, activity]

    const current = activities[currentIndex]
    const next = [...activities]
    next[currentIndex] = {
        ...activity,
        ...(activity.sequence === undefined && current.sequence !== undefined ? { sequence: current.sequence } : {}),
    }

    return next
}

function nextConversationSequence(turn: LiveAgentTurn) {
    const sequences = [
        ...turn.messages.map(({ sequence }) => sequence),
        ...turn.activities.map(({ sequence }) => sequence),
    ].filter((sequence): sequence is number => sequence !== undefined)

    return sequences.length > 0 ? Math.max(...sequences) + 1 : undefined
}

function appendAssistantMessage(
    turn: LiveAgentTurn,
    update: { content: string, messageId?: string, sequence?: number },
) {
    const sequence = update.sequence ?? nextConversationSequence(turn)
    const messageId = update.messageId
        ?? turn.currentAssistantMessageId
        ?? `${turn.conversationId}-assistant-${sequence ?? turn.messages.length + 1}`
    const currentIndex = turn.messages.findIndex(({ id }) => id === messageId)
    const messages = currentIndex < 0
        ? [...turn.messages, {
            content: update.content,
            id: messageId,
            role: 'assistant' as const,
            ...(sequence !== undefined ? { sequence } : {}),
            timestamp: turn.startedAt,
        }]
        : turn.messages.map((message, index) => index === currentIndex
            ? { ...message, content: `${message.content}${update.content}` }
            : message)

    return { ...turn, currentAssistantMessageId: messageId, messages }
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
    if (execution) return executionPromptDraftKey(execution.executionId, execution.activeActionId ?? actionId)

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

export async function beginActionPromptDraft(executionId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.beginActionPromptDraft) throw new Error('Agent prompt queue requires Electron')

    return bridge.beginActionPromptDraft(executionId)
}

export async function setActionQueuedMessageForSession(executionId: string, sessionId: number, content: string, revision: number) {
    const bridge = getElectronActionBridge()
    if (!bridge?.setActionQueuedMessage) throw new Error('Agent prompt queue requires Electron')

    const result = await bridge.setActionQueuedMessage(executionId, sessionId, content, revision)
    if (!result.accepted) throw new Error('Queued agent prompt was superseded')
}

export async function sendActionQueuedMessage(executionId: string, sessionId: number, revision: number) {
    const bridge = getElectronActionBridge()
    if (!bridge?.sendActionQueuedMessage) throw new Error('Sending queued agent prompt requires Electron')

    const result = await bridge.sendActionQueuedMessage(executionId, sessionId, revision)
    if (!result.sent) throw new Error('Queued agent prompt was not sent')
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
    private eventSequences = new Map<string, number>()
    private executions = new Map<string, LiveActionExecution>()
    private promptDrafts = new Map<string, PromptDraft>()
    private promptDraftSessions = new Map<string, Promise<number>>()
    private runningSnapshot: LiveActionExecution[] = []
    private recoveryEvents: ActionExecutionEvent[] | null = null
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
        this.recoveryEvents = bridge.loadActiveActionExecutionEvents ? [] : null
        this.unsubscribeBridge = bridge.onActionExecution((event) => this.handleIncomingEvent(event))
        if (bridge.loadActiveActionExecutionEvents) void this.recoverActiveExecutions(bridge)
    }

    stop() {
        this.unsubscribeBridge?.()
        this.subscribedBridge = null
        this.unsubscribeBridge = null
        this.eventListeners.clear()
        this.eventSequences = new Map()
        this.executions = new Map()
        this.promptDrafts = new Map()
        this.promptDraftSessions = new Map()
        this.recoveryEvents = null
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
        const runningExecution = this.getRunningExecutionForContext(context)
        const execution = runningExecution?.rootActionId === actionId ? runningExecution : null
        const key = promptDraftKey(actionId, context, execution)

        return this.promptDrafts.get(key)?.value ?? ''
    }

    async setPromptDraft(actionId: string, context: ActionContext, value: string) {
        const runningExecution = this.getRunningExecutionForContext(context)
        const execution = runningExecution?.rootActionId === actionId ? runningExecution : null
        const key = promptDraftKey(actionId, context, execution)
        const previous = this.promptDrafts.get(key)
        const revision = (previous?.revision ?? -1) + 1
        const pending = (previous?.pending ?? Promise.resolve()).catch(() => undefined).then(async () => {
            if (!execution?.interactionReady || execution.activeActionType !== 'agent' || !execution.activeActionId) return

            const sessionId = await this.getPromptDraftSession(execution.executionId, execution.activeActionId)
            await setActionQueuedMessageForSession(execution.executionId, sessionId, value, revision)
        })
        const draft = { pending, revision, value }
        this.promptDrafts.set(key, draft)
        this.dispatchEvent(new CustomEvent('changed'))

        await pending
    }

    async sendPromptDraft(actionId: string, context: ActionContext) {
        const runningExecution = this.getRunningExecutionForContext(context)
        const execution = runningExecution?.rootActionId === actionId ? runningExecution : null
        if (!execution?.activeActionId) throw new Error('Action execution has no active agent')
        const key = promptDraftKey(actionId, context, execution)
        const draft = this.promptDrafts.get(key)
        if (!draft || draft.value.trim().length === 0) throw new Error('Queued agent prompt is empty')

        await draft.pending
        const sessionId = await this.getPromptDraftSession(execution.executionId, execution.activeActionId)
        await sendActionQueuedMessage(execution.executionId, sessionId, draft.revision)
    }

    clearPromptDraft(actionId: string, context: ActionContext) {
        const runningExecution = this.getRunningExecutionForContext(context)
        const execution = runningExecution?.rootActionId === actionId ? runningExecution : null
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

    private async recoverActiveExecutions(bridge: ElectronActionBridge) {
        try {
            const events = await bridge.loadActiveActionExecutionEvents?.() ?? []
            if (this.subscribedBridge !== bridge || !this.recoveryEvents) return
            const recoveryEvents = this.recoveryEvents
            this.recoveryEvents = null
            for (const event of events) this.handleEvent(event)
            for (const event of recoveryEvents) this.handleEvent(event)
        } catch (error) {
            if (this.subscribedBridge !== bridge) return
            const recoveryEvents = this.recoveryEvents ?? []
            this.recoveryEvents = null
            for (const event of recoveryEvents) this.handleEvent(event)
            this.dispatchEvent(new CustomEvent('recoveryFailed', { detail: error }))
        }
    }

    private handleIncomingEvent(event: ActionExecutionEvent) {
        if (this.recoveryEvents) {
            this.recoveryEvents.push(event)
            return
        }

        this.handleEvent(event)
    }

    private handleEvent(event: ActionExecutionEvent) {
        if (event.sequence !== undefined) {
            const currentSequence = this.eventSequences.get(event.executionId) ?? 0
            if (event.sequence <= currentSequence) return
            this.eventSequences.set(event.executionId, event.sequence)
        }
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
            const active = event.status === 'queued' || event.status === 'running'
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
            if (active) next.status = event.status
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
                agentTurn: {
                    activities: [],
                    conversationId,
                    messages: [userMessage],
                    reference,
                    startedAt,
                    title,
                },
            }
            if (continued) this.clearExecutionPromptDraft(event.executionId, event.actionId)
        }
        if (event.type === 'update' && event.update.kind === 'agentActivity' && next.agentTurn) {
            next = {
                ...next,
                agentTurn: {
                    ...next.agentTurn,
                    activities: upsertAgentActivity(next.agentTurn.activities, event.update.activity),
                },
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentQuestion') {
            next = { ...next, question: { questions: event.update.questions, requestId: event.update.requestId } }
        }
        if (
            event.type === 'update'
            && (event.update.kind === 'agentUserMessage' || event.update.kind === 'agentQuestionAnswer')
            && next.agentTurn
        ) {
            next = {
                ...next,
                agentTurn: {
                    ...next.agentTurn,
                    currentAssistantMessageId: undefined,
                    messages: [...next.agentTurn.messages, event.update.userMessage],
                },
                question: null,
            }
            if (event.update.kind === 'agentUserMessage') {
                this.clearExecutionPromptDraft(event.executionId, event.actionId)
            }
        }
        if (event.type === 'update' && (event.update.kind === 'output' || event.update.kind === 'error')) {
            const agentTurn = event.update.kind === 'output' && next.agentTurn
                ? appendAssistantMessage(next.agentTurn, event.update)
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
        this.promptDraftSessions.delete(executionPromptDraftKey(executionId, actionId))
        this.dispatchEvent(new CustomEvent('promptDraftCleared', { detail: { actionId, executionId } }))
    }

    private clearExecutionPromptDrafts(executionId: string) {
        const prefix = `execution\u0000${executionId}\u0000`
        for (const key of this.promptDrafts.keys()) {
            if (key.startsWith(prefix)) this.promptDrafts.delete(key)
        }
        for (const key of this.promptDraftSessions.keys()) {
            if (key.startsWith(prefix)) this.promptDraftSessions.delete(key)
        }
    }

    private getPromptDraftSession(executionId: string, actionId: string) {
        const key = executionPromptDraftKey(executionId, actionId)
        const current = this.promptDraftSessions.get(key)
        if (current) return current

        const session = beginActionPromptDraft(executionId)
        this.promptDraftSessions.set(key, session)

        return session
    }

    private publish() {
        this.snapshot = { executions: [...this.executions.values()] }
        const nextRunningSnapshot = this.snapshot.executions.filter(({ status }) => (
            status === 'queued' || status === 'running' || status === 'waitingForInput'
        ))
        const runningChanged = nextRunningSnapshot.length !== this.runningSnapshot.length
            || nextRunningSnapshot.some(({ executionId, status }, index) => (
                this.runningSnapshot[index]?.executionId !== executionId
                || this.runningSnapshot[index]?.status !== status
            ))
        this.runningSnapshot = nextRunningSnapshot
        this.dispatchEvent(new CustomEvent('changed'))
        if (runningChanged) this.dispatchEvent(new CustomEvent('runningChanged'))
    }
}

export const actionExecutionService = new ActionExecutionService()
