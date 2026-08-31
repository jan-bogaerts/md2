import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../data/action_run_types'
import type { AgentConversation } from '../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../services/actions/action_run_registry'
import { cardPopupService } from '../../../services/card_popup_service'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionConversationChat } from './action_conversation_chat'
import type { ActionConversationStore } from './action_conversation_store'
import { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import type { ActionUsageValuesService } from '../run/popup/action_usage_values_service'

const context = { cardInternalId: 'card-1', file: 'design/F-138.md', kind: 'card' as const }
const snapshot = { conversations: [], loading: false, selectedConversation: null }
const store = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
} as unknown as ActionConversationStore
const bindingStore = new ActionRunBindingStore('run-1')
const chatRenderProbe = vi.fn()
const usageValuesSnapshot = {
    actionCard: {
        changes: null,
        lines: { commits: [], deletions: 0, filesChanged: 0, insertions: 0 },
        tokens: { cachedInputTokens: 0, inputTokens: 10, outputTokens: 0, reasoningTokens: 0, totalTokens: 10 },
    },
    activeScope: 'actionCard',
    conversation: null,
    conversationAvailable: false,
} as const
const usageValuesService = {
    getSnapshot: () => usageValuesSnapshot,
    subscribe: () => () => undefined,
    toggleScope: vi.fn(),
} as unknown as ActionUsageValuesService

function ActionConversationChatRenderProbe(props: Parameters<typeof ActionConversationChat>[0]) {
    chatRenderProbe()

    return ActionConversationChat(props)
}

function conversation(
    id: string,
    completedAt: string,
    contextWindowUsage: AgentConversation['contextWindowUsage'],
): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: context.file,
        completedAt,
        contextWindowUsage,
        entries: [],
        hasExplicitTitle: true,
        id,
        path: `design/activity/card.json#conversation=${id}`,
        providerSessions: [],
        startedAt: '2026-08-04T10:00:00.000Z',
        status: 'completed',
        timer: {
            elapsedMs: Date.parse(completedAt) - Date.parse('2026-08-04T10:00:00.000Z'),
            runningStartedAt: null,
        },
        title: id,
        viewed: true,
    }
}

function createConversationStore(initialConversation: AgentConversation) {
    const events = new EventTarget()
    let currentSnapshot = { conversations: [initialConversation], loading: false, selectedConversation: initialConversation }
    const selectableStore = {
        getSnapshot: () => currentSnapshot,
        subscribe: (listener: () => void) => {
            events.addEventListener('changed', listener)

            return () => events.removeEventListener('changed', listener)
        },
    } as unknown as ActionConversationStore
    const selectConversation = (selectedConversation: AgentConversation) => {
        currentSnapshot = { conversations: [initialConversation, selectedConversation], loading: false, selectedConversation }
        events.dispatchEvent(new Event('changed'))
    }

    return { selectConversation, store: selectableStore }
}

describe('ActionConversationChat integration', () => {
    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        cardPopupService.clear()
        agentAcknowledgementService.reset()
        setActionBridgeOverride(null)
        chatRenderProbe.mockClear()
    })

    it('does not re-render for a log-only update', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        setActionBridgeOverride({
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        render(
            <AppThemeProvider>
                <ActionConversationChatRenderProbe actionId="review" bindingStore={bindingStore} context={context} store={store} />
            </AppThemeProvider>,
        )
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void
        const event = { actionId: 'review', context, phase: 'main' as const, rootActionId: 'review', runId: 'run-1', status: 'running' as const }

        act(() => {
            emit({ ...event, type: 'run' })
            emit({
                ...event,
                type: 'update',
                update: {
                    conversation: {
                        actionId: 'review',
                        cardInternalId: null,
                        cardPath: context.file,
                        completedAt: null,
                        entries: [],
                        hasExplicitTitle: false,
                        id: 'conversation-1',
                        path: 'conversation.json',
                        providerSessions: [],
                        startedAt: '2026-08-04T10:00:00.000Z',
                        status: 'running',
                        title: 'Review',
                        viewed: true,
                    },
                    kind: 'agentStarted',
                },
            })
        })
        chatRenderProbe.mockClear()

        act(() => emit({
            ...event,
            type: 'update',
            update: { content: 'diagnostic failure', kind: 'error' },
        }))

        expect(chatRenderProbe).not.toHaveBeenCalled()
    })

    it('renders streamed output and live context usage from its conversation selector', async () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        const bridge = {
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge
        setActionBridgeOverride(bridge)
        actionRunRegistry.start()
        render(
            <AppThemeProvider>
                <ActionConversationChat actionId="review" bindingStore={bindingStore} context={context} store={store} />
            </AppThemeProvider>,
        )
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void
        const event = {actionId: 'review', context, phase: 'main' as const, rootActionId: 'review', runId: 'run-1', status: 'running' as const}

        act(() => {
            emit({ ...event, type: 'run' })
            emit({
                ...event,
                type: 'update',
                update: {
                    conversation: {
                        actionId: 'review',
                        cardInternalId: null,
                        cardPath: context.file,
                        completedAt: null,
                        entries: [],
                        hasExplicitTitle: false,
                        id: 'conversation-1',
                        path: 'conversation.json',
                        providerSessions: [],
                        startedAt: '2026-08-04T10:00:00.000Z',
                        status: 'running',
                        title: 'Review',
                        viewed: true,
                    },
                    kind: 'agentStarted',
                },
            })
        })

        act(() => emit({
            ...event,
            type: 'update',
            update: { content: 'streamed', entryIndex: 0, kind: 'agentOutput', messageId: 'assistant-1', sequence: 1 },
        }))

        expect(screen.getByText('streamed')).toBeInTheDocument()
        expect(screen.queryByRole('progressbar', { name: 'Context usage' })).not.toBeInTheDocument()

        act(() => emit({
            ...event,
            type: 'update',
            update: {
                contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
                kind: 'agentUsage',
                usage: { cachedInputTokens: 0, inputTokens: 41_000, outputTokens: 1_000, reasoningTokens: 0, totalTokens: 42_000 },
            },
        }))

        const progress = screen.getByRole('progressbar', { name: 'Context usage' })
        expect(progress).toHaveAttribute('aria-valuenow', '16')
        fireEvent.mouseOver(progress)
        expect(await screen.findByText('Context usage: 16%', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
    })

    it('updates duration and context usage together when selected conversation changes', async () => {
        const firstConversation = conversation(
            'conversation-1',
            '2026-08-04T10:01:00.000Z',
            { capacityTokens: 258_400, usedTokens: 42_000 },
        )
        const secondConversation = conversation(
            'conversation-2',
            '2026-08-04T10:02:30.000Z',
            { capacityTokens: 200, usedTokens: 100 },
        )
        const { selectConversation, store: selectableStore } = createConversationStore(firstConversation)

        render(
            <AppThemeProvider>
                <ActionConversationChat
                    actionId="review"
                    bindingStore={bindingStore}
                    context={context}
                    store={selectableStore}
                    usageValuesService={usageValuesService}
                />
            </AppThemeProvider>,
        )
        const viewport = screen.getByLabelText('Conversation chat')
        const metadata = screen.getByLabelText('Conversation metadata')
        const timer = screen.getByLabelText('Elapsed time')
        const usage = screen.getByRole('button', { name: 'Tokens, Action/card scope' })
        expect(viewport).not.toContainElement(metadata)
        expect(viewport.parentElement?.lastElementChild).toBe(metadata)
        expect(metadata).toHaveStyle({ containerType: 'inline-size' })
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        expect(timer).toHaveTextContent('1:00')
        const firstProgress = screen.getByRole('progressbar', { name: 'Context usage' })
        expect(timer.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        expect(usage.compareDocumentPosition(firstProgress) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        expect(firstProgress).toHaveAttribute('aria-valuenow', '16')
        fireEvent.mouseOver(firstProgress)
        expect(await screen.findByText('Context usage: 16%', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()

        act(() => selectConversation(secondConversation))

        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('2:30')
        expect(screen.getByRole('progressbar', { name: 'Context usage' })).toHaveAttribute('aria-valuenow', '50')
        expect(await screen.findByText('Context usage: 50%', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
    })

    it('keeps usage summary visible before a conversation exists', () => {
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    actionId="review"
                    bindingStore={bindingStore}
                    context={context}
                    store={store}
                    usageValuesService={usageValuesService}
                />
            </AppThemeProvider>,
        )

        const metadata = screen.getByLabelText('Conversation metadata')
        expect(metadata).toHaveStyle({ containerType: 'inline-size' })
        expect(within(metadata).getByRole('button', { name: 'Tokens, Action/card scope' })).toBeInTheDocument()
        expect(within(metadata).queryByRole('status')).not.toBeInTheDocument()
        expect(within(metadata).queryByLabelText('Elapsed time')).not.toBeInTheDocument()
        expect(within(metadata).queryByRole('progressbar', { name: 'Context usage' })).not.toBeInTheDocument()
    })

    it('shows and acknowledges selected history while hidden live updates accumulate', async () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        const updateActionConversationViewed = vi.fn(async (_reference: string, viewed: boolean) => ({ viewed }))
        setActionBridgeOverride({
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
            updateActionConversationViewed,
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        const historicalConversation = {
            ...conversation('history', '2026-08-04T10:01:00.000Z', { capacityTokens: 100, usedTokens: 25 }),
            entries: [{
                content: 'Historical answer', id: 'history-message', kind: 'message' as const,
                role: 'assistant' as const, timestamp: '2026-08-04T10:01:00.000Z',
            }],
            viewed: false,
        }
        const liveConversation = {
            ...conversation('live', '2026-08-04T10:01:00.000Z', { capacityTokens: 100, usedTokens: 50 }),
            completedAt: null,
            status: 'running' as const,
        }
        const { selectConversation, store: selectableStore } = createConversationStore(historicalConversation)
        cardPopupService.toggleAction(context, document.createElement('button'))
        const popupEntry = cardPopupService.getSnapshot()[0]
        if (!popupEntry || !listener) throw new Error('Missing popup or run listener')
        const eventBase = {
            actionId: 'review', actionType: 'agent' as const, autoFinish: null, context, interactionReady: true,
            phase: 'main' as const, rootActionId: 'review', runId: 'run-1', status: 'running' as const, streaming: true,
        }
        const emit = listener as (event: ActionRunEvent) => void
        act(() => {
            emit({ ...eventBase, type: 'run' })
            emit({ ...eventBase, type: 'update', update: { conversation: liveConversation, kind: 'agentStarted' } })
        })

        render(
            <AppThemeProvider>
                <ActionConversationChat
                    actionId="review"
                    bindingStore={bindingStore}
                    context={context}
                    popupEntryId={popupEntry.id}
                    store={selectableStore}
                />
            </AppThemeProvider>,
        )
        expect(screen.getByText('Historical answer')).toBeInTheDocument()
        await waitFor(() => expect(updateActionConversationViewed).toHaveBeenCalledWith(historicalConversation.path, true))

        act(() => emit({
            ...eventBase,
            type: 'update',
            update: { content: 'Hidden live answer', entryIndex: 0, kind: 'agentOutput', messageId: 'live-message', sequence: 1 },
        }))
        expect(screen.queryByText('Hidden live answer')).not.toBeInTheDocument()

        act(() => selectConversation(liveConversation))

        expect(screen.getByText('Hidden live answer')).toBeInTheDocument()
        expect(updateActionConversationViewed).not.toHaveBeenCalledWith(liveConversation.path, true)
    })

    it.each(['activated', 'newly exposed'])('acknowledges unseen chat when popup becomes topmost: %s', async (scenario) => {
        const unseen = {
            actionId: 'review',
            cardInternalId: 'card-1',
            cardPath: context.file,
            completedAt: '2026-08-04T10:01:00.000Z',
            entries: [],
            hasExplicitTitle: true,
            id: 'conversation-1',
            path: 'design/activity/card__card-1.json#conversation=conversation-1',
            providerSessions: [],
            startedAt: '2026-08-04T10:00:00.000Z',
            status: 'completed' as const,
            title: 'Review',
            viewed: false,
        }
        const selectedSnapshot = { ...snapshot, selectedConversation: unseen }
        const selectedStore = {
            getSnapshot: () => selectedSnapshot,
            subscribe: () => () => undefined,
        } as unknown as ActionConversationStore
        const updateActionConversationViewed = vi.fn(async (_reference: string, viewed: boolean) => ({ ...unseen, viewed }))
        setActionBridgeOverride({
            onActionRun: vi.fn(() => vi.fn()),
            updateActionConversationViewed,
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        const firstAnchor = document.createElement('button')
        const coveringAnchor = document.createElement('button')
        cardPopupService.toggleAction(context, firstAnchor)
        const firstEntry = cardPopupService.getSnapshot()[0]
        const coveringContext = { cardInternalId: 'card-2', file: 'design/F-139.md', kind: 'card' as const }
        cardPopupService.toggleAction(coveringContext, coveringAnchor)
        const coveringEntry = cardPopupService.getSnapshot().at(-1)
        if (!firstEntry || !coveringEntry) throw new Error('Missing popup entries')

        render(
            <AppThemeProvider>
                <ActionConversationChat
                    actionId="review"
                    bindingStore={bindingStore}
                    context={context}
                    popupEntryId={firstEntry.id}
                    store={selectedStore}
                />
            </AppThemeProvider>,
        )
        expect(updateActionConversationViewed).not.toHaveBeenCalled()

        act(() => {
            if (scenario === 'activated') cardPopupService.activate(firstEntry.id)
            else cardPopupService.close(coveringEntry.id)
        })

        await waitFor(() => expect(updateActionConversationViewed).toHaveBeenCalledWith(unseen.path, true))
    })

    it('does not acknowledge topmost popup before conversation load succeeds', () => {
        const updateActionConversationViewed = vi.fn()
        setActionBridgeOverride({
            onActionRun: vi.fn(() => vi.fn()),
            updateActionConversationViewed,
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        cardPopupService.toggleAction(context, document.createElement('button'))
        const entry = cardPopupService.getSnapshot()[0]
        if (!entry) throw new Error('Missing popup entry')

        render(
            <AppThemeProvider>
                <ActionConversationChat
                    actionId="review"
                    bindingStore={bindingStore}
                    context={context}
                    popupEntryId={entry.id}
                    store={store}
                />
            </AppThemeProvider>,
        )

        expect(updateActionConversationViewed).not.toHaveBeenCalled()
    })
})
