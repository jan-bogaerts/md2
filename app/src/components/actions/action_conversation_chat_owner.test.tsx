import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionConversationChatOwner } from './action_conversation_chat_owner'
import type { ActionConversationStore } from './action_conversation_store'

const context = { file: 'design/F-138.md', kind: 'card' as const }
const snapshot = { conversations: [], loading: false, selectedConversation: null }
const store = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
} as unknown as ActionConversationStore

describe('ActionConversationChatOwner', () => {
    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
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
})
