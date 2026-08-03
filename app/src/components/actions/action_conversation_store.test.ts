import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { AgentConversation } from '../../data/data_types'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { ActionConversationStore } from './action_conversation_store'

const context: ActionContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' }

function conversation(path: string): AgentConversation {
    return {
        actionId: 'implement',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        entries: [],
        hasExplicitTitle: true,
        id: path,
        path,
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Implementation',
    }
}

describe('ActionConversationStore', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('loads configured unseen conversation during initial history load', async () => {
        const unseenConversation = conversation('conversation-newest.json')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([unseenConversation])
        const loadConversation = vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(unseenConversation)
        const store = new ActionConversationStore('implement', context)
        store.configureInitialSelection(unseenConversation.path)

        await store.load()

        expect(loadConversation).toHaveBeenCalledWith(unseenConversation.path)
        expect(store.getSnapshot().selectedConversation).toBe(unseenConversation)
    })

    it('keeps unseen conversation unselected and reports its load failure', async () => {
        const unseenConversation = conversation('conversation-newest.json')
        const loadError = new Error('conversation unavailable')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([unseenConversation])
        vi.spyOn(dataService, 'loadAgentConversation').mockRejectedValue(loadError)
        const reportError = vi.spyOn(dialogService, 'error')
        const store = new ActionConversationStore('implement', context)
        store.configureInitialSelection(unseenConversation.path)

        await store.load()

        expect(store.getSnapshot().selectedConversation).toBeNull()
        expect(reportError).toHaveBeenCalledWith(loadError, { fallbackMessage: 'Could not load agent conversation' })
    })

    it('keeps empty state without unseen results and after explicit reset', async () => {
        const historicalConversation = conversation('conversation-old.json')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([historicalConversation])
        const loadConversation = vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(historicalConversation)
        const store = new ActionConversationStore('implement', context)
        store.configureInitialSelection(null)

        await store.load()
        expect(store.getSnapshot().selectedConversation).toBeNull()

        await store.select(historicalConversation.path)
        await store.select('')

        expect(loadConversation).toHaveBeenCalledOnce()
        expect(store.getSnapshot().selectedConversation).toBeNull()
    })
})
