import { actionContextIdentity } from '../../data/action_context'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversation, AgentConversationEntry, AgentConversationEventEntry } from '../../data/data_types'
import type {
    AgentApproval,
    AgentApprovalDecision,
    AgentApprovalRequestId,
    AgentQuestion,
    ActionRunEvent,
    ActionRunStatus,
    ActionRunTerminalStatus,
    ActionRunUpdate,
    ActionRunInput,
    ActionRunLogEntry,
    ActionRunResult,
} from '../../data/action_run_types'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionService } from './action_service'
import { actionPromptDraftService } from './action_prompt_draft_service'
import { register } from '.././service_injector'

const TERMINAL_STATUSES = new Set<ActionRunTerminalStatus>(['cancelled', 'completed', 'failed', 'okButNotAfter'])
const ACTIVE_STATUSES = new Set<ActionRunStatus>(['queued', 'running', 'waitingForInput'])
const EMPTY_ACTIVE_RUNS: ActiveActionRun[] = []

export interface ActionRun {
    activeActionAutoFinish: ActionDefinition['autoFinish']
    activeActionId: string | null
    activeActionStreaming: boolean
    activeActionType: ActionDefinition['type'] | null
    conversation: AgentConversation | null
    context: ActionContext
    runId: string
    logs: ActionRunLogEntry[]
    approvals: LiveAgentApproval[]
    interactionReady: boolean
    question: LiveAgentQuestion | null
    reference: string | null
    rootActionId: string
    status: ActionRunStatus
}

export interface LiveAgentApproval extends AgentApproval {
    submitted: boolean
}

export interface LiveAgentQuestion {
    questions: AgentQuestion[]
    requestId: number | string | null
}

export interface ActiveActionRun {
    rootActionId: string
    runId: string
    status: ActionRunStatus
}

type EventListener = (event: ActionRunEvent) => void
type StoreListener = () => void

function actionName(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.label ?? actionId
}

function actionType(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.type ?? null
}

function actionStreaming(actionId: string) {
    return actionService.getActions().find((action) => action.id === actionId)?.streaming ?? false
}

function createLog(event: ActionRunEvent): ActionRunLogEntry {
    return {
        ...(event.type === 'action' && event.accessLevel ? { accessLevel: event.accessLevel } : {}),
        actionId: event.actionId,
        actionName: actionName(event.actionId),
        ...(event.type === 'action' && event.approvalPolicy ? { approvalPolicy: event.approvalPolicy } : {}),
        command: event.type === 'action' ? event.command ?? null : null,
        message: event.type === 'action' ? event.message ?? `${actionName(event.actionId)} ${event.status}` : `${actionName(event.actionId)} running`,
        phase: event.phase,
        status: event.status,
        stderr: '',
        stdout: '',
        ...(event.type === 'action' && event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
    }
}

function runningLogIndex(logs: ActionRunLogEntry[], event: ActionRunEvent) {
    return logs.findLastIndex((log) => (
        log.actionId === event.actionId
        && log.phase === event.phase
        && (log.status === 'queued' || log.status === 'running')
    ))
}

type AgentOutputUpdate = Pick<
    Extract<ActionRunUpdate, { kind: 'error' | 'output' }>,
    'content' | 'previousContent' | 'replace'
>

function updatedStdout(currentStdout: string, update: AgentOutputUpdate) {
    if (!update.replace) return `${currentStdout}${update.content}`
    if (update.previousContent === undefined) throw new Error('Missing previous assistant output')
    if (!currentStdout.endsWith(update.previousContent)) throw new Error('Assistant output replacement is out of order')

    return `${currentStdout.slice(0, currentStdout.length - update.previousContent.length)}${update.content}`
}

function updateActionLogs(logs: ActionRunLogEntry[], event: Extract<ActionRunEvent, { type: 'action' }>) {
    const currentIndex = runningLogIndex(logs, event)
    if (currentIndex < 0) return [...logs, createLog(event)]
    const current = logs[currentIndex]
    const next = [...logs]
    next[currentIndex] = {
        ...current,
        ...(event.accessLevel ? { accessLevel: event.accessLevel } : {}),
        ...(event.approvalPolicy ? { approvalPolicy: event.approvalPolicy } : {}),
        command: event.command ?? current.command,
        message: event.message ?? `${actionName(event.actionId)} ${event.status}`,
        status: event.status,
        ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
    }

    return next
}

function updateOutputLogs(
    logs: ActionRunLogEntry[],
    event: Extract<ActionRunEvent, { type: 'update' }>,
    update: Extract<ActionRunUpdate, { kind: 'error' | 'output' }>,
) {
    const currentIndex = logs.findLastIndex((log) => (
        log.actionId === event.actionId && log.phase === event.phase && log.status === 'running'
    ))
    const current = currentIndex >= 0 ? logs[currentIndex] : createLog(event)
    const updated = {
        ...current,
        command: update.command ?? current.command,
        stderr: update.kind === 'error' ? `${current.stderr}${update.content}` : current.stderr,
        stdout: update.kind === 'output' ? updatedStdout(current.stdout, update) : current.stdout,
    }
    if (currentIndex < 0) return [...logs, updated]
    const next = [...logs]
    next[currentIndex] = updated

    return next
}

function eventIdentity(event: AgentConversationEventEntry) {
    return event.providerItemId ?? event.id
}

function upsertAgentEvent(entries: AgentConversationEntry[], event: AgentConversationEventEntry) {
    const identity = eventIdentity(event)
    const currentIndex = entries.findIndex((entry) => entry.kind === 'event' && eventIdentity(entry) === identity)
    if (currentIndex < 0) return [...entries, event]

    const current = entries[currentIndex]
    const next = [...entries]
    next[currentIndex] = {
        ...event,
        ...(event.sequence === undefined && current.sequence !== undefined ? { sequence: current.sequence } : {}),
    }

    return next
}

function nextConversationSequence(conversation: AgentConversation) {
    const sequences = conversation.entries.map(({ sequence }) => sequence)
        .filter((sequence): sequence is number => sequence !== undefined)

    return sequences.length > 0 ? Math.max(...sequences) + 1 : undefined
}

function appendAssistantMessage(
    conversation: AgentConversation,
    update: { content: string, messageId?: string, replace?: boolean, sequence?: number },
) {
    const sequence = update.sequence ?? nextConversationSequence(conversation)
    const latestUserIndex = conversation.entries.findLastIndex((entry) => entry.kind === 'message' && entry.role === 'user')
    const currentAssistantMessage = conversation.entries.slice(latestUserIndex + 1)
        .findLast((entry) => entry.kind === 'message' && entry.role === 'assistant')
    const messageId = update.messageId
        ?? currentAssistantMessage?.id
        ?? `${conversation.id}-assistant-${sequence ?? conversation.entries.length + 1}`
    const currentIndex = conversation.entries.findIndex((entry) => entry.kind === 'message' && entry.id === messageId)
    const entries: AgentConversationEntry[] = currentIndex < 0
        ? [...conversation.entries, {
            content: update.content,
            id: messageId,
            kind: 'message',
            role: 'assistant' as const,
            ...(sequence !== undefined ? { sequence } : {}),
            timestamp: conversation.startedAt,
        }]
        : conversation.entries.map((entry, index) => index === currentIndex
            ? { ...entry, content: update.replace ? update.content : `${entry.content}${update.content}` }
            : entry)

    return { ...conversation, entries }
}

function conversationStatus(status: ActionRunStatus): AgentConversation['status'] {
    if (status === 'queued') return 'running'
    if (status === 'okButNotAfter') return 'completed'

    return status
}

function contextKey(context: ActionContext) {
    return actionContextIdentity(context)
}

export async function cancelActionRun(runId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Action cancellation requires Electron')

    await bridge.cancelActionRun(runId)
}

export async function sendActionMessage(runId: string, content: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.sendActionMessage) throw new Error('Streaming agent messaging requires Electron')

    await bridge.sendActionMessage(runId, content)
}

export async function answerActionQuestion(
    runId: string,
    requestId: number | string | null,
    answers: Record<string, string[]>,
) {
    const bridge = getElectronActionBridge()
    if (!bridge?.answerActionQuestion) throw new Error('Streaming agent questions require Electron')

    await bridge.answerActionQuestion(runId, requestId, answers)
}

export async function answerActionApproval(
    runId: string,
    requestId: AgentApprovalRequestId,
    decision: AgentApprovalDecision,
) {
    const bridge = getElectronActionBridge()
    if (!bridge?.answerActionApproval) throw new Error('Streaming agent approvals require Electron')

    await bridge.answerActionApproval(runId, requestId, decision)
}

export async function finishActionRun(runId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.finishActionRun) throw new Error('Finishing a streaming agent requires Electron')

    await bridge.finishActionRun(runId)
}

export async function notifyActionCardStateChange(cardInternalId: string | null, state: string) {
    if (!cardInternalId) return
    const bridge = getElectronActionBridge()
    if (!bridge?.notifyActionCardStateChange) throw new Error('Automatic agent finish requires Electron')

    await bridge.notifyActionCardStateChange(cardInternalId, state)
}

/** Stable state owner for one action run. */
export class ActionRunStore {
    private readonly listeners = new Set<StoreListener>()
    private readonly onReleased: (store: ActionRunStore) => void
    private snapshot: ActionRun

    constructor(snapshot: ActionRun, onReleased: (store: ActionRunStore) => void) {
        this.onReleased = onReleased
        this.snapshot = snapshot
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: StoreListener) => {
        this.listeners.add(listener)

        return () => {
            this.listeners.delete(listener)
            this.onReleased(this)
        }
    }

    hasConsumers() {
        return this.listeners.size > 0
    }

    update(snapshot: ActionRun) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}

function actionContextKey(actionId: string, context: ActionContext) {
    return `${actionId}\u0000${contextKey(context)}`
}

function activeRun(run: ActionRun): ActiveActionRun {
    return { rootActionId: run.rootActionId, runId: run.runId, status: run.status }
}

function sameActiveRuns(first: ActiveActionRun[], second: ActiveActionRun[]) {
    return first.length === second.length && first.every(({ runId, status }, index) => (
        second[index]?.runId === runId && second[index]?.status === status
    ))
}

function publishKey(map: Map<string, Set<StoreListener>>, key: string) {
    const listeners = map.get(key) ?? []
    for (const listener of listeners) listener()
}

function publishListeners(map: Map<string, Set<StoreListener>>) {
    for (const listeners of map.values()) {
        for (const listener of listeners) listener()
    }
}

/** Owns one renderer-wide bridge subscription and routes events to scoped run stores. */
export class ActionRunRegistry extends EventTarget {
    private readonly actionContextListeners = new Map<string, Set<StoreListener>>()
    private readonly actionContextStores = new Map<string, ActionRunStore>()
    private readonly activeRunEventListeners = new Set<EventListener>()
    private readonly contextActiveListeners = new Map<string, Set<StoreListener>>()
    private readonly contextActiveSnapshots = new Map<string, ActiveActionRun[]>()
    private readonly contextEventListeners = new Map<string, Set<EventListener>>()
    private eventSequences = new Map<string, number>()
    private readonly globalActiveListeners = new Set<StoreListener>()
    private globalActiveSnapshot: ActiveActionRun[] = EMPTY_ACTIVE_RUNS
    private recoveryEvents: ActionRunEvent[] | null = null
    private runs = new Map<string, ActionRunStore>()
    private subscribedBridge: ElectronActionBridge | null = null
    private startsInProgress = 0
    private readonly terminalResults = new Map<string, ActionRunResult>()
    private unsubscribeBridge: (() => void) | null = null
    private readonly waiters = new Map<string, Set<(result: ActionRunResult) => void>>()

    constructor() {
        super()
        register('actionRunRegistry', this)
    }

    start() {
        const bridge = getElectronActionBridge()
        if (!bridge) return
        if (this.unsubscribeBridge && bridge === this.subscribedBridge) return

        this.unsubscribeBridge?.()
        this.subscribedBridge = bridge
        this.recoveryEvents = bridge.loadActiveActionRunEvents ? [] : null
        this.unsubscribeBridge = bridge.onActionRun((event) => this.handleIncomingEvent(event))
        if (bridge.loadActiveActionRunEvents) void this.recoverActiveRuns(bridge)
    }

    stop() {
        this.unsubscribeBridge?.()
        this.subscribedBridge = null
        this.unsubscribeBridge = null
        this.eventSequences = new Map()
        this.recoveryEvents = null
        this.runs = new Map()
        this.actionContextStores.clear()
        this.contextActiveSnapshots.clear()
        this.publishGlobalActive([])
        publishListeners(this.actionContextListeners)
        publishListeners(this.contextActiveListeners)
    }

    getRunStore(runId: string) {
        return this.runs.get(runId) ?? null
    }

    getActionRunStore(actionId: string, context: ActionContext) {
        return this.getActionRunStoreByKey(actionId, contextKey(context))
    }

    getActionRunStoreByKey(actionId: string, contextIdentity: string) {
        return this.actionContextStores.get(`${actionId}\u0000${contextIdentity}`) ?? null
    }

    getContextActiveSnapshot(context: ActionContext) {
        return this.getContextActiveSnapshotByKey(contextKey(context))
    }

    getContextActiveSnapshotByKey(contextIdentity: string) {
        return this.contextActiveSnapshots.get(contextIdentity) ?? EMPTY_ACTIVE_RUNS
    }

    getGlobalActiveSnapshot = () => this.globalActiveSnapshot

    subscribeActionRun(actionId: string, context: ActionContext, listener: StoreListener) {
        return this.subscribeActionRunByKey(actionId, contextKey(context), listener)
    }

    subscribeActionRunByKey(actionId: string, contextIdentity: string, listener: StoreListener) {
        const key = `${actionId}\u0000${contextIdentity}`
        const unsubscribe = this.subscribeMap(this.actionContextListeners, key, listener)

        return () => {
            unsubscribe()
            const store = this.actionContextStores.get(key)
            if (store) this.releaseTerminalRun(store.getSnapshot().runId)
        }
    }

    subscribeContextActive(context: ActionContext, listener: StoreListener) {
        return this.subscribeContextActiveByKey(contextKey(context), listener)
    }

    subscribeContextActiveByKey(contextIdentity: string, listener: StoreListener) {
        return this.subscribeMap(this.contextActiveListeners, contextIdentity, listener)
    }

    subscribeContextEvents(context: ActionContext, listener: EventListener) {
        return this.subscribeMap(this.contextEventListeners, contextKey(context), listener)
    }

    subscribeActiveRunEvents(listener: EventListener) {
        this.activeRunEventListeners.add(listener)
        this.start()

        return () => this.activeRunEventListeners.delete(listener)
    }

    readonly subscribeGlobalActive = (listener: StoreListener) => {
        this.globalActiveListeners.add(listener)
        this.start()

        return () => this.globalActiveListeners.delete(listener)
    }

    async startRun(
        action: ActionDefinition,
        context: ActionContext,
        runInput: ActionRunInput = {},
        onStarted?: (runId: string) => void,
        interactive = true,
    ) {
        const bridge = getElectronActionBridge()
        if (!bridge) throw new Error('Action run requires Electron')
        this.start()
        const start = interactive ? bridge.startAction.bind(bridge) : bridge.startUnattendedAction?.bind(bridge)
        if (!start) throw new Error('Unattended action run requires Electron')
        this.startsInProgress += 1
        let runId: string
        try {
            runId = await start({ actionId: action.id, context, runInput })
        } finally {
            this.startsInProgress -= 1
        }
        onStarted?.(runId)

        return this.waitForRun(runId)
    }

    private waitForRun(runId: string): Promise<ActionRunResult> {
        const terminalResult = this.terminalResults.get(runId)
        if (terminalResult) {
            this.terminalResults.delete(runId)

            return Promise.resolve(terminalResult)
        }
        const current = this.runs.get(runId)?.getSnapshot()
        if (current && TERMINAL_STATUSES.has(current.status as ActionRunTerminalStatus)) {
            const result = { logs: current.logs, status: current.status as ActionRunTerminalStatus }
            this.releaseTerminalRun(runId)

            return Promise.resolve(result)
        }

        return new Promise((resolve) => {
            const waiters = this.waiters.get(runId) ?? new Set()
            waiters.add(resolve)
            this.waiters.set(runId, waiters)
        })
    }

    private async recoverActiveRuns(bridge: ElectronActionBridge) {
        try {
            const events = await bridge.loadActiveActionRunEvents?.() ?? []
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

    private handleIncomingEvent(event: ActionRunEvent) {
        if (this.recoveryEvents) {
            this.recoveryEvents.push(event)
            return
        }

        this.handleEvent(event)
    }

    private handleEvent(event: ActionRunEvent) {
        if (event.sequence !== undefined) {
            const currentSequence = this.eventSequences.get(event.runId) ?? 0
            if (event.sequence <= currentSequence) return
            this.eventSequences.set(event.runId, event.sequence)
        }
        const store = this.runs.get(event.runId)
        const current = store?.getSnapshot() ?? {
            activeActionAutoFinish: null,
            activeActionId: null,
            activeActionStreaming: false,
            activeActionType: null,
            conversation: null,
            approvals: [],
            context: event.context,
            runId: event.runId,
            logs: [],
            interactionReady: false,
            question: null,
            reference: null,
            rootActionId: event.rootActionId,
            status: 'running' as const,
        }
        let next = { ...current, context: event.context, rootActionId: event.rootActionId }
        if (event.type === 'run') next = { ...next, status: event.status }
        if (event.type === 'run' && TERMINAL_STATUSES.has(event.status as ActionRunTerminalStatus)) {
            next = { ...next, approvals: [], question: null }
            actionPromptDraftService.clearRunDrafts(event.runId)
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
            if (!active) actionPromptDraftService.clearRunDraft(event.runId, event.actionId)
        }
        if (event.type === 'agentState') {
            next = {
                ...next,
                activeActionAutoFinish: event.autoFinish ?? null,
                activeActionId: event.actionId,
                activeActionStreaming: event.streaming ?? actionStreaming(event.actionId),
                activeActionType: event.actionType ?? actionType(event.actionId),
                conversation: next.conversation
                    ? { ...next.conversation, completedAt: null, status: event.status }
                    : null,
                interactionReady: event.interactionReady ?? true,
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentStarted') {
            const { continued } = event.update
            next = { ...next, conversation: event.update.conversation }
            if (continued) actionPromptDraftService.clearRunDraft(event.runId, event.actionId)
        }
        if (event.type === 'update' && event.update.kind === 'agentClosed') {
            next = { ...next, conversation: event.update.conversation }
        }
        if (event.type === 'update' && event.update.kind === 'agentEvent' && next.conversation) {
            next = {
                ...next,
                conversation: {
                    ...next.conversation,
                    entries: upsertAgentEvent(next.conversation.entries, event.update.event),
                },
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentQuestion') {
            next = { ...next, question: { questions: event.update.questions, requestId: event.update.requestId } }
        }
        if (event.type === 'update' && event.update.kind === 'agentApproval') {
            const requestId = event.update.approval.requestId
            const approvals = next.approvals.filter((approval) => approval.requestId !== requestId)
            next = { ...next, approvals: [...approvals, { ...event.update.approval, submitted: false }] }
        }
        if (event.type === 'update' && event.update.kind === 'agentApprovalSubmitted') {
            const { requestId } = event.update
            next = {
                ...next,
                approvals: next.approvals.map((approval) => approval.requestId === requestId
                    ? { ...approval, submitted: true }
                    : approval),
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentApprovalResolved') {
            const { requestId } = event.update
            next = { ...next, approvals: next.approvals.filter((approval) => approval.requestId !== requestId) }
        }
        if (
            event.type === 'update'
            && (event.update.kind === 'agentUserMessage' || event.update.kind === 'agentQuestionAnswer')
            && next.conversation
        ) {
            next = {
                ...next,
                conversation: {
                    ...next.conversation,
                    entries: [...next.conversation.entries, event.update.userMessage],
                },
                question: null,
            }
            if (event.update.kind === 'agentUserMessage') {
                actionPromptDraftService.clearRunDraft(event.runId, event.actionId)
            }
        }
        if (event.type === 'update' && (event.update.kind === 'output' || event.update.kind === 'error')) {
            const conversation = event.update.kind === 'output' && next.conversation
                ? appendAssistantMessage(next.conversation, event.update)
                : next.conversation
            next = { ...next, conversation, logs: updateOutputLogs(next.logs, event, event.update) }
        }
        if (event.type === 'update' && event.update.kind !== 'agentClosed' && next.conversation) {
            next = {
                ...next,
                conversation: { ...next.conversation, status: conversationStatus(event.status) },
            }
        }
        const nextStore = store ?? new ActionRunStore(next, (releasedStore) => this.handleStoreReleased(releasedStore))
        if (!store) {
            this.runs.set(event.runId, nextStore)
            const bindingKey = actionContextKey(event.rootActionId, event.context)
            this.actionContextStores.set(bindingKey, nextStore)
            publishKey(this.actionContextListeners, bindingKey)
        } else nextStore.update(next)

        this.publishActiveIndexes(contextKey(current.context), contextKey(next.context))
        this.publishScopedEvents(event)
        if (event.type === 'run' && TERMINAL_STATUSES.has(event.status as ActionRunTerminalStatus)) {
            this.resolveWaiters(next)
            this.releaseTerminalRun(event.runId)
        }
    }

    private publishActiveIndexes(previousContextKey: string, nextContextKey: string) {
        const affectedContextKeys = new Set([previousContextKey, nextContextKey])
        for (const affectedContextKey of affectedContextKeys) {
            const nextSnapshot = [...this.runs.values()]
                .map((store) => store.getSnapshot())
                .filter((run) => contextKey(run.context) === affectedContextKey && ACTIVE_STATUSES.has(run.status))
                .map(activeRun)
            const currentSnapshot = this.contextActiveSnapshots.get(affectedContextKey) ?? []
            if (sameActiveRuns(currentSnapshot, nextSnapshot)) continue

            if (nextSnapshot.length > 0) this.contextActiveSnapshots.set(affectedContextKey, nextSnapshot)
            else this.contextActiveSnapshots.delete(affectedContextKey)
            publishKey(this.contextActiveListeners, affectedContextKey)
        }
        const nextGlobalSnapshot = [...this.runs.values()]
            .map((store) => store.getSnapshot())
            .filter((run) => ACTIVE_STATUSES.has(run.status))
            .map(activeRun)
        if (!sameActiveRuns(this.globalActiveSnapshot, nextGlobalSnapshot)) this.publishGlobalActive(nextGlobalSnapshot)
    }

    private publishScopedEvents(event: ActionRunEvent) {
        const listeners = this.contextEventListeners.get(contextKey(event.context)) ?? []
        for (const listener of listeners) listener(event)
        for (const listener of this.activeRunEventListeners) listener(event)
    }

    private resolveWaiters(run: ActionRun) {
        const waiters = this.waiters.get(run.runId)
        this.waiters.delete(run.runId)
        const result = { logs: run.logs, status: run.status as ActionRunTerminalStatus }
        if (!waiters && this.startsInProgress > 0) this.terminalResults.set(run.runId, result)
        for (const resolve of waiters ?? []) resolve(result)
    }

    private handleStoreReleased(store: ActionRunStore) {
        const { runId, status } = store.getSnapshot()
        if (TERMINAL_STATUSES.has(status as ActionRunTerminalStatus)) this.releaseTerminalRun(runId)
    }

    private releaseTerminalRun(runId: string) {
        const store = this.runs.get(runId)
        if (!store || store.hasConsumers() || this.waiters.has(runId)) return

        const run = store.getSnapshot()
        const bindingKey = actionContextKey(run.rootActionId, run.context)
        if ((this.actionContextListeners.get(bindingKey)?.size ?? 0) > 0) return

        this.runs.delete(runId)
        this.eventSequences.delete(runId)
        if (this.actionContextStores.get(bindingKey) === store) {
            this.actionContextStores.delete(bindingKey)
            publishKey(this.actionContextListeners, bindingKey)
        }
    }

    private subscribeMap<T>(map: Map<string, Set<T>>, key: string, listener: T) {
        const listeners = map.get(key) ?? new Set<T>()
        listeners.add(listener)
        map.set(key, listeners)
        this.start()

        return () => {
            listeners.delete(listener)
            if (listeners.size === 0) map.delete(key)
        }
    }

    private publishGlobalActive(snapshot: ActiveActionRun[]) {
        this.globalActiveSnapshot = snapshot
        for (const listener of this.globalActiveListeners) listener()
    }
}

export const actionRunRegistry = new ActionRunRegistry()
