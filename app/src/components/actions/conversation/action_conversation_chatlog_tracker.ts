import type { ActionQueuedPrompt } from '../../../data/action_run_types'
import type { AgentConversation, AgentConversationEntry, AgentConversationEventEntry } from '../../../data/data_types'
import {
    actionRunRegistry,
    type ActionConversationChange,
    type ActionRun,
    type ActionRunRegistry,
} from '../../../services/actions/action_run_registry'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import { resolveDisplayedConversation, type ActionConversationStore } from './action_conversation_store'
import { buildActionConversationRenderGroups, type ActionConversationRenderGroup } from './action_conversation_render_groups'
import {
    createActionConversationReservationState,
    reservedActionConversationBlockCount,
    updateActionConversationReservation,
    type ReservationGroupState,
} from './action_conversation_reservation'
import { reasoningDisplay } from './reasoning_display'

const STABLE_GROUPS_CHANGED_EVENT = 'stableGroupsChanged'
const EVOLVING_GROUPS_CHANGED_EVENT = 'evolvingGroupsChanged'
const RESERVED_BLOCK_COUNT_CHANGED_EVENT = 'reservedBlockCountChanged'
const QUEUED_PROMPTS_CHANGED_EVENT = 'queuedPromptsChanged'
const CONVERSATION_CHANGED_EVENT = 'conversationChanged'
const EMPTY_GROUPS: ActionConversationRenderGroup[] = []
const EMPTY_QUEUED_PROMPTS: ActionQueuedPrompt[] = []

interface RunRegistryBoundary {
    getRunStore(runId: string): ReturnType<ActionRunRegistry['getRunStore']>
    subscribeRun(runId: string, listener: () => void): () => void
}

function runIsActive(status: PopupRunStatus) {
    return status === 'queued' || status === 'running' || status === 'waitingForInput'
}

/** `agentQuestion` only carries the pending question for restoration; the question box is its visible surface. */
function conversationEventIsVisible(entry: AgentConversationEntry) {
    if (entry.kind !== 'event' || entry.type === 'diagnostic' || entry.type === 'agentQuestion') return false
    if (entry.type !== 'reasoning' || entry.status !== 'completed') return true

    return reasoningDisplay(entry).hasText
}

function entryHasAgentActivity(entry: AgentConversationEntry) {
    return entry.kind === 'message' ? entry.agent === 'codex' : !!entry.providerItemId
}

function providerSessionsHaveAgentActivity(providerSessions: AgentConversation['providerSessions']) {
    return providerSessions.some(({ agent }) => agent === 'codex')
}

function conversationHasAgentActivity(conversation: AgentConversation) {
    return providerSessionsHaveAgentActivity(conversation.providerSessions)
        || conversation.entries.some(entryHasAgentActivity)
}

function entriesMatch(first: AgentConversationEntry[], second: AgentConversationEntry[]) {
    return first.length === second.length && first.every((entry, index) => entry === second[index])
}

function groupsMatch(first: ActionConversationRenderGroup[], second: ActionConversationRenderGroup[]) {
    return first.length === second.length && first.every((group, index) => group === second[index])
}

function reconcileRenderGroups(
    previous: ActionConversationRenderGroup[],
    next: ActionConversationRenderGroup[],
): ActionConversationRenderGroup[] {
    const previousByKey = new Map(previous.map((group) => [group.key, group]))
    const reconciled = next.map((group) => {
        const prior = previousByKey.get(group.key)
        if (!prior || prior.kind !== group.kind) return group
        if (group.kind === 'entry' && prior.kind === 'entry') return prior.entry === group.entry ? prior : group
        if (group.kind === 'terminalToolCalls' && prior.kind === 'terminalToolCalls') {
            return entriesMatch(prior.entries, group.entries) ? prior : group
        }
        if (group.kind !== 'subAgent' || prior.kind !== 'subAgent') return group

        const groups = reconcileRenderGroups(prior.groups, group.groups)
        if (
            prior.entry === group.entry
            && prior.label === group.label
            && prior.runningCount === group.runningCount
            && groupsMatch(prior.groups, groups)
        ) return prior

        return { ...group, groups }
    })

    return groupsMatch(previous, reconciled) ? previous : reconciled
}

function visibleGroups(entries: AgentConversationEntry[], showEvents: boolean) {
    const visibleEntries = entries.filter((entry) => entry.kind === 'message'
        || (showEvents && conversationEventIsVisible(entry)))

    return buildActionConversationRenderGroups(visibleEntries)
}

function currentTurnBoundary(entries: AgentConversationEntry[]) {
    const userMessageIndex = entries.findLastIndex((entry) => entry.kind === 'message' && entry.role === 'user')

    return Math.max(0, userMessageIndex)
}

function groupEntries(group: ActionConversationRenderGroup): AgentConversationEntry[] {
    if (group.kind === 'entry') return [group.entry]
    if (group.kind === 'terminalToolCalls') return group.entries

    return [group.entry, ...group.groups.flatMap(groupEntries)]
}

function entrySpawnsSubAgent(
    entry: AgentConversationEntry,
): entry is AgentConversationEventEntry & { providerItemId: string } {
    return entry.kind === 'event'
        && !!entry.providerItemId
        && (entry.type === 'tool.Agent' || entry.type === 'collabAgentToolCall')
}

function groupingCrossesBoundary(entries: AgentConversationEntry[], boundary: number) {
    const spawningEntryIndexes = new Map<string, number>()
    for (const [index, entry] of entries.entries()) {
        if (entrySpawnsSubAgent(entry)) spawningEntryIndexes.set(entry.providerItemId, index)
    }

    return entries.some((entry, index) => {
        if (entry.kind !== 'event' || !entry.parentItemId) return false

        const parentIndex = spawningEntryIndexes.get(entry.parentItemId)

        return parentIndex !== undefined && (index < boundary) !== (parentIndex < boundary)
    })
}

function splitGroups(
    groups: ActionConversationRenderGroup[],
    entries: AgentConversationEntry[],
    active: boolean,
) {
    if (!active) return { evolvingGroups: EMPTY_GROUPS, stableGroups: groups }

    const boundary = currentTurnBoundary(entries)
    const entryIndexes = new Map(entries.map((entry, index) => [entry, index]))
    const stableGroups: ActionConversationRenderGroup[] = []
    const evolvingGroups: ActionConversationRenderGroup[] = []
    let evolvingStarted = false
    for (const group of groups) {
        const stable = !evolvingStarted
            && groupEntries(group).every((entry) => (entryIndexes.get(entry) ?? boundary) < boundary)
        if (stable) stableGroups.push(group)
        else {
            evolvingStarted = true
            evolvingGroups.push(group)
        }
    }

    return { evolvingGroups, stableGroups }
}

function groupIsRunning(group: ActionConversationRenderGroup) {
    if (group.kind === 'terminalToolCalls' || group.entry.kind !== 'event') return false

    return group.entry.status === 'inProgress'
        || group.entry.status === 'running'
        || group.entry.status === 'started'
}

function reservationGroups(groups: ActionConversationRenderGroup[], previous: ReservationGroupState[]) {
    const next = groups.map((group) => ({ key: group.key, running: groupIsRunning(group) }))
    const unchanged = next.length === previous.length
        && next.every((group, index) => group.key === previous[index].key && group.running === previous[index].running)

    return unchanged ? previous : next
}

function displayedStatus(run: ActionRun | null, selectedConversation: AgentConversation | null): PopupRunStatus {
    const displayingLiveConversation = !selectedConversation
        || selectedConversation.id === run?.conversation?.id
    if (displayingLiveConversation) return run?.status ?? 'idle'

    return selectedConversation.status === 'waitingForInput' ? 'waitingForInput' : 'idle'
}

/** Owns derived render state and subscriptions for one mounted conversation chatlog. */
export class ActionConversationChatlogTracker extends EventTarget {
    private readonly bindingStore: ActionRunBindingStore
    private conversation: AgentConversation | null = null
    private conversationChange: ActionConversationChange | null = null
    private readonly conversationStore: ActionConversationStore
    private evolvingGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS
    private readonly expandedGroupKeys = new Set<string>()
    private loaded = false
    private providerSessions: AgentConversation['providerSessions'] | null = null
    private queuedPrompts: ActionQueuedPrompt[] = EMPTY_QUEUED_PROMPTS
    private reservationGroups: ReservationGroupState[] = []
    private reservationSession: object = {}
    private reservationState = createActionConversationReservationState()
    private reservedBlockCount = 0
    private readonly runRegistry: RunRegistryBoundary
    private runId: string | null = null
    private showEvents = false
    private stableEntryCount = 0
    private stableGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS
    private status: PopupRunStatus = 'idle'
    private subscribedRunId: string | null = null
    private unsubscribeBinding: (() => void) | null = null
    private unsubscribeConversation: (() => void) | null = null
    private unsubscribeRun: (() => void) | null = null

    constructor(
        bindingStore: ActionRunBindingStore,
        conversationStore: ActionConversationStore,
        runRegistry: RunRegistryBoundary = actionRunRegistry,
    ) {
        super()
        this.bindingStore = bindingStore
        this.conversationStore = conversationStore
        this.runRegistry = runRegistry
    }

    load() {
        if (this.loaded) return

        this.loaded = true
        try {
            this.unsubscribeBinding = this.bindingStore.subscribe(this.handleBindingChange)
            this.unsubscribeConversation = this.conversationStore.subscribe(this.handleConversationStoreChange)
            this.bindRun()
            this.updateFromSources()
        } catch (error) {
            this.unload()
            throw error
        }
    }

    unload() {
        this.unsubscribeBinding?.()
        this.unsubscribeConversation?.()
        this.unsubscribeRun?.()
        this.unsubscribeBinding = null
        this.unsubscribeConversation = null
        this.unsubscribeRun = null
        this.subscribedRunId = null
        this.loaded = false
        this.resetConversationState()
        this.expandedGroupKeys.clear()
        this.stableGroups = EMPTY_GROUPS
        this.evolvingGroups = EMPTY_GROUPS
        this.reservedBlockCount = 0
        this.queuedPrompts = EMPTY_QUEUED_PROMPTS
        this.runId = null
    }

    readonly getStableGroups = () => this.stableGroups
    readonly getEvolvingGroups = () => this.evolvingGroups
    readonly getReservedBlockCount = () => this.reservedBlockCount
    readonly getQueuedPrompts = () => this.queuedPrompts
    readonly getCardInternalId = () => this.conversation?.cardInternalId ?? null
    readonly getConversationIdentity = () => this.conversation?.id ?? null
    readonly getRunId = () => this.runId
    readonly groupIsExpanded = (key: string) => this.expandedGroupKeys.has(key)

    readonly subscribeStableGroups = (listener: () => void) => this.subscribe(STABLE_GROUPS_CHANGED_EVENT, listener)
    readonly subscribeEvolvingGroups = (listener: () => void) => this.subscribe(EVOLVING_GROUPS_CHANGED_EVENT, listener)
    readonly subscribeReservedBlockCount = (listener: () => void) => (
        this.subscribe(RESERVED_BLOCK_COUNT_CHANGED_EVENT, listener)
    )
    readonly subscribeQueuedPrompts = (listener: () => void) => this.subscribe(QUEUED_PROMPTS_CHANGED_EVENT, listener)
    readonly subscribeConversation = (listener: () => void) => this.subscribe(CONVERSATION_CHANGED_EVENT, listener)

    readonly subscribeExpansion = (key: string, listener: () => void) => this.subscribe(`expansion:${key}`, listener)

    toggleExpansion(key: string) {
        if (this.expandedGroupKeys.has(key)) this.expandedGroupKeys.delete(key)
        else this.expandedGroupKeys.add(key)
        this.dispatchEvent(new Event(`expansion:${key}`))
    }

    private readonly handleBindingChange = () => {
        this.bindRun()
        this.updateFromSources()
    }

    private readonly handleConversationStoreChange = () => {
        this.bindRun()
        this.updateFromSources()
    }

    private readonly handleRunChange = () => {
        this.updateFromSources()
    }

    private bindRun() {
        const boundRunId = this.bindingStore.getSnapshot()
        if (this.subscribedRunId === boundRunId) return

        this.unsubscribeRun?.()
        this.subscribedRunId = boundRunId
        this.unsubscribeRun = boundRunId
            ? this.runRegistry.subscribeRun(boundRunId, this.handleRunChange)
            : null
    }

    private updateFromSources() {
        const boundRunId = this.bindingStore.getSnapshot()
        const run = boundRunId ? this.runRegistry.getRunStore(boundRunId)?.getSnapshot() ?? null : null
        const selectedConversation = this.conversationStore.getSnapshot().selectedConversation
        const pendingRunConversation = !!boundRunId && !run?.conversation
        const resolvedConversation = resolveDisplayedConversation(run?.conversation ?? null, selectedConversation)
        const conversation = pendingRunConversation && !selectedConversation
            ? this.conversation
            : resolvedConversation
        const status = pendingRunConversation && !selectedConversation && this.conversation
            ? this.status
            : displayedStatus(run, selectedConversation)
        const displayingLiveConversation = !selectedConversation
            || !run?.conversation
            || selectedConversation.id === run.conversation.id
        const queuedPrompts = displayingLiveConversation ? run?.queuedPrompts ?? EMPTY_QUEUED_PROMPTS : EMPTY_QUEUED_PROMPTS
        const runId = displayingLiveConversation ? run?.runId ?? null : null
        const change = displayingLiveConversation ? run?.conversationChange ?? null : null

        this.applyConversation(conversation, change, status, queuedPrompts, runId)
    }

    private applyConversation(
        conversation: AgentConversation | null,
        change: ActionConversationChange | null,
        status: PopupRunStatus,
        queuedPrompts: ActionQueuedPrompt[],
        runId: string | null,
    ) {
        const previousConversation = this.conversation
        const identityChanged = previousConversation?.id !== conversation?.id
        const displayedConversationChanged = previousConversation?.id !== conversation?.id
            || previousConversation?.path !== conversation?.path
            || previousConversation?.cardInternalId !== conversation?.cardInternalId
        if (identityChanged) {
            this.resetConversationState()
            this.expandedGroupKeys.clear()
        }

        const conversationChanged = previousConversation !== conversation || this.conversationChange !== change
        const statusChanged = this.status !== status
        if (!conversationChanged && !statusChanged) {
            this.publishViewChanges(this.stableGroups, this.evolvingGroups, this.reservedBlockCount, queuedPrompts, runId)
            return
        }

        if (!conversation) {
            this.resetConversationState()
            this.publishViewChanges(EMPTY_GROUPS, EMPTY_GROUPS, 0, queuedPrompts, runId)
            if (displayedConversationChanged) this.dispatchEvent(new Event(CONVERSATION_CHANGED_EVENT))
            return
        }

        const replacement = identityChanged
            || change?.kind === 'replace'
            || this.conversation === null
            || (previousConversation !== conversation && change === null)
        const changedEntry = change?.kind === 'entry' ? conversation.entries[change.entryIndex] : null
        const providerSessionsChanged = this.providerSessions !== conversation.providerSessions
        const previousShowEvents = this.showEvents
        if (replacement) this.showEvents = conversationHasAgentActivity(conversation)
        else if (!this.showEvents) {
            this.showEvents = (providerSessionsChanged && providerSessionsHaveAgentActivity(conversation.providerSessions))
                || (!!changedEntry && entryHasAgentActivity(changedEntry))
        }

        const visibilityChanged = previousShowEvents !== this.showEvents
        const stableEntryCount = runIsActive(status)
            ? currentTurnBoundary(conversation.entries)
            : conversation.entries.length
        const crossBoundaryGrouping = groupingCrossesBoundary(conversation.entries, stableEntryCount)
        let stableGroups = this.stableGroups
        let evolvingGroups = this.evolvingGroups
        if (replacement || visibilityChanged || crossBoundaryGrouping) {
            const groups = visibleGroups(conversation.entries, this.showEvents)
            const split = splitGroups(groups, conversation.entries, runIsActive(status))
            stableGroups = reconcileRenderGroups(identityChanged ? EMPTY_GROUPS : stableGroups, split.stableGroups)
            evolvingGroups = reconcileRenderGroups(identityChanged ? EMPTY_GROUPS : evolvingGroups, split.evolvingGroups)
        } else if (stableEntryCount > this.stableEntryCount) {
            const movedEntries = conversation.entries.slice(this.stableEntryCount, stableEntryCount)
            const movedGroups = visibleGroups(movedEntries, this.showEvents)
            stableGroups = reconcileRenderGroups(stableGroups, [...stableGroups, ...movedGroups])
            evolvingGroups = reconcileRenderGroups(
                evolvingGroups,
                visibleGroups(conversation.entries.slice(stableEntryCount), this.showEvents),
            )
        } else if (stableEntryCount < this.stableEntryCount) {
            const split = splitGroups([...stableGroups, ...evolvingGroups], conversation.entries, runIsActive(status))
            stableGroups = reconcileRenderGroups(stableGroups, split.stableGroups)
            evolvingGroups = reconcileRenderGroups(evolvingGroups, split.evolvingGroups)
        } else if (change?.kind === 'entry' && change.entryIndex < stableEntryCount) {
            stableGroups = reconcileRenderGroups(
                stableGroups,
                visibleGroups(conversation.entries.slice(0, stableEntryCount), this.showEvents),
            )
        } else if (change?.kind === 'entry') {
            evolvingGroups = reconcileRenderGroups(
                evolvingGroups,
                visibleGroups(conversation.entries.slice(stableEntryCount), this.showEvents),
            )
        }
        const nextReservationGroups = reservationGroups(evolvingGroups, this.reservationGroups)
        const transitionedGroupKeys = identityChanged
            ? []
            : this.evolvingGroups
                .filter(({ key }) => stableGroups.some((group) => group.key === key))
                .map(({ key }) => key)
        if (identityChanged) this.reservationSession = {}
        this.reservationState = updateActionConversationReservation(
            this.reservationState,
            conversation.path,
            nextReservationGroups,
            this.reservationSession,
            transitionedGroupKeys,
            status,
        )
        const reservedBlockCount = reservedActionConversationBlockCount(this.reservationState)

        this.conversation = conversation
        this.conversationChange = change
        this.providerSessions = conversation.providerSessions
        this.reservationGroups = nextReservationGroups
        this.stableEntryCount = stableEntryCount
        this.status = status
        this.publishViewChanges(stableGroups, evolvingGroups, reservedBlockCount, queuedPrompts, runId)
        if (displayedConversationChanged) this.dispatchEvent(new Event(CONVERSATION_CHANGED_EVENT))
    }

    private resetConversationState() {
        this.conversation = null
        this.conversationChange = null
        this.providerSessions = null
        this.reservationGroups = []
        this.reservationSession = {}
        this.reservationState = createActionConversationReservationState()
        this.showEvents = false
        this.stableEntryCount = 0
        this.status = 'idle'
    }

    private publishViewChanges(
        stableGroups: ActionConversationRenderGroup[],
        evolvingGroups: ActionConversationRenderGroup[],
        reservedBlockCount: number,
        queuedPrompts: ActionQueuedPrompt[],
        runId: string | null,
    ) {
        const stableGroupsChanged = this.stableGroups !== stableGroups
        const evolvingGroupsChanged = this.evolvingGroups !== evolvingGroups
        const reservedBlockCountChanged = this.reservedBlockCount !== reservedBlockCount
        const queuedPromptsChanged = this.queuedPrompts !== queuedPrompts || this.runId !== runId
        this.stableGroups = stableGroups
        this.evolvingGroups = evolvingGroups
        this.reservedBlockCount = reservedBlockCount
        this.queuedPrompts = queuedPrompts
        this.runId = runId
        if (stableGroupsChanged) this.dispatchEvent(new Event(STABLE_GROUPS_CHANGED_EVENT))
        if (evolvingGroupsChanged) this.dispatchEvent(new Event(EVOLVING_GROUPS_CHANGED_EVENT))
        if (reservedBlockCountChanged) this.dispatchEvent(new Event(RESERVED_BLOCK_COUNT_CHANGED_EVENT))
        if (queuedPromptsChanged) this.dispatchEvent(new Event(QUEUED_PROMPTS_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}
