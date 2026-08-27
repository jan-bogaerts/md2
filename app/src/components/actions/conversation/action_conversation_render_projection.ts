import type { AgentConversation, AgentConversationEntry } from '../../../data/data_types'
import type { ActionConversationChange } from '../../../services/actions/action_run_registry'
import { buildActionConversationRenderGroups, type ActionConversationRenderGroup } from './action_conversation_render_groups'
import { reasoningDisplay } from './reasoning_display'

export interface ConversationRenderInput {
    cardInternalId?: string | null
    change?: ActionConversationChange
    entries: AgentConversationEntry[]
    path: string | null
    providerSessions: AgentConversation['providerSessions']
}

export interface ReservationGroupState {
    key: string
    running: boolean
}

export interface ConversationRenderProjectionSnapshot {
    historyGroups: ActionConversationRenderGroup[]
    reservationGroups: ReservationGroupState[]
    reservationSession: object
    sealedGroupKeys: string[]
    tailGroups: ActionConversationRenderGroup[]
}

const EMPTY_GROUPS: ActionConversationRenderGroup[] = []
const EMPTY_RESERVATION_GROUPS: ReservationGroupState[] = []
const EMPTY_KEYS: string[] = []
const EMPTY_RESERVATION_SESSION = {}
const EMPTY_SNAPSHOT: ConversationRenderProjectionSnapshot = {
    historyGroups: EMPTY_GROUPS,
    reservationGroups: EMPTY_RESERVATION_GROUPS,
    reservationSession: EMPTY_RESERVATION_SESSION,
    sealedGroupKeys: EMPTY_KEYS,
    tailGroups: EMPTY_GROUPS,
}

function conversationEventIsVisible(entry: AgentConversationEntry) {
    if (entry.kind !== 'event' || entry.type === 'diagnostic') return false
    if (entry.type !== 'reasoning' || entry.status !== 'completed') return true

    return reasoningDisplay(entry).hasText
}

function hasAgentActivity(conversation: ConversationRenderInput) {
    return providerSessionsHaveAgentActivity(conversation.providerSessions)
        || conversation.entries.some(entryHasAgentActivity)
}

function entryHasAgentActivity(entry: AgentConversationEntry) {
    return entry.kind === 'message' ? entry.agent === 'codex' : !!entry.providerItemId
}

function providerSessionsHaveAgentActivity(providerSessions: AgentConversation['providerSessions']) {
    return providerSessions.some(({ agent }) => agent === 'codex')
}

function visibleGroups(entries: AgentConversationEntry[], showEvents: boolean) {
    const visibleEntries = entries.filter((entry) => entry.kind === 'message'
        || (showEvents && conversationEventIsVisible(entry)))

    return buildActionConversationRenderGroups(visibleEntries)
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

function currentTurnBoundary(entries: AgentConversationEntry[]) {
    const userMessageIndex = entries.findLastIndex((entry) => entry.kind === 'message' && entry.role === 'user')

    return Math.max(0, userMessageIndex)
}

/** Owns stable render groups and expansion state for one displayed conversation. */
export class ActionConversationRenderProjection extends EventTarget {
    private change: ActionConversationChange | undefined
    private entries: AgentConversationEntry[] | null = null
    private entriesLength = 0
    private readonly expandedGroupKeys = new Set<string>()
    private path: string | null | undefined = undefined
    private providerSessions: AgentConversation['providerSessions'] | null = null
    private reservationSession: object = EMPTY_RESERVATION_SESSION
    private sealedEntryCount = 0
    private showEvents = false
    private snapshot = EMPTY_SNAPSHOT

    update(conversation: ConversationRenderInput | null, mutable: boolean) {
        if (!conversation) {
            if (this.path !== undefined) this.reset(null, mutable, true)
            return this.snapshot
        }
        const pathChanged = this.path !== conversation.path
        const replaced = conversation.change?.kind === 'replace' && this.change !== conversation.change
        const untrackedReplacement = conversation.change === undefined && this.entries !== conversation.entries
        if (pathChanged || replaced || this.entries === null || untrackedReplacement) {
            this.reset(conversation, mutable, true)
            return this.snapshot
        }
        if (!mutable && this.snapshot.tailGroups.length > 0) this.sealTail(conversation.entries.length)
        const providerSessionsChanged = this.providerSessions !== conversation.providerSessions
        const changedEntry = conversation.change?.kind === 'entry'
            ? conversation.entries[conversation.change.entryIndex]
            : null
        const nextShowEvents = this.showEvents
            || (providerSessionsChanged && providerSessionsHaveAgentActivity(conversation.providerSessions))
            || (!!changedEntry && entryHasAgentActivity(changedEntry))
        if (nextShowEvents !== this.showEvents) {
            this.reset(conversation, mutable, false)
            return this.snapshot
        }
        this.providerSessions = conversation.providerSessions
        if (this.entries === conversation.entries) return this.snapshot
        if (conversation.change?.kind !== 'entry') {
            this.reset(conversation, mutable, true)
            return this.snapshot
        }

        const { entryIndex } = conversation.change
        if (entryIndex < this.sealedEntryCount) {
            throw new Error(`Conversation update targets sealed entry index ${entryIndex}`)
        }
        if (entryIndex > this.entriesLength || conversation.entries.length > this.entriesLength + 1) {
            throw new Error(`Conversation projection entry index out of range: ${entryIndex}`)
        }
        const appendedEntry = entryIndex === this.entriesLength ? conversation.entries[entryIndex] : null
        if (appendedEntry?.kind === 'message' && appendedEntry.role === 'user') {
            this.sealTail(entryIndex)
        }

        const nextTailGroups = visibleGroups(conversation.entries.slice(this.sealedEntryCount), this.showEvents)
        const tailGroups = reconcileRenderGroups(this.snapshot.tailGroups, nextTailGroups)
        const nextReservationGroups = reservationGroups(tailGroups, this.snapshot.reservationGroups)
        this.entries = conversation.entries
        this.entriesLength = conversation.entries.length
        this.change = conversation.change
        this.snapshot = {
            ...this.snapshot,
            reservationGroups: nextReservationGroups,
            tailGroups,
        }
        if (!mutable) this.sealTail(conversation.entries.length)

        return this.snapshot
    }

    readonly groupIsExpanded = (key: string) => this.expandedGroupKeys.has(key)

    readonly subscribeExpansion = (key: string, listener: () => void) => {
        const eventType = `expansion:${key}`
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }

    toggleExpansion(key: string) {
        if (this.expandedGroupKeys.has(key)) this.expandedGroupKeys.delete(key)
        else this.expandedGroupKeys.add(key)
        this.dispatchEvent(new Event(`expansion:${key}`))
    }

    private reset(conversation: ConversationRenderInput | null, mutable: boolean, resetReservation: boolean) {
        const pathChanged = this.path !== conversation?.path
        if (pathChanged) this.expandedGroupKeys.clear()
        if (resetReservation) this.reservationSession = {}
        this.path = conversation?.path ?? null
        this.change = conversation?.change
        this.entries = conversation?.entries ?? null
        this.entriesLength = conversation?.entries.length ?? 0
        this.providerSessions = conversation?.providerSessions ?? null
        if (!conversation) {
            this.sealedEntryCount = 0
            this.showEvents = false
            this.snapshot = EMPTY_SNAPSHOT
            return
        }

        this.showEvents = hasAgentActivity(conversation)
        this.sealedEntryCount = mutable ? currentTurnBoundary(conversation.entries) : conversation.entries.length
        const historyGroups = visibleGroups(conversation.entries.slice(0, this.sealedEntryCount), this.showEvents)
        const tailGroups = mutable
            ? visibleGroups(conversation.entries.slice(this.sealedEntryCount), this.showEvents)
            : EMPTY_GROUPS
        this.snapshot = {
            historyGroups,
            reservationGroups: reservationGroups(tailGroups, EMPTY_RESERVATION_GROUPS),
            reservationSession: this.reservationSession,
            sealedGroupKeys: EMPTY_KEYS,
            tailGroups,
        }
    }

    private sealTail(sealedEntryCount: number) {
        const sealedGroupKeys = this.snapshot.tailGroups.map(({ key }) => key)
        this.sealedEntryCount = sealedEntryCount
        this.snapshot = {
            historyGroups: [...this.snapshot.historyGroups, ...this.snapshot.tailGroups],
            reservationGroups: EMPTY_RESERVATION_GROUPS,
            reservationSession: this.reservationSession,
            sealedGroupKeys,
            tailGroups: EMPTY_GROUPS,
        }
    }
}
