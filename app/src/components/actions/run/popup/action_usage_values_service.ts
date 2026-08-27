import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { actionRunRegistry, type ActionRunStore } from '../../../../services/actions/action_run_registry'
import { resolveDisplayedConversation, type ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'
import {
    scopedActionUsage,
    type ActionUsageValues,
    type ScopedActionUsage,
} from './action_usage_summary_data'
import type { ActionUsageScope, ActionUsageScopeStore } from './action_usage_scope_store'

export interface ActionUsageValuesSnapshot extends ScopedActionUsage {
    activeScope: ActionUsageScope
    conversationAvailable: boolean
}

interface ActionUsageValuesServiceInput {
    action: ActionDefinition
    bindingStore: ActionRunBindingStore
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    scopeStore: ActionUsageScopeStore
}

const CHANGED_EVENT = 'changed'

function snapshotsMatch(first: ActionUsageValuesSnapshot | null, second: ActionUsageValuesSnapshot | null) {
    if (first === second) return true
    if (!first || !second) return false

    return first.activeScope === second.activeScope
        && first.conversationAvailable === second.conversationAvailable
        && usageValuesMatch(first.actionCard, second.actionCard)
        && optionalUsageValuesMatch(first.conversation, second.conversation)
}

function changesMatch(first: ActionUsageValues['changes'], second: ActionUsageValues['changes']) {
    if (first === second) return true
    if (!first || !second) return false

    return first.deletions === second.deletions && first.insertions === second.insertions
}

function commitsMatch(first: ActionUsageValues['lines']['commits'], second: ActionUsageValues['lines']['commits']) {
    return first.length === second.length && first.every((commit, index) => {
        const compared = second[index]

        return commit.commit === compared.commit
            && commit.deletions === compared.deletions
            && commit.insertions === compared.insertions
            && commit.repositoryRoot === compared.repositoryRoot
    })
}

function usageValuesMatch(first: ActionUsageValues, second: ActionUsageValues) {
    return changesMatch(first.changes, second.changes)
        && first.lines.deletions === second.lines.deletions
        && first.lines.filesChanged === second.lines.filesChanged
        && first.lines.insertions === second.lines.insertions
        && commitsMatch(first.lines.commits, second.lines.commits)
        && first.tokens.totalTokens === second.tokens.totalTokens
}

function optionalUsageValuesMatch(first: ActionUsageValues | null, second: ActionUsageValues | null) {
    if (first === second) return true
    if (!first || !second) return false

    return usageValuesMatch(first, second)
}

/** Owns stable values depicted by one action popup usage footer. */
export class ActionUsageValuesService extends EventTarget {
    private readonly action: ActionDefinition
    private readonly bindingStore: ActionRunBindingStore
    private readonly context: ActionContext
    private readonly conversationStore: ActionConversationStore
    private readonly historyStore: ActionHistoryStore
    private runStores: ActionRunStore[] = []
    private readonly scopeStore: ActionUsageScopeStore
    private snapshot: ActionUsageValuesSnapshot | null = null
    private unsubscribers: (() => void)[] = []

    constructor(input: ActionUsageValuesServiceInput) {
        super()
        this.action = input.action
        this.bindingStore = input.bindingStore
        this.context = input.context
        this.conversationStore = input.conversationStore
        this.historyStore = input.historyStore
        this.scopeStore = input.scopeStore
        this.runStores = actionRunRegistry.getActionRunStores(this.action.id, this.context)
        this.recalculate()
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: () => void) => {
        this.addEventListener(CHANGED_EVENT, listener)

        return () => this.removeEventListener(CHANGED_EVENT, listener)
    }

    start() {
        if (this.unsubscribers.length > 0) return

        this.unsubscribers = [
            actionRunRegistry.subscribeActionRun(this.action.id, this.context, this.handleRunCollectionChange),
            actionRunRegistry.subscribeContextEvents(this.context, this.handleRunEvent),
            this.bindingStore.subscribe(this.recalculate),
            this.conversationStore.subscribe(this.recalculate),
            this.historyStore.subscribe(this.recalculate),
            this.scopeStore.subscribe(this.recalculate),
        ]
        this.recalculate()
        void this.historyStore.load()
    }

    stop() {
        for (const unsubscribe of this.unsubscribers) unsubscribe()
        this.unsubscribers = []
    }

    readonly toggleScope = () => {
        this.scopeStore.toggle(this.snapshot?.conversationAvailable ?? false)
    }

    private readonly handleRunEvent = (event: ActionRunEvent) => {
        if (event.rootActionId !== this.action.id || event.type !== 'update') return
        if (event.update.kind === 'agentUsage' || event.update.kind === 'agentStarted' || event.update.kind === 'agentClosed') {
            this.recalculate()
            return
        }
        if (
            event.update.kind === 'agentEvent'
            && event.update.event.type === 'fileChange'
            && event.update.event.status === 'completed'
        ) this.recalculate()
    }

    private readonly handleRunCollectionChange = () => {
        const runStores = actionRunRegistry.getActionRunStores(this.action.id, this.context)
        const membershipChanged = runStores.length !== this.runStores.length
            || runStores.some((store, index) => store !== this.runStores[index])
        if (!membershipChanged) return

        this.runStores = runStores
        this.recalculate()
    }

    private readonly recalculate = () => {
        const cardInternalId = this.context.cardInternalId
        if (this.context.kind !== 'card' || !this.context.file || !cardInternalId || this.action.type !== 'agent') {
            this.publish(null)
            return
        }

        const boundRunId = this.bindingStore.getSnapshot()
        const liveConversation = boundRunId
            ? actionRunRegistry.getRunStore(boundRunId)?.getSnapshot().conversation ?? null
            : null
        const liveConversations = actionRunRegistry.getActionRunStores(this.action.id, this.context)
            .map(({ getSnapshot }) => getSnapshot().conversation)
            .filter((conversation) => !!conversation)
        const conversationSnapshot = this.conversationStore.getSnapshot()
        const displayedConversation = resolveDisplayedConversation(
            liveConversation,
            conversationSnapshot.selectedConversation,
        )
        const conversations = this.conversationStore.conversationOptions(liveConversations)
        const usage = scopedActionUsage(
            conversations,
            liveConversation,
            displayedConversation,
            this.historyStore.getSnapshot().entries,
            this.action.id,
            cardInternalId,
        )
        const conversationAvailable = !!displayedConversation
        if (!conversationAvailable) this.scopeStore.useActionCardScope()
        const requestedScope = this.scopeStore.getSnapshot()
        const activeScope = requestedScope === 'conversation' && usage.conversation ? 'conversation' : 'actionCard'
        this.publish({ ...usage, activeScope, conversationAvailable })
    }

    private publish(snapshot: ActionUsageValuesSnapshot | null) {
        if (snapshotsMatch(this.snapshot, snapshot)) return

        this.snapshot = snapshot
        this.dispatchEvent(new Event(CHANGED_EVENT))
    }
}
