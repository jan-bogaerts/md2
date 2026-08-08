import type { ActionContext } from '../../../data/action_context'
import type { AgentConversation } from '../../../data/data_types'
import { actionPromptDraftService } from '../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../services/actions/action_run_registry'
import { dialogService } from '../../../services/dialog_service'
import type { ConversationPickerConversation } from './action_conversation_picker_data'
import { defaultLoadConversation, defaultLoadConversations } from '../run/popup/action_popup_defaults'

interface ActionConversationSnapshot {
    conversations: AgentConversation[]
    loading: boolean
    selectedConversation: AgentConversation | null
}

type Listener = () => void

function belongsToContext(conversation: ConversationPickerConversation, context: ActionContext) {
    return context.kind === 'project'
        ? conversation.cardInternalId === null
        : conversation.cardInternalId === context.cardInternalId
}

function conversationTimestamp(conversation: ConversationPickerConversation) {
    const timestamp = Date.parse(conversation.startedAt)

    return Number.isNaN(timestamp) ? 0 : timestamp
}

export function conversationOptions<T extends ConversationPickerConversation>(
    conversations: T[],
    actionId: string,
    context: ActionContext,
    liveConversation: T | null,
) {
    const byId = new Map<string, T>()
    for (const conversation of conversations) {
        if (belongsToContext(conversation, context) && conversation.actionId === actionId) {
            byId.set(conversation.id, conversation)
        }
    }
    if (liveConversation && belongsToContext(liveConversation, context) && liveConversation.actionId === actionId) {
        byId.set(liveConversation.id, liveConversation)
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
    private readonly context: ActionContext
    private initialSelectionConfigured = false
    private initialSelectionPath: string | null = null
    private loadRequest = 0
    private readonly listeners = new Set<Listener>()
    private snapshot: ActionConversationSnapshot = { conversations: [], loading: true, selectedConversation: null }

    constructor(actionId: string, context: ActionContext) {
        this.actionId = actionId
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
        this.setSnapshot({ ...this.snapshot, loading: true })
        try {
            const conversations = await defaultLoadConversations(this.context)
            if (request !== this.loadRequest) return

            const run = actionRunRegistry.getActionRunStore(this.actionId, this.context)?.getSnapshot() ?? null
            const runActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
            let selectedConversation = runActive
                ? this.snapshot.selectedConversation
                : this.snapshot.selectedConversation ?? latestWaitingConversation(conversations, this.actionId, this.context)
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
            if (selectedConversation) actionPromptDraftService.clearDraft(this.actionId, this.context, null)
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
            this.setSnapshot({ ...this.snapshot, selectedConversation: null })
            this.clearPromptDraft()
            return
        }

        try {
            const conversation = await defaultLoadConversation(path)
            if (request !== this.loadRequest) return
            this.validateSelection(conversation)

            this.setSnapshot({ ...this.snapshot, selectedConversation: conversation })
            this.clearPromptDraft()
        } catch (error) {
            if (request === this.loadRequest) {
                dialogService.error(error, { fallbackMessage: 'Could not load agent conversation' })
            }
        }
    }

    conversationOptions(liveConversation: AgentConversation | null): AgentConversation[]
    conversationOptions(liveConversation: ConversationPickerConversation | null): ConversationPickerConversation[]
    conversationOptions(liveConversation: ConversationPickerConversation | null) {
        const selected = this.snapshot.selectedConversation
        const conversations = selected ? [...this.snapshot.conversations, selected] : this.snapshot.conversations

        return conversationOptions(conversations, this.actionId, this.context, liveConversation)
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

    private clearPromptDraft() {
        const run = actionRunRegistry.getActionRunStore(this.actionId, this.context)?.getSnapshot() ?? null
        actionPromptDraftService.clearDraft(this.actionId, this.context, run)
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
