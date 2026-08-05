import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../services/actions/action_run_registry'
import { cardActionPopupService } from '../../../services/actions/card_action_popup_service'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionConversationChatOwner } from './action_conversation_chat_owner'
import type { ActionConversationStore } from './action_conversation_store'

const context = { cardInternalId: 'card-1', file: 'design/F-138.md', kind: 'card' as const }
const snapshot = { conversations: [], loading: false, selectedConversation: null }
const store = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
} as unknown as ActionConversationStore

describe('ActionConversationChatOwner', () => {
    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        cardActionPopupService.clear()
        agentAcknowledgementService.reset()
        setActionBridgeOverride(null)
    })

    it('renders streamed output from its conversation selector', () => {
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
                <ActionConversationChatOwner actionId="review" context={context} store={store} />
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
            update: { content: 'streamed', kind: 'output', messageId: 'assistant-1', sequence: 1 },
        }))

        expect(screen.getByText('streamed')).toBeInTheDocument()
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
        cardActionPopupService.toggle(context, firstAnchor)
        const firstEntry = cardActionPopupService.getSnapshot()[0]
        const coveringContext = { cardInternalId: 'card-2', file: 'design/F-139.md', kind: 'card' as const }
        cardActionPopupService.toggle(coveringContext, coveringAnchor)
        const coveringEntry = cardActionPopupService.getSnapshot().at(-1)
        if (!firstEntry || !coveringEntry) throw new Error('Missing popup entries')

        render(
            <AppThemeProvider>
                <ActionConversationChatOwner
                    actionId="review"
                    context={context}
                    popupEntryId={firstEntry.id}
                    store={selectedStore}
                />
            </AppThemeProvider>,
        )
        expect(updateActionConversationViewed).not.toHaveBeenCalled()

        act(() => {
            if (scenario === 'activated') cardActionPopupService.activate(firstEntry.id)
            else cardActionPopupService.close(coveringEntry.id)
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
        cardActionPopupService.toggle(context, document.createElement('button'))
        const entry = cardActionPopupService.getSnapshot()[0]
        if (!entry) throw new Error('Missing popup entry')

        render(
            <AppThemeProvider>
                <ActionConversationChatOwner actionId="review" context={context} popupEntryId={entry.id} store={store} />
            </AppThemeProvider>,
        )

        expect(updateActionConversationViewed).not.toHaveBeenCalled()
    })
})
