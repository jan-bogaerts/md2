import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../data/action_context'
import type { ActionRunEvent } from '../../../data/action_run_types'
import type { AgentConversation } from '../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../data/electron_action_bridge'
import { actionPromptDraftService } from '../../../services/actions/action_prompt_draft_service'
import { actionRunRegistry } from '../../../services/actions/action_run_registry'
import { dataService } from '../../../services/data/data_service'
import { dialogService } from '../../../services/dialog_service'
import { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import {
    ActionConversationStore,
    isBrowsingHistoricalConversation,
    resolveDisplayedConversation,
} from './action_conversation_store'

const context: ActionContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' }
const mergeConflictContext: ActionContext = { conflictSessionId: 'session-1', kind: 'merge-conflict' }
const diagramContext: ActionContext = { diagramId: 'diagram-1', kind: 'diagram', type: 'root' }

function projectConversation(path: string): AgentConversation {
    return { ...conversation(path), actionId: 'resolve-conflict', cardInternalId: null, cardPath: null }
}

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
        viewed: true,
    }
}

function createConversationStore(actionId = 'implement', storeContext: ActionContext = context) {
    const runId = actionRunRegistry.getActionRunStore(actionId, storeContext)?.getSnapshot().runId ?? null
    const bindingStore = new ActionRunBindingStore(runId)

    return { bindingStore, store: new ActionConversationStore(actionId, storeContext, bindingStore) }
}

describe('ActionConversationStore', () => {
    afterEach(() => {
        actionRunRegistry.stop()
        actionPromptDraftService.clearAll()
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('resolves explicit history while retaining matching live snapshots', () => {
        const liveConversation = conversation('conversation-live.json')
        const persistedLiveConversation = { ...liveConversation, path: 'moved-conversation-live.json', title: 'Persisted live' }
        const historicalConversation = conversation('conversation-history.json')

        expect(resolveDisplayedConversation(liveConversation, null)).toBe(liveConversation)
        expect(resolveDisplayedConversation(liveConversation, persistedLiveConversation)).toBe(liveConversation)
        expect(resolveDisplayedConversation(liveConversation, historicalConversation)).toBe(historicalConversation)
        expect(isBrowsingHistoricalConversation(liveConversation, historicalConversation, true)).toBe(true)
        expect(isBrowsingHistoricalConversation(liveConversation, persistedLiveConversation, true)).toBe(false)
        expect(isBrowsingHistoricalConversation(null, historicalConversation, true)).toBe(true)
        expect(isBrowsingHistoricalConversation(liveConversation, historicalConversation, false)).toBe(false)
    })

    it.each(['queued', 'running', 'waitingForInput'] as const)(
        'preserves active prompt draft when selecting and clearing history during %s run',
        async (status) => {
            let listener: ((event: ActionRunEvent) => void) | null = null
            setActionBridgeOverride({
                onActionRun: vi.fn((nextListener) => {
                    listener = nextListener

                    return vi.fn()
                }),
            } as unknown as ElectronActionBridge)
            actionRunRegistry.start()
            if (!listener) throw new Error('Missing action run listener')
            const emit = listener as (event: ActionRunEvent) => void
            const eventBase = {
                actionId: 'implement', actionType: 'agent' as const, autoFinish: null, context,
                interactionReady: true, phase: 'main' as const, rootActionId: 'implement', runId: 'run-1', streaming: true,
            }
            emit({ ...eventBase, status: status === 'waitingForInput' ? 'running' : status, type: 'run' })
            if (status === 'waitingForInput') emit({ ...eventBase, status, type: 'agentState' })
            const draft = actionPromptDraftService.getDraft('implement', context, 'run-1', { prepare: false })
            draft.edit('Keep active prompt')
            const historicalConversation = conversation('conversation-history.json')
            vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(historicalConversation)
            const { store } = createConversationStore()

            await store.select(historicalConversation.path)
            draft.edit('Edited while browsing')
            await store.select('')

            expect(draft.getSnapshot()).toBe('Edited while browsing')
        },
    )

    it('loads configured unseen conversation during initial history load', async () => {
        const unseenConversation = conversation('conversation-newest.json')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([unseenConversation])
        const loadConversation = vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(unseenConversation)
        const { store } = createConversationStore()
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
        const { store } = createConversationStore()
        store.configureInitialSelection(unseenConversation.path)

        await store.load()

        expect(store.getSnapshot().selectedConversation).toBeNull()
        expect(reportError).toHaveBeenCalledWith(loadError, { fallbackMessage: 'Could not load agent conversation' })
    })

    it('keeps empty state without unseen results and after explicit reset', async () => {
        const historicalConversation = conversation('conversation-old.json')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([historicalConversation])
        const loadConversation = vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(historicalConversation)
        const { store } = createConversationStore()
        store.configureInitialSelection(null)

        await store.load()
        expect(store.getSnapshot().selectedConversation).toBeNull()

        await store.select(historicalConversation.path)
        await store.select('')

        expect(loadConversation).toHaveBeenCalledOnce()
        expect(store.getSnapshot().selectedConversation).toBeNull()
    })

    it('refreshes selected conversation from persistence after a continued turn', async () => {
        const originalConversation = conversation('conversation.json')
        const continuedConversation = {
            ...originalConversation,
            entries: [{
                content: 'New answer',
                id: 'assistant-2',
                kind: 'message' as const,
                role: 'assistant' as const,
                timestamp: '2026-01-01T00:02:00.000Z',
            }],
        }
        vi.spyOn(dataService, 'listAgentConversations')
            .mockResolvedValueOnce([originalConversation])
            .mockResolvedValueOnce([continuedConversation])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(originalConversation)
        const { store } = createConversationStore()
        store.configureInitialSelection(originalConversation.path)
        await store.load()

        await store.load()

        expect(store.getSnapshot().selectedConversation).toBe(continuedConversation)
    })

    it('keeps user-edited prompt text when a finished run reconciles history', async () => {
        const waitingConversation = { ...conversation('conversation-waiting.json'), status: 'waitingForInput' as const }
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([waitingConversation])
        const draft = actionPromptDraftService.getDraft('implement', context, null, { prepare: false })
        draft.edit('Typed while the agent was finishing')
        const { store } = createConversationStore()

        await store.load()

        expect(store.getSnapshot().selectedConversation).toBe(waitingConversation)
        expect(draft.getSnapshot()).toBe('Typed while the agent was finishing')
    })

    it('drops an untouched prepared default when a finished run reconciles history', async () => {
        const waitingConversation = { ...conversation('conversation-waiting.json'), status: 'waitingForInput' as const }
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([waitingConversation])
        const draft = actionPromptDraftService.getDraft('implement', context, null, { prepare: true })
        await draft.prepare(async () => ({ prompt: 'Prepared default' }))
        const { store } = createConversationStore()

        await store.load()

        expect(draft.getSnapshot()).toBe('')
    })

    it('reconciles a loaded list without publishing a loading state', async () => {
        const listed = conversation('conversation.json')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([listed])
        const { store } = createConversationStore()
        await store.load()
        const loadingStates: boolean[] = []
        store.subscribe(() => loadingStates.push(store.getSnapshot().loading))

        await store.load()

        expect(loadingStates).not.toContain(true)
    })

    it('treats a project-origin conversation as belonging to a diagram context', async () => {
        const projectOrigin = projectConversation('conversation-diagram.json')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([projectOrigin])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(projectOrigin)
        const reportError = vi.spyOn(dialogService, 'error')
        const { store } = createConversationStore('resolve-conflict', diagramContext)

        await store.load()

        expect(store.conversationOptions([])).toEqual([projectOrigin])

        await store.select(projectOrigin.path)

        expect(store.getSnapshot().selectedConversation).toBe(projectOrigin)
        expect(reportError).not.toHaveBeenCalled()
    })

    it('keeps a card context from adopting a conversation of another card', async () => {
        const otherCard = { ...conversation('conversation-other-card.json'), cardInternalId: 'card-2' }
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([otherCard])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(otherCard)
        const reportError = vi.spyOn(dialogService, 'error')
        const { store } = createConversationStore()

        await store.load()

        expect(store.conversationOptions([])).toEqual([])

        await store.select(otherCard.path)

        expect(store.getSnapshot().selectedConversation).toBeNull()
        expect(reportError).toHaveBeenCalled()
    })

    it('treats a project-origin conversation as belonging to a merge-conflict context', async () => {
        const projectOrigin = projectConversation('conversation-conflict.json')
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([projectOrigin])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(projectOrigin)
        const reportError = vi.spyOn(dialogService, 'error')
        const { store } = createConversationStore('resolve-conflict', mergeConflictContext)

        await store.load()

        expect(store.conversationOptions([])).toEqual([projectOrigin])

        await store.select(projectOrigin.path)

        expect(store.getSnapshot().selectedConversation).toBe(projectOrigin)
        expect(reportError).not.toHaveBeenCalled()
    })
})
