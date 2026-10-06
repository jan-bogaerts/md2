import type { ActionQueuedPrompt } from '../../../../data/action_run_types'
import type { AgentConversation, AgentConversationEntry, AgentConversationEventEntry } from '../../../../data/data_types'
import {
    actionRunRegistry,
    type ActionConversationChange,
    type ActionRun,
    type ActionRunRegistry,
    type PendingActionSubmission,
} from '../../../../services/actions/action_run_registry'
import type { PopupRunStatus } from '../../run/popup/action_popup_defaults'
import type { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import {
    resolveDisplayedConversation,
    type ActionConversationStore,
} from '../state/action_conversation_store'
import { buildActionConversationRenderGroups, type ActionConversationRenderGroup } from './action_conversation_render_groups'
import {
    createActionConversationReservationState,
    reservedActionConversationBlockCount,
    updateActionConversationReservation,
    type ReservationGroupState,
} from './action_conversation_reservation'
import { reasoningDisplay } from '../events/reasoning_display'
import { ActionConversationPrompt, type ActionConversationPromptSnapshot } from './action_conversation_prompt';

const STABLE_GROUPS_CHANGED_EVENT = 'stableGroupsChanged'
const EVOLVING_GROUPS_CHANGED_EVENT = 'evolvingGroupsChanged'
const RESERVED_BLOCK_COUNT_CHANGED_EVENT = 'reservedBlockCountChanged'
const CONVERSATION_CHANGED_EVENT = 'conversationChanged'
const CONVERSATION_STATUS_CHANGED_EVENT = 'conversationStatusChanged'
const EMPTY_GROUPS: ActionConversationRenderGroup[] = []
const EMPTY_QUEUED_PROMPTS: ActionQueuedPrompt[] = []

interface RunRegistryBoundary {
    getRunStore(runId: string): ReturnType<ActionRunRegistry['getRunStore']>
    subscribeRun(runId: string, listener: () => void): () => void
    subscribeSubmissions: ActionRunRegistry['subscribeSubmissions'];
    getVisibleSubmissions: ActionRunRegistry['getVisibleSubmissions'];
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

function entriesMatch<T>(first: T[], second: T[]) {
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
    private conversationStatus: AgentConversation['status'] | null = null
    private conversationChange: ActionConversationChange | null = null
    private readonly conversationStore: ActionConversationStore
    private evolvingGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS
    private conversationEvolvingGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS;
    private readonly expandedGroupKeys = new Set<string>()
    private loaded = false
    private providerSessions: AgentConversation['providerSessions'] | null = null
    private readonly prompts = new Map<string, ActionConversationPrompt>();
    private unsentGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS;
    private reservationGroups: ReservationGroupState[] = []
    private reservationSession: object = {}
    private reservationState = createActionConversationReservationState()
    private reservedBlockCount = 0
    private readonly runRegistry: RunRegistryBoundary
    private showEvents = false
    private stableEntryCount = 0
    private stableGroups: ActionConversationRenderGroup[] = EMPTY_GROUPS
    private status: PopupRunStatus = 'idle'
    private subscribedRunId: string | null = null
    private unsubscribeBinding: (() => void) | null = null
    private unsubscribeConversation: (() => void) | null = null
    private unsubscribeRun: (() => void) | null = null
    private unsubscribeSubmissions: (() => void) | null = null

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
            this.unsubscribeSubmissions = this.runRegistry.subscribeSubmissions(
                this.conversationStore.actionId, this.conversationStore.context, this.handleSubmissionChange,
            )
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
        this.unsubscribeSubmissions?.()
        this.unsubscribeBinding = null
        this.unsubscribeConversation = null
        this.unsubscribeRun = null
        this.unsubscribeSubmissions = null
        this.subscribedRunId = null
        this.loaded = false
        this.resetConversationState()
        this.expandedGroupKeys.clear()
        this.stableGroups = EMPTY_GROUPS
        this.evolvingGroups = EMPTY_GROUPS
        this.conversationEvolvingGroups = EMPTY_GROUPS;
        this.reservedBlockCount = 0
        this.prompts.clear();
        this.unsentGroups = EMPTY_GROUPS;
    }

    getPrompt(id: string) {
        return this.prompts.get(id) ?? null;
    }

    readonly getStableGroups = () => this.stableGroups
    readonly getEvolvingGroups = () => this.evolvingGroups
    readonly getReservedBlockCount = () => this.reservedBlockCount
    readonly getCardInternalId = () => this.conversation?.cardInternalId ?? null
    readonly getConversation = () => this.conversation

    readonly getConversationStatus = () => this.conversationStatus
    readonly getConversationIdentity = () => this.conversation?.id ?? null
    readonly groupIsExpanded = (key: string) => this.expandedGroupKeys.has(key)

    readonly subscribeStableGroups = (listener: () => void) => this.subscribe(STABLE_GROUPS_CHANGED_EVENT, listener)
    readonly subscribeEvolvingGroups = (listener: () => void) => this.subscribe(EVOLVING_GROUPS_CHANGED_EVENT, listener)
    readonly subscribeReservedBlockCount = (listener: () => void) => (
        this.subscribe(RESERVED_BLOCK_COUNT_CHANGED_EVENT, listener)
    )
    readonly subscribeConversation = (listener: () => void) => this.subscribe(CONVERSATION_CHANGED_EVENT, listener)

    readonly subscribeConversationStatus = (listener: () => void) => this.subscribe(CONVERSATION_STATUS_CHANGED_EVENT, listener)

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

    private readonly handleSubmissionChange = () => {
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

        const submissions = this.runRegistry.getVisibleSubmissions(
            this.conversationStore.actionId, this.conversationStore.context, conversation?.id ?? null, boundRunId,
        )
        const acceptedPrompts = submissions
            .filter((submission) => submission.state === 'queued'
                && !!submission.prompt
                && !conversation?.entries.some((entry) => entry.kind === 'message' && entry.id === submission.id)
                && !queuedPrompts.some(({ id }) => id === submission.prompt?.id))
            .map((submission) => submission.prompt as ActionQueuedPrompt)
        const displayedQueuedPrompts = acceptedPrompts.length > 0
            ? [...queuedPrompts, ...acceptedPrompts]
            : queuedPrompts

        this.updatePrompts(conversation, submissions, displayedQueuedPrompts, runId);
        this.applyConversation(conversation, change, status);
        for (const prompt of this.prompts.values()) prompt.notify();
    }

    private updatePrompts(
        conversation: AgentConversation | null,
        submissions: PendingActionSubmission[],
        queuedPrompts: ActionQueuedPrompt[],
        runId: string | null,
    ) {
        const sentMessages = conversation?.entries.filter((entry) => entry.kind === 'message' && entry.role === 'user') ?? [];
        const sentIds = new Set(sentMessages.map(({ id }) => id));
        const queuedIds = new Set(queuedPrompts.map(({ id }) => id));
        const unsent = new Map<string, ActionConversationPrompt>();
        for (const submission of submissions) {
            const { content, error, id, state, prompt } = submission;
            if (sentIds.has(id) || queuedIds.has(id)) continue;
            const snapshot: ActionConversationPromptSnapshot = { content, error, prompt, runId, state };
            unsent.set(id, this.updatePrompt(id, snapshot));
        }
        for (const entry of queuedPrompts) {
            const { content, dispatchState, id } = entry;
            if (sentIds.has(id)) continue;
            const snapshot: ActionConversationPromptSnapshot = {content, prompt: entry, runId, state: dispatchState === 'dispatching' ? 'sending' : 'queued'};
            unsent.set(id, this.updatePrompt(id, snapshot));
        }
        for (const message of sentMessages) {
            if (message.kind !== 'message') continue;
            const prompt = this.prompts.get(message.id);
            if (prompt) {
                const snapshot: ActionConversationPromptSnapshot = { content: message.content, prompt: null, runId, state: 'sent' };
                prompt.apply(snapshot, message);
            }
            unsent.delete(message.id);
        }
        this.unsentGroups = [...unsent.values()].map(({ entry }) => ({ entry, key: entry.id, kind: 'entry' }));
    }

    private updatePrompt(id: string, snapshot: ActionConversationPromptSnapshot) {
        const current = this.prompts.get(id);
        if (current) {
            current.apply(snapshot);
            return current;
        }
        const prompt = new ActionConversationPrompt(id, snapshot);
        this.prompts.set(id, prompt);
        return prompt;
    }

    private promptGroups(groups: ActionConversationRenderGroup[]) {
        return groups.map((group) => {
            if (group.kind !== 'entry' || group.entry.kind !== 'message') return group;
            const prompt = this.prompts.get(group.entry.id);
            return prompt && group.entry !== prompt.entry ? { ...group, entry: prompt.entry } : group;
        });
    }

    private applyConversation(
        conversation: AgentConversation | null,
        change: ActionConversationChange | null,
        status: PopupRunStatus,
    ) {
        const previousConversation = this.conversation
        const previousConversationStatus = this.conversationStatus
        const identityChanged = previousConversation?.id !== conversation?.id
        const displayedConversationChanged = previousConversation?.id !== conversation?.id
            || previousConversation?.path !== conversation?.path
            || previousConversation?.cardInternalId !== conversation?.cardInternalId
        const conversationStatusChanged = previousConversationStatus !== (conversation?.status ?? null)
        if (identityChanged) {
            this.resetConversationState()
            this.expandedGroupKeys.clear()
        }

        const conversationChanged = previousConversation !== conversation || this.conversationChange !== change
        const statusChanged = this.status !== status
        if (!conversationChanged && !statusChanged && !conversationStatusChanged) {
            this.publishViewChanges(this.stableGroups, this.conversationEvolvingGroups, this.reservedBlockCount)
            return
        }

        if (!conversation) {
            this.resetConversationState()
            this.publishViewChanges(EMPTY_GROUPS, EMPTY_GROUPS, 0)
            if (conversationStatusChanged || displayedConversationChanged) {
                this.dispatchEvent(new Event(CONVERSATION_STATUS_CHANGED_EVENT))
            }
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
        let evolvingGroups = this.conversationEvolvingGroups
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
            : this.conversationEvolvingGroups
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
        this.conversationStatus = conversation.status
        this.conversationChange = change
        this.providerSessions = conversation.providerSessions
        this.reservationGroups = nextReservationGroups
        this.stableEntryCount = stableEntryCount
        this.status = status
        this.publishViewChanges(stableGroups, evolvingGroups, reservedBlockCount)
        if (conversationStatusChanged || displayedConversationChanged) {
            this.dispatchEvent(new Event(CONVERSATION_STATUS_CHANGED_EVENT))
        }
        if (displayedConversationChanged) this.dispatchEvent(new Event(CONVERSATION_CHANGED_EVENT))
    }

    private resetConversationState() {
        this.conversation = null
        this.conversationStatus = null
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
    ) {
        this.conversationEvolvingGroups = evolvingGroups;
        stableGroups = reconcileRenderGroups(this.stableGroups, this.promptGroups(stableGroups));
        evolvingGroups = reconcileRenderGroups(this.evolvingGroups, [...this.promptGroups(evolvingGroups), ...this.unsentGroups]);
        const stableGroupsChanged = this.stableGroups !== stableGroups
        const evolvingGroupsChanged = this.evolvingGroups !== evolvingGroups
        const reservedBlockCountChanged = this.reservedBlockCount !== reservedBlockCount
        this.stableGroups = stableGroups
        this.evolvingGroups = evolvingGroups
        this.reservedBlockCount = reservedBlockCount
        if (stableGroupsChanged) this.dispatchEvent(new Event(STABLE_GROUPS_CHANGED_EVENT))
        if (evolvingGroupsChanged) this.dispatchEvent(new Event(EVOLVING_GROUPS_CHANGED_EVENT))
        if (reservedBlockCountChanged) this.dispatchEvent(new Event(RESERVED_BLOCK_COUNT_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}
