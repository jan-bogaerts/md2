import { describe, expect, it, vi } from 'vitest'
import type { PinnedConversationLocator } from '../../data/data_types'
import { ConversationPinService } from './conversation_pin_service'

function createService(initialPinnedConversations: PinnedConversationLocator[] = []) {
    const configEvents = new EventTarget()
    let pinnedConversations = initialPinnedConversations
    const saveConversationPinned = vi.fn(async (locator: PinnedConversationLocator, pinned: boolean) => {
        pinnedConversations = pinned
            ? [...pinnedConversations.filter(({ conversationId }) => conversationId !== locator.conversationId), locator]
            : pinnedConversations.filter(({ conversationId }) => conversationId !== locator.conversationId)
        configEvents.dispatchEvent(new Event('changed'))

        return pinnedConversations
    })
    const service = new ConversationPinService({
        getPinnedConversations: () => pinnedConversations,
        saveConversationPinned,
        subscribeConfig: (listener) => {
            configEvents.addEventListener('changed', listener)

            return () => configEvents.removeEventListener('changed', listener)
        },
    })

    return {
        announceConfigChanged: (nextPinnedConversations: PinnedConversationLocator[]) => {
            pinnedConversations = nextPinnedConversations
            configEvents.dispatchEvent(new Event('changed'))
        },
        saveConversationPinned,
        service,
    }
}

describe('ConversationPinService', () => {
    it('publishes scoped changes after config persistence', async () => {
        const locator = { cardInternalId: 'card-1', contextKind: 'card' as const, conversationId: 'conversation-1' }
        const { saveConversationPinned, service } = createService()
        const conversationListener = vi.fn()
        const aggregateListener = vi.fn()
        service.start()
        service.subscribeConversation('conversation-1', conversationListener)
        service.subscribe(aggregateListener)

        await service.setPinned(locator, true)

        expect(saveConversationPinned).toHaveBeenCalledWith(locator, true)
        expect(service.getSnapshot()).toEqual([locator])
        expect(service.isPinned('conversation-1')).toBe(true)
        expect(conversationListener).toHaveBeenCalledOnce()
        expect(aggregateListener).toHaveBeenCalledOnce()
    })

    it('keeps confirmed project list when config persistence fails', async () => {
        const locator = { contextKind: 'project' as const, conversationId: 'conversation-1' }
        const configEvents = new EventTarget()
        const saveConversationPinned = vi.fn(async () => {
            throw new Error('disk failed')
        })
        const service = new ConversationPinService({
            getPinnedConversations: () => [locator],
            saveConversationPinned,
            subscribeConfig: (listener) => {
                configEvents.addEventListener('changed', listener)

                return () => configEvents.removeEventListener('changed', listener)
            },
        })
        service.start()

        await expect(service.setPinned(locator, false)).rejects.toThrow('disk failed')
        expect(service.getSnapshot()).toEqual([locator])
    })

    it('reloads pin identities when canonical config changes', () => {
        const locator = { contextKind: 'diagram' as const, conversationId: 'conversation-2' }
        const { announceConfigChanged, service } = createService()
        service.start()

        announceConfigChanged([locator])

        expect(service.getSnapshot()).toEqual([locator])
    })
})
