import type { ActionQueuedPrompt } from '../../../data/action_run_types'
import type { AgentConversation, AgentConversationEntry } from '../../../data/data_types'
import {
    actionRunRegistry,
    type ActionConversationChange,
    type ActionRun,
    type ActionRunRegistry,
} from '../../../services/actions/action_run_registry'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import type { ActionConversationStore } from './action_conversation_store'
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

function conversationEventIsVisible(entry: AgentConversationEntry) {
    if (entry.kind !== 'event' || entry.type === 'diagnostic') return false
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
        if (group.kind === 'completedToolCalls' && prior.kind === 'completedToolCalls') {
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

function visibleGroups(conversation: AgentConversation, showEvents: boolean) {
    const visibleEntries = conversation.entries.filter((entry) => entry.kind === 'message'
        || (showEvents && conversationEventIsVisible(entry)))

    return buildActionConversationRenderGroups(visibleEntries)
}

function currentTurnBoundary(entries: AgentConversationEntry[]) {
    const userMessageIndex = entries.findLastIndex((entry) => entry.kind === 'message' && entry.role === 'user')

    return Math.max(0, userMessageIndex)
}

function groupEntries(group: ActionConversationRenderGroup): AgentConversationEntry[] {
    if (group.kind === 'entry') return [group.entry]
    if (group.kind === 'completedToolCalls') return group.entries

    return [group.entry, ...group.groups.flatMap(groupEntries)]
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
    for (const group of groups) {
        const stable = groupEntries(group).every((entry) => (entryIndexes.get(entry) ?? boundary) < boundary)
        if (stable) stableGroups.push(group)
        else evolvingGroups.push(group)
    }

    return { evolvingGroups, stableGroups }
}

function groupIsRunning(group: ActionConversationRenderGroup) {
    if (group.kind === 'completedToolCalls' || group.entry.kind !== 'event') return false

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

function displayedConversation(run: ActionRun | null, selectedConversation: AgentConversation | null) {
    const liveConversation = run?.conversation ?? null
    if (!selectedConversation || selectedConversation.path === liveConversation?.path) return liveConversation ?? selectedConversation

    return selectedConversation
}

function displayedStatus(run: ActionRun | null, selectedConversation: AgentConversation | null): PopupRunStatus {
    const displayingLiveConversation = !selectedConversation
        || selectedConversation.path === run?.conversation?.path
    if (displayingLiveConversation) return run?.status ?? 'idle'

    return selectedConversation.status === 'waitingForInput' ? 'waitingForInput' : 'idle'
}

/** Owns derived render state and subscriptions for one mounted conversation chatlog. */
export class ActionConversationChatlogTracker extends EventTarget {
    private conversation: AgentConversation | null = null
    private conversationChange: ActionConversationChange | null = null
    private evolvingGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS
    private readonly expandedGroupKeys = new Set<string>()
    private loaded = false
    private providerSessions: AgentConversation['providerSessions'] | null = null
    private queuedPrompts: ActionQueuedPrompt[] = EMPTY_QUEUED_PROMPTS
    private reservationGroups: ReservationGroupState[] = []
    private reservationSession: object = {}
    private reservationState = createActionConversationReservationState()
    private reservedBlockCount = 0
    private runId: string | null = null
    private showEvents = false
    private stableGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS
    private status: PopupRunStatus = 'idle'
    private unsubscribeBinding: (() => void) | null = null
    private unsubscribeConversation: (() => void) | null = null
    private unsubscribeRun: (() => void) | null = null

    constructor(
        private readonly bindingStore: ActionRunBindingStore,
        private readonly conversationStore: ActionConversationStore,
        private readonly runRegistry: RunRegistryBoundary = actionRunRegistry,
    ) {
        super()
    }

    load() {
        if (this.loaded) return

        this.loaded = true
        try {
            this.unsubscribeBinding = this.bindingStore.subscribe(this.handleBindingChange)
            this.unsubscribeConversation = this.conversationStore.subscribe(this.handleSourceChange)
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
        this.loaded = false
        this.resetConversationState()
        this.publishViewChanges(EMPTY_GROUPS, EMPTY_GROUPS, 0, EMPTY_QUEUED_PROMPTS, null)
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

    private readonly handleSourceChange = () => {
        this.updateFromSources()
    }

    private bindRun() {
        this.unsubscribeRun?.()
        const boundRunId = this.bindingStore.getSnapshot()
        this.unsubscribeRun = boundRunId ? this.runRegistry.subscribeRun(boundRunId, this.handleSourceChange) : null
    }

    private updateFromSources() {
        const boundRunId = this.bindingStore.getSnapshot()
        const run = boundRunId ? this.runRegistry.getRunStore(boundRunId)?.getSnapshot() ?? null : null
        const selectedConversation = this.conversationStore.getSnapshot().selectedConversation
        const conversation = displayedConversation(run, selectedConversation)
        const status = displayedStatus(run, selectedConversation)
        const displayingLiveConversation = !selectedConversation
            || selectedConversation.path === run?.conversation?.path
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

        const replacement = identityChanged || change?.kind === 'replace' || this.conversation === null
        const changedEntry = change?.kind === 'entry' ? conversation.entries[change.entryIndex] : null
        const providerSessionsChanged = this.providerSessions !== conversation.providerSessions
        if (replacement) this.showEvents = conversationHasAgentActivity(conversation)
        else if (!this.showEvents) {
            this.showEvents = (providerSessionsChanged && providerSessionsHaveAgentActivity(conversation.providerSessions))
                || (!!changedEntry && entryHasAgentActivity(changedEntry))
        }

        const groups = visibleGroups(conversation, this.showEvents)
        const split = splitGroups(groups, conversation.entries, runIsActive(status))
        const stableGroups = reconcileRenderGroups(this.stableGroups, split.stableGroups)
        const evolvingGroups = reconcileRenderGroups(this.evolvingGroups, split.evolvingGroups)
        const nextReservationGroups = reservationGroups(evolvingGroups, this.reservationGroups)
        const transitionedGroupKeys = this.evolvingGroups
            .filter(({ key }) => !evolvingGroups.some((group) => group.key === key))
            .map(({ key }) => key)
        if (identityChanged || replacement) this.reservationSession = {}
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
