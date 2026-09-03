import { actionContextIdentity } from '../../data/action_context'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversation, AgentConversationEntry, AgentConversationEventEntry } from '../../data/data_types'
import type {
    ActionQueuedPrompt,
    AgentApproval,
    AgentApprovalDecision,
    AgentApprovalRequestId,
    AgentConversationReservation,
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
import type {
    ActionRunRecoverySnapshot,
    ActionRunRecoveryTerminalResult,
    ElectronActionBridge,
} from '../../data/electron_action_bridge'
import { actionService } from './action_service'
import { actionPromptDraftService } from './action_prompt_draft_service'
import { dialogService } from '../dialog_service'
import { getService, register } from '../service_injector'
import { projectAccessService } from '../project/project_access_service'
import type { DataService } from '../data/data_service'

const TERMINAL_STATUSES = new Set<ActionRunTerminalStatus>(['cancelled', 'completed', 'failed', 'okButNotAfter'])
const ACTIVE_STATUSES = new Set<ActionRunStatus>(['queued', 'running', 'waitingForInput'])
const EMPTY_ACTIVE_RUNS: ActiveActionRun[] = []
const EMPTY_ACTION_RUN_STORES: ActionRunStore[] = []
const LOST_DURING_RECONNECTION_FAILURE = 'Action run state was lost during reconnection'

export interface ActionRun {
    activeActionAutoFinish: ActionDefinition['autoFinish']
    activeActionId: string | null
    activeActionStreaming: boolean
    activeActionType: ActionDefinition['type'] | null
    changedPaths: string[]
    diagramPath: string | null
    conversation: AgentConversation | null
    conversationChange: ActionConversationChange | null
    context: ActionContext
    runId: string
    logs: ActionRunLogEntry[]
    approvals: LiveAgentApproval[]
    interactionReady: boolean
    question: LiveAgentQuestion | null
    queuedPrompts: ActionQueuedPrompt[]
    reference: string | null
    rootActionId: string
    status: ActionRunStatus
}

export type ActionConversationChange = {
    entryIndex: number
    kind: 'entry'
} | {
    kind: 'replace'
}

export interface LiveAgentApproval extends AgentApproval {
    submitted: boolean
}

export interface LiveAgentQuestion {
    questions: AgentQuestion[]
    requestId: number | string | null
}

export interface ActiveActionRun {
    context: ActionContext
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

function applyTerminalCardChangedFiles(context: ActionContext, changedPaths: string[]) {
    if (changedPaths.length === 0) return
    if ((context.kind !== 'card' && context.kind !== 'file') || !context.cardInternalId || !context.file) return

    try {
        getService<DataService>('dataService').cards.addCardChangedFiles(context.cardInternalId, context.file, changedPaths)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: `Changed files update failed: ${context.file}` })
    }
}

function createLog(event: ActionRunEvent): ActionRunLogEntry {
    return {
        actionId: event.actionId,
        actionName: actionName(event.actionId),
        command: event.type === 'action' ? event.command ?? null : null,
        message: event.type === 'action' ? event.message ?? `${actionName(event.actionId)} ${event.status}` : `${actionName(event.actionId)} running`,
        phase: event.phase,
        ...(event.type === 'action' && event.permissionMode ? { permissionMode: event.permissionMode } : {}),
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
    Extract<ActionRunUpdate, { kind: 'agentOutput' }>,
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
        command: event.command ?? current.command,
        message: event.message ?? `${actionName(event.actionId)} ${event.status}`,
        ...(event.permissionMode ? { permissionMode: event.permissionMode } : {}),
        status: event.status,
        ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
    }

    return next
}

function updateOutputLogs(
    logs: ActionRunLogEntry[],
    event: Extract<ActionRunEvent, { type: 'update' }>,
    update: Extract<ActionRunUpdate, { kind: 'agentOutput' | 'error' | 'output' }>,
) {
    const currentIndex = logs.findLastIndex((log) => (
        log.actionId === event.actionId && log.phase === event.phase && log.status === 'running'
    ))
    const current = currentIndex >= 0 ? logs[currentIndex] : createLog(event)
    const updated = {
        ...current,
        command: ('command' in update ? update.command : undefined) ?? current.command,
        stderr: update.kind === 'error' ? `${current.stderr}${update.content}` : current.stderr,
        stdout: update.kind === 'agentOutput' || update.kind === 'output'
            ? updatedStdout(current.stdout, update)
            : current.stdout,
    }
    if (currentIndex < 0) return [...logs, updated]
    const next = [...logs]
    next[currentIndex] = updated

    return next
}

function eventIdentity(event: AgentConversationEventEntry) {
    return event.providerItemId ?? event.id
}

function requireEntryIndex(entryIndex: number, entries: AgentConversationEntry[], allowAppend: boolean) {
    if (!Number.isSafeInteger(entryIndex) || entryIndex < 0) throw new Error(`Invalid conversation entry index: ${entryIndex}`)
    const maximumIndex = allowAppend ? entries.length : entries.length - 1
    if (entryIndex > maximumIndex) throw new Error(`Conversation entry index out of range: ${entryIndex}`)
}

function updateAgentEventAtIndex(
    entries: AgentConversationEntry[],
    entryIndex: number,
    event: AgentConversationEventEntry,
) {
    requireEntryIndex(entryIndex, entries, true)
    if (entryIndex === entries.length) return [...entries, event]

    const current = entries[entryIndex]
    if (current.kind !== 'event' || eventIdentity(current) !== eventIdentity(event)) {
        throw new Error(`Provider event identity mismatch at conversation entry index ${entryIndex}`)
    }
    const next = [...entries]
    next[entryIndex] = {
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

    return { conversation: { ...conversation, entries }, entryIndex: currentIndex < 0 ? entries.length - 1 : currentIndex }
}

function updateAgentOutputAtIndex(
    conversation: AgentConversation,
    update: Extract<ActionRunUpdate, { kind: 'agentOutput' }>,
) {
    requireEntryIndex(update.entryIndex, conversation.entries, true)
    if (update.entryIndex === conversation.entries.length) {
        const message: AgentConversationEntry = {
            content: update.content,
            id: update.messageId,
            kind: 'message',
            role: 'assistant',
            sequence: update.sequence,
            timestamp: conversation.startedAt,
        }

        return { ...conversation, entries: [...conversation.entries, message] }
    }

    const current = conversation.entries[update.entryIndex]
    if (current.kind !== 'message' || current.id !== update.messageId) {
        throw new Error(`Assistant message identity mismatch at conversation entry index ${update.entryIndex}`)
    }
    if (current.sequence !== undefined && current.sequence !== update.sequence) {
        throw new Error(`Assistant message sequence mismatch at conversation entry index ${update.entryIndex}`)
    }
    const entries = [...conversation.entries]
    entries[update.entryIndex] = {
        ...current,
        content: update.replace ? update.content : `${current.content}${update.content}`,
    }

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

export async function deleteActionQueuedPrompt(runId: string, promptId: string, revision: number) {
    const bridge = getElectronActionBridge()
    if (!bridge?.deleteActionQueuedPrompt) throw new Error('Deleting queued agent prompts requires Electron')

    await bridge.deleteActionQueuedPrompt(runId, promptId, revision)
}

export async function editActionQueuedPrompt(runId: string, promptId: string, revision: number, content: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.editActionQueuedPrompt) throw new Error('Editing queued agent prompts requires Electron')

    await bridge.editActionQueuedPrompt(runId, promptId, revision, content)
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

export async function dismissActionQuestions(runId: string, requestId: number | string | null) {
    const bridge = getElectronActionBridge()
    if (!bridge?.dismissActionQuestions) throw new Error('Dismissing streaming agent questions requires Electron')

    await bridge.dismissActionQuestions(runId, requestId)
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

function runEventType(runId: string) {
    return `run:${runId}`
}

function activeRun(run: ActionRun): ActiveActionRun {
    return { context: run.context, rootActionId: run.rootActionId, runId: run.runId, status: run.status }
}

function sameActiveRuns(first: ActiveActionRun[], second: ActiveActionRun[]) {
    return first.length === second.length && first.every(({ context, runId, status }, index) => (
        second[index]?.runId === runId
        && second[index]?.status === status
        && Object.keys(context).length === Object.keys(second[index].context).length
        && Object.entries(context).every(([key, value]) => second[index].context[key] === value)
    ))
}

function conversationPickerMetadataChanged(previous: ActionRun['conversation'], current: ActionRun['conversation']) {
    return previous?.actionId !== current?.actionId
        || previous?.cardInternalId !== current?.cardInternalId
        || previous?.hasExplicitTitle !== current?.hasExplicitTitle
        || previous?.id !== current?.id
        || previous?.path !== current?.path
        || previous?.startedAt !== current?.startedAt
        || previous?.title !== current?.title
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

function byRunSequence(events: ActionRunEvent[]) {
    const eventsByRun = new Map<string, ActionRunEvent[]>()
    for (const event of events) {
        const runEvents = eventsByRun.get(event.runId) ?? []
        runEvents.push(event)
        eventsByRun.set(event.runId, runEvents)
    }

    return [...eventsByRun.values()].flatMap((runEvents) => runEvents.sort((first, second) => (
        (first.sequence ?? Number.MAX_SAFE_INTEGER) - (second.sequence ?? Number.MAX_SAFE_INTEGER)
    )))
}

/** Owns one renderer-wide bridge subscription and routes events to scoped run stores. */
export class ActionRunRegistry extends EventTarget {
    private readonly actionContextListeners = new Map<string, Set<StoreListener>>()
    private readonly actionContextStores = new Map<string, ActionRunStore[]>()
    private readonly activeRunEventListeners = new Set<EventListener>()
    private readonly contextActiveListeners = new Map<string, Set<StoreListener>>()
    private readonly contextActiveSnapshots = new Map<string, ActiveActionRun[]>()
    private readonly contextEventListeners = new Map<string, Set<EventListener>>()
    private eventSequences = new Map<string, number>()
    private readonly globalActiveListeners = new Set<StoreListener>()
    private globalActiveSnapshot: ActiveActionRun[] = EMPTY_ACTIVE_RUNS
    private recoveryEvents: ActionRunEvent[] | null = null
    private runContexts = new Map<string, ActionContext>()
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
        this.recoveryEvents = bridge.loadActionRunRecoverySnapshot ? [] : null
        this.unsubscribeBridge = bridge.onActionRun((event) => this.handleIncomingEvent(event))
        if (bridge.loadActionRunRecoverySnapshot) void this.recoverActiveRuns(bridge, this.rendererRunIds())
    }

    /** Reconcile renderer-owned runs after the current bridge reconnects. */
    async recoverConnection() {
        const bridge = this.subscribedBridge
        if (!bridge?.loadActionRunRecoverySnapshot || this.recoveryEvents) return

        this.recoveryEvents = []
        await this.recoverActiveRuns(bridge, this.rendererRunIds())
    }

    stop() {
        const runIds = [...this.runs.keys()]
        this.unsubscribeBridge?.()
        this.subscribedBridge = null
        this.unsubscribeBridge = null
        this.eventSequences = new Map()
        this.recoveryEvents = null
        this.runContexts = new Map()
        this.runs = new Map()
        this.actionContextStores.clear()
        this.contextActiveSnapshots.clear()
        this.publishGlobalActive([])
        publishListeners(this.actionContextListeners)
        publishListeners(this.contextActiveListeners)
        for (const runId of runIds) this.dispatchEvent(new Event(runEventType(runId)))
    }

    getRunStore(runId: string) {
        return this.runs.get(runId) ?? null
    }

    getActionRunStore(actionId: string, context: ActionContext) {
        return this.getActionRunStoreByKey(actionId, contextKey(context))
    }

    getActionRunStoreByKey(actionId: string, contextIdentity: string) {
        return this.actionContextStores.get(`${actionId}\u0000${contextIdentity}`)?.at(-1) ?? null
    }

    getActionRunStores(actionId: string, context: ActionContext) {
        return this.getActionRunStoresByKey(actionId, contextKey(context))
    }

    getActionRunStoresByKey(actionId: string, contextIdentity: string) {
        return this.actionContextStores.get(`${actionId}\u0000${contextIdentity}`) ?? EMPTY_ACTION_RUN_STORES
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
        return this.subscribeMap(this.actionContextListeners, key, listener)
    }

    subscribeRun(runId: string, listener: StoreListener) {
        let unsubscribeStore = this.runs.get(runId)?.subscribe(listener) ?? null
        const handleStoreChanged = () => {
            unsubscribeStore?.()
            unsubscribeStore = this.runs.get(runId)?.subscribe(listener) ?? null
            listener()
        }
        const eventType = runEventType(runId)
        this.addEventListener(eventType, handleStoreChanged)
        this.start()

        return () => {
            this.removeEventListener(eventType, handleStoreChanged)
            unsubscribeStore?.()
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
        conversationReservation?: AgentConversationReservation,
    ) {
        projectAccessService.requireWritable()
        const bridge = getElectronActionBridge()
        if (!bridge) throw new Error('Action run requires Electron')
        this.start()
        const start = interactive ? bridge.startAction.bind(bridge) : bridge.startUnattendedAction?.bind(bridge)
        if (!start) throw new Error('Unattended action run requires Electron')
        this.startsInProgress += 1
        let runId: string
        try {
            runId = await start({ actionId: action.id, ...(conversationReservation ? { conversationReservation } : {}), context, runInput })
        } finally {
            this.startsInProgress -= 1
        }
        onStarted?.(runId)
        if (!this.terminalResults.has(runId)) this.runContexts.set(runId, context)

        return this.waitForRun(runId)
    }

    async restartRun(
        previousRunId: string,
        action: ActionDefinition,
        context: ActionContext,
        runInput: ActionRunInput,
        onStarted?: (runId: string) => void,
    ) {
        projectAccessService.requireWritable()
        const bridge = getElectronActionBridge()
        if (!bridge?.restartActionRun) throw new Error('Restarting an action run requires Electron')
        this.start()
        this.startsInProgress += 1
        let runId: string
        try {
            runId = await bridge.restartActionRun(previousRunId, { actionId: action.id, context, runInput })
        } finally {
            this.startsInProgress -= 1
            this.terminalResults.delete(previousRunId)
        }
        onStarted?.(runId)
        if (!this.terminalResults.has(runId)) this.runContexts.set(runId, context)

        return this.waitForRun(runId)
    }

    private waitForRun(runId: string): Promise<ActionRunResult> {
        const terminalResult = this.terminalResults.get(runId)
        if (terminalResult) {
            this.terminalResults.delete(runId)
            this.releaseTerminalRun(runId)

            return Promise.resolve(terminalResult)
        }
        const current = this.runs.get(runId)?.getSnapshot()
        if (current && TERMINAL_STATUSES.has(current.status as ActionRunTerminalStatus)) {
            const result = {
                changedPaths: current.changedPaths,
                ...(current.diagramPath ? { diagramPath: current.diagramPath } : {}),
                logs: current.logs,
                status: current.status as ActionRunTerminalStatus,
            }
            this.releaseTerminalRun(runId)

            return Promise.resolve(result)
        }

        return new Promise((resolve) => {
            const waiters = this.waiters.get(runId) ?? new Set()
            waiters.add(resolve)
            this.waiters.set(runId, waiters)
        })
    }

    private async recoverActiveRuns(bridge: ElectronActionBridge, rendererRunIds: string[]) {
        try {
            const snapshot = await bridge.loadActionRunRecoverySnapshot?.(rendererRunIds)
                ?? { activeRunEvents: [], terminalResults: [] }
            if (this.subscribedBridge !== bridge || !this.recoveryEvents) return
            const recoveryEvents = this.recoveryEvents
            this.recoveryEvents = null
            this.applyRecoverySnapshot(rendererRunIds, snapshot, recoveryEvents)
        } catch (error) {
            if (this.subscribedBridge !== bridge) return
            const recoveryEvents = this.recoveryEvents ?? []
            this.recoveryEvents = null
            for (const event of byRunSequence(recoveryEvents)) this.handleEvent(event)
            this.dispatchEvent(new CustomEvent('recoveryFailed', { detail: error }))
        }
    }

    private rendererRunIds() {
        const rendererRunIds = new Set(this.waiters.keys())
        for (const [runId, store] of this.runs) {
            if (ACTIVE_STATUSES.has(store.getSnapshot().status)) rendererRunIds.add(runId)
        }

        return [...rendererRunIds]
    }

    private applyRecoverySnapshot(
        rendererRunIds: string[],
        snapshot: ActionRunRecoverySnapshot,
        recoveryEvents: ActionRunEvent[],
    ) {
        const activeSnapshotRunIds = new Set(snapshot.activeRunEvents.map(({ runId }) => runId))
        const activeRecoveryRunIds = new Set(recoveryEvents
            .filter(({ status }) => ACTIVE_STATUSES.has(status))
            .map(({ runId }) => runId))
        const terminalResults = new Map(snapshot.terminalResults.map((result) => [result.runId, result]))

        for (const event of byRunSequence(snapshot.activeRunEvents)) this.handleEvent(event)
        for (const event of byRunSequence(recoveryEvents)) this.handleEvent(event)

        for (const runId of rendererRunIds) {
            const currentStatus = this.runs.get(runId)?.getSnapshot().status
            if (currentStatus && TERMINAL_STATUSES.has(currentStatus as ActionRunTerminalStatus)) continue
            const terminalResult = terminalResults.get(runId)
            if (terminalResult) {
                this.completeRecoveredRun(terminalResult)
                continue
            }
            if (activeSnapshotRunIds.has(runId) || activeRecoveryRunIds.has(runId)) continue

            this.completeRecoveredRun({ changedPaths: [], failure: LOST_DURING_RECONNECTION_FAILURE, runId, status: 'failed' })
        }
    }

    private completeRecoveredRun(result: ActionRunRecoveryTerminalResult) {
        const store = this.runs.get(result.runId)
        const context = store?.getSnapshot().context ?? this.runContexts.get(result.runId) ?? null
        let logs: ActionRunLogEntry[] = []
        if (store) {
            const current = store.getSnapshot()
            const activeLogIndex = current.logs.findLastIndex(({ status }) => status === 'queued' || status === 'running')
            if (activeLogIndex >= 0) {
                const activeLog = current.logs[activeLogIndex]
                logs = [...current.logs]
                logs[activeLogIndex] = {
                    ...activeLog,
                    message: result.failure ?? `${activeLog.actionName} ${result.status}`,
                    status: result.status,
                    stderr: result.failure ? `${activeLog.stderr}${result.failure}` : activeLog.stderr,
                }
            } else if (result.failure) {
                logs = [...current.logs, {
                    actionId: current.activeActionId ?? current.rootActionId,
                    actionName: actionName(current.activeActionId ?? current.rootActionId),
                    command: null,
                    message: result.failure,
                    phase: 'main',
                    status: result.status,
                    stderr: result.failure,
                    stdout: '',
                }]
            } else logs = current.logs
            const conversation = current.conversation
                ? { ...current.conversation, status: conversationStatus(result.status) }
                : null
            const next = {
                ...current,
                activeActionAutoFinish: null,
                activeActionId: null,
                activeActionStreaming: false,
                activeActionType: null,
                approvals: [],
                changedPaths: result.changedPaths,
                diagramPath: result.diagramPath ?? null,
                conversation,
                interactionReady: false,
                logs,
                question: null,
                queuedPrompts: [],
                status: result.status,
            }
            store.update(next)
            actionPromptDraftService.discardUneditedDraft(next.rootActionId, next.context, next.runId)
            this.publishActiveIndexes(contextKey(current.context), contextKey(next.context))
        }

        const waiters = this.waiters.get(result.runId)
        this.waiters.delete(result.runId)
        const actionResult = {
            changedPaths: result.changedPaths,
            ...(result.diagramPath ? { diagramPath: result.diagramPath } : {}),
            logs,
            status: result.status,
        }
        if (context) applyTerminalCardChangedFiles(context, result.changedPaths)
        for (const resolve of waiters ?? []) resolve(actionResult)
        this.releaseTerminalRun(result.runId)
    }

    private handleIncomingEvent(event: ActionRunEvent) {
        if (this.recoveryEvents) {
            this.recoveryEvents.push(event)
            return
        }

        this.handleEvent(event)
    }

    private handleEvent(event: ActionRunEvent) {
        const currentStatus = this.runs.get(event.runId)?.getSnapshot().status
        if (
            currentStatus
            && TERMINAL_STATUSES.has(currentStatus as ActionRunTerminalStatus)
            && !TERMINAL_STATUSES.has(event.status as ActionRunTerminalStatus)
        ) return
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
            changedPaths: [],
            diagramPath: null,
            conversation: null,
            conversationChange: null,
            approvals: [],
            context: event.context,
            runId: event.runId,
            logs: [],
            interactionReady: false,
            question: null,
            queuedPrompts: [],
            reference: null,
            rootActionId: event.rootActionId,
            status: 'running' as const,
        }
        let next = { ...current, context: event.context, rootActionId: event.rootActionId }
        if (event.type === 'run') {
            next = {
                ...next,
                changedPaths: event.changedPaths ? [...event.changedPaths] : next.changedPaths,
                diagramPath: event.diagramPath ?? next.diagramPath,
                status: event.status,
            }
        }
        if (event.type === 'run' && TERMINAL_STATUSES.has(event.status as ActionRunTerminalStatus)) {
            next = { ...next, approvals: [], question: null, queuedPrompts: [] }
            actionPromptDraftService.discardUneditedDraft(next.rootActionId, next.context, next.runId)
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
            if (!active) actionPromptDraftService.discardUneditedDraft(next.rootActionId, next.context, next.runId)
        }
        if (event.type === 'agentState') {
            next = {
                ...next,
                activeActionAutoFinish: event.autoFinish ?? null,
                activeActionId: event.actionId,
                activeActionStreaming: event.streaming ?? actionStreaming(event.actionId),
                activeActionType: event.actionType ?? actionType(event.actionId),
                conversation: next.conversation
                    ? {
                        ...next.conversation,
                        completedAt: null,
                        status: event.status,
                        ...(event.timer ? { timer: event.timer } : {}),
                    }
                    : null,
                interactionReady: event.interactionReady ?? true,
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentStarted') {
            const { continued } = event.update
            next = { ...next, conversation: event.update.conversation, conversationChange: { kind: 'replace' } }
            if (continued) actionPromptDraftService.discardUneditedDraft(next.rootActionId, next.context, next.runId)
        }
        if (event.type === 'update' && event.update.kind === 'agentClosed') {
            next = { ...next, conversation: event.update.conversation, conversationChange: { kind: 'replace' } }
        }
        if (event.type === 'update' && event.update.kind === 'agentEvent' && next.conversation) {
            next = {
                ...next,
                conversation: {
                    ...next.conversation,
                    entries: updateAgentEventAtIndex(
                        next.conversation.entries,
                        event.update.entryIndex,
                        event.update.event,
                    ),
                },
                conversationChange: { entryIndex: event.update.entryIndex, kind: 'entry' },
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentUsage' && next.conversation) {
            const conversation = { ...next.conversation, usage: event.update.usage }
            if (event.update.contextWindowUsage !== undefined) {
                if (event.update.contextWindowUsage) conversation.contextWindowUsage = event.update.contextWindowUsage
                else delete conversation.contextWindowUsage
            }
            next = { ...next, conversation }
        }
        if (event.type === 'update' && event.update.kind === 'agentPromptQueued') {
            const { entry } = event.update
            const queuedPrompts = next.queuedPrompts.some(({ id }) => id === entry.id)
                ? next.queuedPrompts
                : [...next.queuedPrompts, entry]
            next = { ...next, queuedPrompts }
        }
        if (event.type === 'update' && event.update.kind === 'agentPromptEdited') {
            const { entry: editedEntry } = event.update
            next = {
                ...next,
                queuedPrompts: next.queuedPrompts.map((entry) => entry.id === editedEntry.id
                    ? editedEntry
                    : entry),
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentPromptRemoved') {
            const { promptId } = event.update
            next = {
                ...next,
                queuedPrompts: next.queuedPrompts.filter(({ id }) => id !== promptId),
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentQuestion') {
            next = {
                ...next,
                question: { questions: event.update.questions, requestId: event.update.requestId },
                status: 'waitingForInput',
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentQuestionDismissed' && next.conversation) {
            const matchingQuestion = next.question?.requestId === event.update.requestId
            next = {
                ...next,
                conversation: {
                    ...next.conversation,
                    entries: [...next.conversation.entries, event.update.event],
                },
                conversationChange: { entryIndex: next.conversation.entries.length, kind: 'entry' },
                question: matchingQuestion ? null : next.question,
                status: matchingQuestion && next.approvals.length === 0 ? event.status : next.status,
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentApproval') {
            const requestId = event.update.approval.requestId
            const approvals = next.approvals.filter((approval) => approval.requestId !== requestId)
            next = {
                ...next,
                approvals: [...approvals, { ...event.update.approval, submitted: false }],
                status: 'waitingForInput',
            }
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
            const approvals = next.approvals.filter((approval) => approval.requestId !== requestId)
            next = {
                ...next,
                approvals,
                status: next.question || approvals.length > 0 ? 'waitingForInput' : event.status,
            }
        }
        if (
            event.type === 'update'
            && event.update.kind === 'agentUserMessage'
            && next.conversation
        ) {
            next = {
                ...next,
                conversation: {
                    ...next.conversation,
                    entries: [...next.conversation.entries, event.update.userMessage],
                    status: conversationStatus(next.question || next.approvals.length > 0 ? 'waitingForInput' : event.status),
                },
                conversationChange: { entryIndex: next.conversation.entries.length, kind: 'entry' },
                status: next.question || next.approvals.length > 0 ? 'waitingForInput' : event.status,
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentQuestionAnswer' && next.conversation) {
            const matchingQuestion = next.question?.requestId === event.update.requestId
            next = {
                ...next,
                conversation: {
                    ...next.conversation,
                    entries: [...next.conversation.entries, event.update.userMessage],
                },
                conversationChange: { entryIndex: next.conversation.entries.length, kind: 'entry' },
                question: matchingQuestion ? null : next.question,
                status: matchingQuestion && next.approvals.length === 0 ? event.status : next.status,
            }
        }
        if (event.type === 'update' && event.update.kind === 'agentOutput') {
            const conversation = next.conversation
                ? updateAgentOutputAtIndex(next.conversation, event.update)
                : next.conversation
            next = {
                ...next,
                conversation,
                conversationChange: { entryIndex: event.update.entryIndex, kind: 'entry' },
                logs: updateOutputLogs(next.logs, event, event.update),
            }
        }
        if (event.type === 'update' && (event.update.kind === 'output' || event.update.kind === 'error')) {
            const output = event.update.kind === 'output' && next.conversation
                ? appendAssistantMessage(next.conversation, event.update)
                : null
            next = {
                ...next,
                conversation: output?.conversation ?? next.conversation,
                ...(output ? { conversationChange: { entryIndex: output.entryIndex, kind: 'entry' as const } } : {}),
                logs: updateOutputLogs(next.logs, event, event.update),
            }
        }
        if (
            event.type === 'update'
            && event.update.kind !== 'agentClosed'
            && event.update.kind !== 'agentPromptEdited'
            && event.update.kind !== 'agentPromptQueued'
            && event.update.kind !== 'agentPromptRemoved'
            && event.update.kind !== 'agentUsage'
            && event.update.kind !== 'agentUserMessage'
            && next.conversation
        ) {
            next = {
                ...next,
                conversation: { ...next.conversation, status: conversationStatus(event.status) },
            }
        }
        const nextStore = store ?? new ActionRunStore(next, (releasedStore) => this.handleStoreReleased(releasedStore))
        if (!store) {
            this.runs.set(event.runId, nextStore)
            const bindingKey = actionContextKey(event.rootActionId, event.context)
            const stores = this.actionContextStores.get(bindingKey) ?? []
            this.actionContextStores.set(bindingKey, [...stores, nextStore])
            publishKey(this.actionContextListeners, bindingKey)
            this.dispatchEvent(new Event(runEventType(event.runId)))
        } else {
            nextStore.update(next)
            const bindingKey = actionContextKey(next.rootActionId, next.context)
            const stores = this.actionContextStores.get(bindingKey)
            if (stores?.includes(nextStore) && conversationPickerMetadataChanged(current.conversation, next.conversation)) {
                this.actionContextStores.set(bindingKey, [...stores])
                publishKey(this.actionContextListeners, bindingKey)
            }
        }

        this.publishActiveIndexes(contextKey(current.context), contextKey(next.context))
        this.publishScopedEvents(event)
        if (event.type === 'run' && TERMINAL_STATUSES.has(event.status as ActionRunTerminalStatus)) {
            applyTerminalCardChangedFiles(event.context, next.changedPaths)
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
        const result = {
            changedPaths: run.changedPaths,
            ...(run.diagramPath ? { diagramPath: run.diagramPath } : {}),
            logs: run.logs,
            status: run.status as ActionRunTerminalStatus,
        }
        if (!waiters && this.startsInProgress > 0) this.terminalResults.set(run.runId, result)
        for (const resolve of waiters ?? []) resolve(result)
    }

    private handleStoreReleased(store: ActionRunStore) {
        const { runId, status } = store.getSnapshot()
        if (TERMINAL_STATUSES.has(status as ActionRunTerminalStatus)) this.releaseTerminalRun(runId)
    }

    private releaseTerminalRun(runId: string) {
        const store = this.runs.get(runId)
        if (!store) return

        const run = store.getSnapshot()
        const bindingKey = actionContextKey(run.rootActionId, run.context)
        const stores = this.actionContextStores.get(bindingKey) ?? []
        const remainingStores = stores.filter((current) => current !== store)
        if (remainingStores.length !== stores.length) {
            if (remainingStores.length > 0) this.actionContextStores.set(bindingKey, remainingStores)
            else this.actionContextStores.delete(bindingKey)
            publishKey(this.actionContextListeners, bindingKey)
        }
        if (store.hasConsumers() || this.waiters.has(runId) || this.terminalResults.has(runId)) return

        this.runs.delete(runId)
        this.runContexts.delete(runId)
        this.eventSequences.delete(runId)
        actionPromptDraftService.deleteUneditedDraft(run.rootActionId, run.context, runId)
        this.dispatchEvent(new Event(runEventType(runId)))
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
