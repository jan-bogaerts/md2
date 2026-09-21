import type { PinnedConversationLocator } from '../../data/data_types'

const PINNED_CONVERSATIONS_CHANGED_EVENT = 'pinned-conversations'

function locatorsEqual(left: PinnedConversationLocator[], right: PinnedConversationLocator[]) {
    return left.length === right.length && left.every((locator, index) => {
        const other = right[index]

        return locator.cardInternalId === other.cardInternalId
            && locator.contextKind === other.contextKind
            && locator.conversationId === other.conversationId
    })
}

export function conversationPinnedEvent(conversationId: string) {
    return `conversation-pinned-${conversationId}`
}

interface ConversationPinServiceDependencies {
    getPinnedConversations(): PinnedConversationLocator[]
    saveConversationPinned(locator: PinnedConversationLocator, pinned: boolean): Promise<PinnedConversationLocator[]>
    subscribeConfig(listener: () => void): () => void
}

/** Owns the current project's pinned conversation identities independently of conversation records. */
export class ConversationPinService {
    private cleanup: (() => void) | null = null
    private readonly dependencies: ConversationPinServiceDependencies
    private readonly events = new EventTarget()
    private pinnedConversations: PinnedConversationLocator[] = []

    constructor(dependencies: ConversationPinServiceDependencies) {
        this.dependencies = dependencies
    }

    readonly getSnapshot = () => this.pinnedConversations

    isPinned(conversationId: string) {
        return this.pinnedConversations.some((locator) => locator.conversationId === conversationId)
    }

    readonly subscribe = (listener: () => void) => {
        this.events.addEventListener(PINNED_CONVERSATIONS_CHANGED_EVENT, listener)

        return () => this.events.removeEventListener(PINNED_CONVERSATIONS_CHANGED_EVENT, listener)
    }

    subscribeConversation(conversationId: string, listener: () => void) {
        const eventType = conversationPinnedEvent(conversationId)
        this.events.addEventListener(eventType, listener)

        return () => this.events.removeEventListener(eventType, listener)
    }

    start() {
        if (this.cleanup) return
        this.cleanup = this.dependencies.subscribeConfig(() => this.reload())
        this.reload()
    }

    reset() {
        this.replace([])
    }

    stop() {
        this.cleanup?.()
        this.cleanup = null
    }

    /** Persists before publishing, so failures leave the last confirmed list intact. */
    async setPinned(locator: PinnedConversationLocator, pinned: boolean) {
        if (!locator.conversationId) throw new Error('Missing conversation identity')
        const pinnedConversations = await this.dependencies.saveConversationPinned(locator, pinned)
        this.replace(pinnedConversations)
    }

    private reload() {
        this.replace(this.dependencies.getPinnedConversations())
    }

    private replace(pinnedConversations: PinnedConversationLocator[]) {
        if (!Array.isArray(pinnedConversations)
            || !pinnedConversations.every((locator) => locator
                && typeof locator.contextKind === 'string' && locator.contextKind.length > 0
                && typeof locator.conversationId === 'string' && locator.conversationId.length > 0)) {
            throw new Error('Invalid pinned conversation locators')
        }
        const conversationIds = pinnedConversations.map(({ conversationId }) => conversationId)
        if (new Set(conversationIds).size !== pinnedConversations.length) {
            throw new Error('Duplicate pinned conversation identities')
        }
        const previous = this.pinnedConversations
        if (locatorsEqual(previous, pinnedConversations)) return

        this.pinnedConversations = pinnedConversations.map((locator) => ({ ...locator }))
        const changedConversationIds = new Set([
            ...previous.map(({ conversationId }) => conversationId),
            ...this.pinnedConversations.map(({ conversationId }) => conversationId),
        ])
        for (const conversationId of changedConversationIds) {
            const wasPinned = previous.some((locator) => locator.conversationId === conversationId)
            if (wasPinned === this.isPinned(conversationId)) continue
            this.events.dispatchEvent(new Event(conversationPinnedEvent(conversationId)))
        }
        this.events.dispatchEvent(new Event(PINNED_CONVERSATIONS_CHANGED_EVENT))
    }
}
