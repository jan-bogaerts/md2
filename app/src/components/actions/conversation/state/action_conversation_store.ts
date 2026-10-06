import type { ActionContext } from '../../../../data/action_context'
import type { AgentConversation } from '../../../../data/data_types'
import type { ActionQueuedPrompt, ActionRunEvent } from '../../../../data/action_run_types'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { dialogService } from '../../../../services/dialog_service'
import { dataService } from '../../../../services/data/data_service'
import { generateUuid } from '../../../../data/uuid'
import type { ConversationPickerConversation } from '../picker/action_conversation_picker_data'
import { defaultLoadConversation, defaultLoadConversations } from '../../run/popup/action_popup_defaults'
import type { ActionRunBindingStore } from '../../run/state/action_run_binding_store'

interface ActionConversationSnapshot {
    conversations: AgentConversation[]
    loading: boolean
    pinningConversationId: string | null
    selectedConversation: AgentConversation | null
}

function initialConversationSnapshot(): ActionConversationSnapshot {
    return { conversations: [], loading: true, pinningConversationId: null, selectedConversation: null }
}

interface ConversationIdentity {
    id: string
}

type Listener = () => void

export interface PendingActionSubmission {
    content: string
    error?: string
    id: string
    prompt: ActionQueuedPrompt | null
    state: 'transmitting' | 'queued' | 'failed'
}

interface SubmissionOwner {
    conversationId: string | null
    runId: string | null
}

const SUBMISSIONS_CHANGED_EVENT = 'submissionsChanged'

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
    private readonly submissionEvents = new EventTarget()
    private submissions: PendingActionSubmission[] = []
    private readonly submissionOwners = new Map<string, SubmissionOwner>()
    private bufferedRunEvents: ActionRunEvent[] = []
    private unsubscribeRunEvents: (() => void) | null = null
    private snapshot = initialConversationSnapshot()

    constructor(actionId: string, context: ActionContext, bindingStore: ActionRunBindingStore) {
        this.actionId = actionId
        this.bindingStore = bindingStore
        this.context = context
    }

    readonly getSnapshot = () => this.snapshot

    readonly getSubmissions = () => this.submissions

    readonly subscribeSubmissions = (listener: Listener) => {
        this.submissionEvents.addEventListener(SUBMISSIONS_CHANGED_EVENT, listener)

        return () => this.submissionEvents.removeEventListener(SUBMISSIONS_CHANGED_EVENT, listener)
    }

    /** Captures submitted text before backend work starts. */
    beginSubmission(content: string, runId: string | null, conversationId?: string) {
        if (!this.unsubscribeRunEvents) {
            this.unsubscribeRunEvents = actionRunRegistry.subscribeContextEvents(this.context, this.handleRunEvent)
        }
        const id = `submission-${generateUuid()}`
        const boundRunId = this.bindingStore.getSnapshot()
        const liveConversation = boundRunId ? actionRunRegistry.getRunStore(boundRunId)?.getSnapshot().conversation : null
        const ownerConversationId = conversationId ?? this.snapshot.selectedConversation?.id ?? liveConversation?.id
        if (!ownerConversationId && !runId) throw new Error('Starting a conversation requires its ID')
        const submission: PendingActionSubmission = { content, id, prompt: null, state: 'transmitting' }
        this.submissionOwners.set(id, { conversationId: ownerConversationId ?? null, runId })
        this.publishSubmissions([...this.submissions, submission])

        return id
    }

    bindSubmission(id: string, runId: string) {
        const owner = this.submissionOwners.get(id)
        if (!owner) throw new Error(`Unknown submission: ${id}`)
        this.submissionOwners.set(id, { ...owner, runId })
        this.submissionEvents.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT))
        const buffered = this.bufferedRunEvents.filter((event) => event.runId === runId)
        this.bufferedRunEvents = this.bufferedRunEvents.filter((event) => event.runId !== runId)
        for (const event of buffered) this.handleRunEvent(event)
    }

    acceptSubmission(id: string, prompt: ActionQueuedPrompt) {
        const current = this.submissions.find((submission) => submission.id === id)
        if (!current || current.state === 'failed') return
        if (prompt.id !== id) throw new Error(`Queued prompt ID does not match submitted message ID: ${id}`)
        this.changeSubmission(id, (submission) => ({
            ...submission,
            prompt,
            state: 'queued',
        }))
    }

    failSubmission(id: string, error: string) {
        const submission = this.submissions.find((current) => current.id === id)
        if (!submission || submission.state === 'failed') return
        this.changeSubmission(id, (current) => ({ ...current, error, state: 'failed' }))
    }

    removeSubmission(id: string) {
        this.submissionOwners.delete(id)
        this.publishSubmissions(this.submissions.filter((submission) => submission.id !== id))
    }

    dispose() {
        this.unsubscribeRunEvents?.()
        this.unsubscribeRunEvents = null
        this.bufferedRunEvents = []
        this.submissionOwners.clear()
        this.publishSubmissions([])
    }

    private readonly handleRunEvent = (event: ActionRunEvent) => {
        if (event.actionId !== this.actionId) return
        const submissions = this.submissions.filter((submission) => (
            this.submissionOwners.get(submission.id)?.runId === event.runId && submission.state !== 'failed'
        ))
        if (submissions.length === 0) {
            const isRelevantUpdate = event.type === 'update' && (
                event.update.kind === 'agentStarted'
                || event.update.kind === 'agentUserMessage'
                || event.update.kind === 'agentPromptQueued'
                || event.update.kind === 'agentPromptDeleted'
                || event.update.kind === 'agentPromptDiscarded'
                || event.update.kind === 'agentPromptDispatched'
            )
            if (this.submissions.some((submission) => this.submissionOwners.get(submission.id)?.runId === null)
                && (isRelevantUpdate || event.type === 'run')) {
                this.bufferedRunEvents.push(event)
            }
            return
        }
        if (event.type === 'run' && event.status !== 'queued' && event.status !== 'running'
            && event.status !== 'waitingForInput') {
            for (const submission of submissions) {
                this.failSubmission(submission.id, 'Run ended before the prompt was sent')
            }
            return
        }
        if (event.type !== 'update') return
        if (event.update.kind === 'agentStarted') {
            const { continued, conversation } = event.update
            for (const submission of submissions) {
                const owner = this.submissionOwners.get(submission.id)
                if (owner && !owner.conversationId) {
                    this.submissionOwners.set(submission.id, { ...owner, conversationId: conversation.id })
                }
            }
            this.submissionEvents.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT))
            if (!continued && submissions.length > 0) {
                actionPromptDraftService.attachNewConversation(this.actionId, this.context, conversation.id)
            }
        }
        if (event.update.kind === 'agentPromptQueued') {
            const { entry } = event.update
            const submission = submissions.find((current) => current.id === entry.id)
            if (submission) this.acceptSubmission(submission.id, entry)
        }
        if (event.update.kind === 'agentPromptDeleted' || event.update.kind === 'agentPromptDiscarded') {
            const { promptId } = event.update
            const submission = submissions.find((current) => current.id === promptId)
            if (submission) this.removeSubmission(submission.id)
        }
        if (event.update.kind === 'agentUserMessage') {
            const { userMessage } = event.update
            const submission = submissions.find((current) => current.id === userMessage.id)
            if (submission) this.removeSubmission(submission.id)
        }
    }

    private changeSubmission(id: string, change: (submission: PendingActionSubmission) => PendingActionSubmission) {
        const submission = this.submissions.find((current) => current.id === id)
        if (!submission) return
        this.publishSubmissions(this.submissions.map((current) => current.id === id ? change(current) : current))
    }

    private publishSubmissions(submissions: PendingActionSubmission[]) {
        this.submissions = submissions
        this.submissionEvents.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT))
        if (submissions.every((submission) => submission.state === 'failed')) {
            this.unsubscribeRunEvents?.()
            this.unsubscribeRunEvents = null
            this.bufferedRunEvents = []
        }
    }

    getVisibleSubmissions(conversationId: string | null, runId: string | null) {
        return this.submissions.filter((submission) => {
            const owner = this.submissionOwners.get(submission.id)
            return !!owner && (conversationId ? owner.conversationId === conversationId : owner.runId === runId || owner.runId === null)
        })
    }

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
                ? conversations.find(({ id }) => id === this.snapshot.selectedConversation?.id) ?? this.snapshot.selectedConversation
                : null
            let selectedConversation = refreshedSelection
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

                    this.setSnapshot({ conversations, loading: false, pinningConversationId: null, selectedConversation: null })
                    dialogService.error(error, { fallbackMessage: 'Could not load agent conversation' })
                    return
                }
            }
            if (!runActive && !selectedConversation) {
                selectedConversation = latestWaitingConversation(conversations, this.actionId, this.context)
            }
            this.setSnapshot({ conversations, loading: false, pinningConversationId: null, selectedConversation })
        } catch (error) {
            if (request !== this.loadRequest) return

            this.setSnapshot({ conversations: [], loading: false, pinningConversationId: null, selectedConversation: null })
            dialogService.error(error, { fallbackMessage: 'Could not load agent conversations' })
        }
    }

    async select(conversationId: string) {
        const request = this.loadRequest + 1
        this.loadRequest = request
        if (!conversationId) {
            this.bindingStore.setRunId(null)
            this.setSnapshot({ ...this.snapshot, selectedConversation: null })
            return
        }

        const liveRun = actionRunRegistry.getActionRunStores(this.actionId, this.context)
            .find((store) => store.getSnapshot().conversation?.id === conversationId)
        if (liveRun) {
            this.bindingStore.setRunId(liveRun.getSnapshot().runId)
            this.setSnapshot({ ...this.snapshot, selectedConversation: null })
            return
        }

        try {
            const selected = this.conversationOptions([]).find(({ id }) => id === conversationId)
            if (!selected) throw new Error(`Unknown agent conversation: ${conversationId}`)
            const conversation = await defaultLoadConversation(selected.path)
            if (request !== this.loadRequest) return
            this.validateSelection(conversation)
            if (conversation.id !== conversationId) throw new Error('Loaded agent conversation ID does not match selection')

            this.bindingStore.setRunId(null)
            this.setSnapshot({ ...this.snapshot, selectedConversation: conversation })
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

    async togglePinned(conversation: ConversationPickerConversation) {
        if (this.snapshot.pinningConversationId) return

        this.setSnapshot({ ...this.snapshot, pinningConversationId: conversation.id })
        try {
            const pinned = dataService.conversationPins.isPinned(conversation.id)
            const locator = {
                ...(this.context.cardInternalId ? { cardInternalId: this.context.cardInternalId } : {}),
                contextKind: this.context.kind,
                conversationId: conversation.id,
            }
            await dataService.conversationPins.setPinned(locator, !pinned)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not update conversation pin' })
        } finally {
            if (this.snapshot.pinningConversationId === conversation.id) {
                this.setSnapshot({ ...this.snapshot, pinningConversationId: null })
            }
        }
    }

    /** Applies one backend-returned conversation without another persistence round trip. */
    updateConversation(conversation: AgentConversation) {
        this.validateSelection(conversation)
        const conversations = this.snapshot.conversations.some(({ id }) => id === conversation.id)
            ? this.snapshot.conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...this.snapshot.conversations, conversation]
        const selectedConversation = this.snapshot.selectedConversation?.id === conversation.id
            ? conversation
            : this.snapshot.selectedConversation
        this.setSnapshot({ ...this.snapshot, conversations, selectedConversation })
    }

    /** Adds and selects one backend-created conversation by canonical conversation identity. */
    addAndSelectConversation(conversation: AgentConversation) {
        this.validateSelection(conversation)
        const conversations = this.snapshot.conversations.some(({ id }) => id === conversation.id)
            ? this.snapshot.conversations.map((current) => (current.id === conversation.id ? conversation : current))
            : [...this.snapshot.conversations, conversation]
        this.bindingStore.setRunId(null)
        this.setSnapshot({ ...this.snapshot, conversations, selectedConversation: conversation })
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
