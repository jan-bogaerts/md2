import type { ActionContext } from '../../../data/action_context'
import type { AgentConversation } from '../../../data/data_types'
import { actionPromptDraftService } from '../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../services/actions/action_run_registry'
import { dialogService } from '../../../services/dialog_service'
import type { ConversationPickerConversation } from './action_conversation_picker_data'
import { defaultLoadConversation, defaultLoadConversations } from '../run/popup/action_popup_defaults'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ActionConversationSnapshot {
    conversations: AgentConversation[]
    loading: boolean
    selectedConversation: AgentConversation | null
}

interface ConversationIdentity {
    id: string
}

type Listener = () => void

/** A context without a card identity owns the project-origin conversations, whatever its kind. */
function belongsToContext(conversation: ConversationPickerConversation, context: ActionContext) {
    return conversation.cardInternalId === (context.cardInternalId ?? null)
}

function conversationTimestamp(conversation: ConversationPickerConversation) {
    const timestamp = Date.parse(conversation.startedAt)

    return Number.isNaN(timestamp) ? 0 : timestamp
}

/** Resolves explicit history selection without replacing matching live data with persisted data. */
export function resolveDisplayedConversation<T extends ConversationIdentity>(liveConversation: T | null, selectedConversation: T | null) {
    if (!selectedConversation || selectedConversation.id === liveConversation?.id) return liveConversation ?? selectedConversation

    return selectedConversation
}

/** Identifies history display that must not route controls to an active run. */
export function isBrowsingHistoricalConversation(
    liveConversation: ConversationIdentity | null,
    selectedConversation: ConversationIdentity | null,
    sessionActive: boolean,
) {
    return sessionActive && !!selectedConversation && selectedConversation.id !== liveConversation?.id
}

export function conversationOptions<T extends ConversationPickerConversation>(
    conversations: T[],
    actionId: string,
    context: ActionContext,
    liveConversations: T[],
) {
    const byId = new Map<string, T>()
    for (const conversation of conversations) {
        if (belongsToContext(conversation, context) && conversation.actionId === actionId) {
            byId.set(conversation.id, conversation)
        }
    }
    for (const liveConversation of liveConversations) {
        if (belongsToContext(liveConversation, context) && liveConversation.actionId === actionId) {
            byId.set(liveConversation.id, liveConversation)
        }
    }

    return [...byId.values()].sort((left, right) => conversationTimestamp(right) - conversationTimestamp(left))
}

function latestWaitingConversation(conversations: AgentConversation[], actionId: string, context: ActionContext) {
    return conversations
        .filter((conversation) => belongsToContext(conversation, context)
            && conversation.actionId === actionId
            && conversation.status === 'waitingForInput')
        .sort((left, right) => conversationTimestamp(right) - conversationTimestamp(left))[0] ?? null
}

/** Owns history loading and selection for one popup action/context binding. */
export class ActionConversationStore {
    private readonly actionId: string
    readonly bindingStore: ActionRunBindingStore
    private readonly context: ActionContext
    private initialSelectionConfigured = false
    private initialSelectionPath: string | null = null
    private loadRequest = 0
    private readonly listeners = new Set<Listener>()
    private snapshot: ActionConversationSnapshot = { conversations: [], loading: true, selectedConversation: null }

    constructor(actionId: string, context: ActionContext, bindingStore: ActionRunBindingStore) {
        this.actionId = actionId
        this.bindingStore = bindingStore
        this.context = context
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: Listener) => {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    /** Sets one automatic selection consumed by initial history load. */
    configureInitialSelection(path: string | null) {
        if (this.initialSelectionConfigured) return

        this.initialSelectionConfigured = true
        this.initialSelectionPath = path
    }

    async load() {
        const request = this.loadRequest + 1
        this.loadRequest = request
        if (this.snapshot.conversations.length === 0) this.setSnapshot({ ...this.snapshot, loading: true })
        try {
            const conversations = await defaultLoadConversations(this.context)
            if (request !== this.loadRequest) return

            const boundRunId = this.bindingStore.getSnapshot()
            const run = boundRunId ? actionRunRegistry.getRunStore(boundRunId)?.getSnapshot() ?? null : null
            const runActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
            const refreshedSelection = this.snapshot.selectedConversation
                ? conversations.find(({ path }) => path === this.snapshot.selectedConversation?.path) ?? this.snapshot.selectedConversation
                : null
            let selectedConversation = runActive
                ? refreshedSelection
                : refreshedSelection ?? latestWaitingConversation(conversations, this.actionId, this.context)
            const initialSelectionPath = this.initialSelectionPath
            this.initialSelectionPath = null
            if (!runActive && !selectedConversation && initialSelectionPath) {
                try {
                    const loadedConversation = await defaultLoadConversation(initialSelectionPath)
                    if (request !== this.loadRequest) return
                    this.validateSelection(loadedConversation)
                    selectedConversation = loadedConversation
                } catch (error) {
                    if (request !== this.loadRequest) return

                    this.setSnapshot({ conversations, loading: false, selectedConversation: null })
                    dialogService.error(error, { fallbackMessage: 'Could not load agent conversation' })
                    return
                }
            }
            this.setSnapshot({ conversations, loading: false, selectedConversation })
            if (selectedConversation && !runActive) {
                actionPromptDraftService.discardUneditedDraft(this.actionId, this.context, this.bindingStore.getSnapshot())
            }
        } catch (error) {
            if (request !== this.loadRequest) return

            this.setSnapshot({ conversations: [], loading: false, selectedConversation: null })
            dialogService.error(error, { fallbackMessage: 'Could not load agent conversations' })
        }
    }

    async select(path: string) {
        const request = this.loadRequest + 1
        this.loadRequest = request
        if (!path) {
            this.bindingStore.setRunId(null)
            this.setSnapshot({ ...this.snapshot, selectedConversation: null })
            this.clearPromptDraftWhenIdle()
            return
        }

        const liveRun = actionRunRegistry.getActionRunStores(this.actionId, this.context)
            .find((store) => store.getSnapshot().conversation?.path === path)
        if (liveRun) {
            this.bindingStore.setRunId(liveRun.getSnapshot().runId)
            this.setSnapshot({ ...this.snapshot, selectedConversation: null })
            return
        }

        try {
            const conversation = await defaultLoadConversation(path)
            if (request !== this.loadRequest) return
            this.validateSelection(conversation)

            this.bindingStore.setRunId(null)
            this.setSnapshot({ ...this.snapshot, selectedConversation: conversation })
            this.clearPromptDraftWhenIdle()
        } catch (error) {
            if (request === this.loadRequest) {
                dialogService.error(error, { fallbackMessage: 'Could not load agent conversation' })
            }
        }
    }

    conversationOptions(liveConversations: AgentConversation[]): AgentConversation[]
    conversationOptions(liveConversations: ConversationPickerConversation[]): ConversationPickerConversation[]
    conversationOptions(liveConversations: ConversationPickerConversation[]) {
        const selected = this.snapshot.selectedConversation
        const conversations = selected ? [...this.snapshot.conversations, selected] : this.snapshot.conversations

        return conversationOptions(conversations, this.actionId, this.context, liveConversations)
    }

    continuationPath(liveConversation: AgentConversation | null) {
        return liveConversation?.path ?? this.snapshot.selectedConversation?.path ?? null
    }

    /** Applies one backend-returned conversation without another persistence round trip. */
    updateConversation(conversation: AgentConversation) {
        this.validateSelection(conversation)
        const conversations = this.snapshot.conversations.some(({ path }) => path === conversation.path)
            ? this.snapshot.conversations.map((current) => (current.path === conversation.path ? conversation : current))
            : [...this.snapshot.conversations, conversation]
        const selectedConversation = this.snapshot.selectedConversation?.path === conversation.path
            ? conversation
            : this.snapshot.selectedConversation
        this.setSnapshot({ ...this.snapshot, conversations, selectedConversation })
    }

    private clearPromptDraftWhenIdle() {
        const boundRunId = this.bindingStore.getSnapshot()
        const run = boundRunId ? actionRunRegistry.getRunStore(boundRunId)?.getSnapshot() ?? null : null
        const runActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
        if (runActive) return

        actionPromptDraftService.discardUneditedDraft(this.actionId, this.context, this.bindingStore.getSnapshot())
    }

    private validateSelection(conversation: AgentConversation) {
        if (!belongsToContext(conversation, this.context)) throw new Error('Selected agent conversation belongs to another context')
        if (conversation.actionId !== this.actionId) throw new Error('Selected agent conversation belongs to another action')
    }

    private setSnapshot(snapshot: ActionConversationSnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
