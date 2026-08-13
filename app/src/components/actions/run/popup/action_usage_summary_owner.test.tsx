import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import type { AgentConversation } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import type { ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import { ActionUsageScopeStore } from './action_usage_scope_store'
import { ActionUsageSummaryOwner } from './action_usage_summary_owner'

const action = { id: 'implement', type: 'agent' } as ActionDefinition
const context = { cardInternalId: 'card-1', file: 'design/F-114.md', kind: 'card' as const }

function conversation(id: string, insertions: number, deletions: number): AgentConversation {
    return {
        actionId: action.id,
        cardInternalId: context.cardInternalId,
        cardPath: context.file,
        completedAt: null,
        entries: [{
            content: 'update: design/F-114.md', deletions, id: `${id}-event`, insertions, kind: 'event',
            providerItemId: `${id}-file`, status: 'completed', timestamp: 'now', type: 'fileChange',
        }],
        hasExplicitTitle: true,
        id,
        path: `design/activity/card.json#conversation=${id}`,
        providerSessions: [],
        startedAt: 'now',
        status: 'running',
        title: id,
        viewed: true,
    }
}

function createConversationStore(selectedConversation: AgentConversation | null) {
    const events = new EventTarget()
    let snapshot = {
        conversations: selectedConversation ? [selectedConversation] : [],
        loading: false,
        selectedConversation,
    }
    const store = {
        conversationOptions: (liveConversation: AgentConversation | null) => {
            const byId = new Map(snapshot.conversations.map((item) => [item.id, item]))
            if (snapshot.selectedConversation) byId.set(snapshot.selectedConversation.id, snapshot.selectedConversation)
            if (liveConversation) byId.set(liveConversation.id, liveConversation)

            return [...byId.values()]
        },
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
            events.addEventListener('changed', listener)

            return () => events.removeEventListener('changed', listener)
        },
    } as unknown as ActionConversationStore
    const selectConversation = (nextConversation: AgentConversation | null) => {
        snapshot = {
            conversations: nextConversation ? [...snapshot.conversations, nextConversation] : snapshot.conversations,
            loading: false,
            selectedConversation: nextConversation,
        }
        events.dispatchEvent(new Event('changed'))
    }

    return { selectConversation, store }
}

function createHistoryStore() {
    const historySnapshot = { entries: [], error: null }

    return {
        getSnapshot: () => historySnapshot,
        load: vi.fn(async () => undefined),
        subscribe: () => () => undefined,
    } as unknown as ActionHistoryStore
}

function renderOwner(
    conversationStore: ActionConversationStore,
    scopeStore: ActionUsageScopeStore,
    historyStore = createHistoryStore(),
) {
    return render(
        <AppThemeProvider>
            <ActionUsageSummaryOwner
                action={action}
                context={context}
                conversationStore={conversationStore}
                historyStore={historyStore}
                scopeStore={scopeStore}
            />
        </AppThemeProvider>,
    )
}

describe('ActionUsageSummaryOwner', () => {
    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        setActionBridgeOverride(null)
    })

    it('updates conversation values after selection changes without changing active scope', () => {
        const firstConversation = conversation('first', 2, 1)
        const secondConversation = conversation('second', 5, 4)
        const { selectConversation, store } = createConversationStore(firstConversation)
        const scopeStore = new ActionUsageScopeStore()
        renderOwner(store, scopeStore)
        fireEvent.click(screen.getByRole('button', { name: 'Changes, Action/card scope' }))

        expect(screen.getByRole('button', { name: 'Changes, Conversation scope' })).toHaveTextContent('changes: +2 / -1')

        act(() => selectConversation(secondConversation))

        expect(scopeStore.getSnapshot()).toBe('conversation')
        expect(screen.getByRole('button', { name: 'Changes, Conversation scope' })).toHaveTextContent('changes: +5 / -4')
    })

    it('includes live updates in action/card totals once and uses live conversation when selected', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        setActionBridgeOverride({
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        const selectedConversation = conversation('selected', 2, 1)
        const { store } = createConversationStore(selectedConversation)
        const scopeStore = new ActionUsageScopeStore()
        renderOwner(store, scopeStore)
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void
        const run = {
            actionId: action.id, context, phase: 'main' as const, rootActionId: action.id,
            runId: 'run-1', status: 'running' as const,
        }

        act(() => {
            emit({ ...run, type: 'run' })
            emit({
                ...run,
                type: 'update',
                update: { conversation: conversation('live', 7, 4), kind: 'agentStarted' },
            })
        })

        expect(screen.getByRole('button', { name: 'Changes, Action/card scope' })).toHaveTextContent('changes: +9 / -5')

        fireEvent.click(screen.getByRole('button', { name: 'Changes, Action/card scope' }))
        expect(screen.getByRole('button', { name: 'Changes, Conversation scope' })).toHaveTextContent('changes: +7 / -4')
    })

    it('replaces live token snapshots in both scopes while keeping other conversation totals', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        setActionBridgeOverride({
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        const selectedConversation = conversation('selected', 0, 0)
        selectedConversation.usage = { cachedInputTokens: 0, inputTokens: 20, outputTokens: 0, reasoningTokens: 0, totalTokens: 20 }
        const liveConversation = conversation('live', 0, 0)
        const { store } = createConversationStore(selectedConversation)
        const scopeStore = new ActionUsageScopeStore()
        renderOwner(store, scopeStore)
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void
        const run = {
            actionId: action.id, context, phase: 'main' as const, rootActionId: action.id,
            runId: 'run-1', status: 'running' as const,
        }

        act(() => {
            emit({ ...run, type: 'run' })
            emit({ ...run, type: 'update', update: { conversation: liveConversation, kind: 'agentStarted' } })
            emit({
                ...run,
                type: 'update',
                update: {
                    kind: 'agentUsage',
                    usage: { cachedInputTokens: 0, inputTokens: 15, outputTokens: 0, reasoningTokens: 0, totalTokens: 15 },
                },
            })
        })

        expect(screen.getByRole('button', { name: 'Tokens, Action/card scope' })).toHaveTextContent('tokens: 35')

        act(() => emit({
            ...run,
            type: 'update',
            update: {
                kind: 'agentUsage',
                usage: { cachedInputTokens: 0, inputTokens: 17, outputTokens: 0, reasoningTokens: 0, totalTokens: 17 },
            },
        }))

        expect(screen.getByRole('button', { name: 'Tokens, Action/card scope' })).toHaveTextContent('tokens: 37')
        fireEvent.click(screen.getByRole('button', { name: 'Tokens, Action/card scope' }))
        expect(screen.getByRole('button', { name: 'Tokens, Conversation scope' })).toHaveTextContent('tokens: 17')
    })

    it('forces action/card scope when no conversation is displayed', () => {
        const { store } = createConversationStore(null)
        const scopeStore = new ActionUsageScopeStore()
        scopeStore.toggle(true)

        renderOwner(store, scopeStore)

        expect(scopeStore.getSnapshot()).toBe('actionCard')
        expect(screen.getByRole('button', { name: 'Tokens, Action/card scope' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Tokens, Action/card scope' }))
        expect(scopeStore.getSnapshot()).toBe('actionCard')
    })
})
