import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationEntry } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionConversationChat } from './action_conversation_chat'

const renderProbes = vi.hoisted(() => ({ event: vi.fn(), markdown: vi.fn() }))

vi.mock('react-markdown', () => ({
    default: ({ children }: { children: ReactNode }) => {
        renderProbes.markdown(children)

        return <div>{children}</div>
    },
}))

vi.mock('./agent_tool_event', () => ({
    AgentToolEvent: () => {
        renderProbes.event()

        return <div>Tool event</div>
    },
}))

function conversation(entries: AgentConversationEntry[]): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-138.md',
        completedAt: null,
        entries,
        hasExplicitTitle: false,
        id: 'conversation-1',
        path: 'conversation.json',
        providerSessions: [],
        startedAt: '2026-08-04T10:00:00.000Z',
        status: 'running',
        title: 'Review',
    }
}

describe('ActionConversationChat rendering', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('rerenders only changed entries while assistant output streams', () => {
        const historicalMessage = {content: 'Historical', id: 'message-1', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const toolEvent = {
            content: '', id: 'event-1', kind: 'event' as const, providerItemId: 'tool-1', status: 'completed',
            timestamp: 'now', type: 'tool',
        }
        const streamingMessage = {content: 'Live', id: 'message-2', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const firstConversation = conversation([historicalMessage, toolEvent, streamingMessage])
        const { rerender } = render(
            <AppThemeProvider>
                <ActionConversationChat conversation={firstConversation} status="running" />
            </AppThemeProvider>,
        )
        renderProbes.markdown.mockClear()
        renderProbes.event.mockClear()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...firstConversation,
                        entries: [historicalMessage, toolEvent, { ...streamingMessage, content: 'Live update' }],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(renderProbes.markdown).toHaveBeenCalledOnce()
        expect(renderProbes.markdown).toHaveBeenCalledWith('Live update')
        expect(renderProbes.event).not.toHaveBeenCalled()
    })
})
