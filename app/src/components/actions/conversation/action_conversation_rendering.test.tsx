import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationEntry } from '../../../data/data_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
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
        viewed: true,
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

    it('does not rerender unchanged grouped tool rows while assistant output streams', () => {
        const historicalMessage = {content: 'Historical', id: 'message-1', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const firstTool = {
            content: '', id: 'event-1', kind: 'event' as const, providerItemId: 'tool-1', status: 'completed',
            timestamp: 'now', type: 'webSearch',
        }
        const secondTool = {
            content: '', id: 'event-2', kind: 'event' as const, providerItemId: 'tool-2', status: 'completed',
            timestamp: 'now', type: 'mcpToolCall',
        }
        const streamingMessage = {content: 'Live', id: 'message-2', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const firstConversation = conversation([historicalMessage, firstTool, secondTool, streamingMessage])
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
                        entries: [historicalMessage, firstTool, secondTool, { ...streamingMessage, content: 'Live update' }],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(renderProbes.markdown).toHaveBeenCalledOnce()
        expect(renderProbes.markdown).toHaveBeenCalledWith('Live update')
        expect(renderProbes.event).not.toHaveBeenCalled()
    })

    it('collapses sub-agent entries under the Agent call that spawned them', () => {
        const agentCall = {
            content: JSON.stringify({ subagent_type: 'Explore' }), id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const subAgentText = {
            content: 'sub output', id: 'event-2', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:message-sub:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([agentCall, subAgentText])} status="running" />
            </AppThemeProvider>,
        )

        const group = screen.getByRole('group', { name: 'Sub agent Explore' })
        const toggle = screen.getByRole('button', { expanded: false })

        expect(toggle).toHaveTextContent('Explore (1)')
        expect(screen.getAllByText('Tool event')).toHaveLength(1)

        fireEvent.click(toggle)

        expect(group).toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(2)
    })

    it('keeps non-consecutive sub-agent entries in transcript order', () => {
        const agentCall = {
            content: JSON.stringify({ subagent_type: 'Explore' }), id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const firstSubAgentText = {
            content: 'first output', id: 'event-2', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:message-sub:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        const parentMessage = {content: 'parent output', id: 'message-1', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const laterSubAgentText = {
            content: 'later output', id: 'event-3', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:message-sub:text:1', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([agentCall, firstSubAgentText, parentMessage, laterSubAgentText])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Explore entries' })).toHaveTextContent('Explore (1)')
        expect(screen.getByText('parent output')).toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(2)
    })

    it('uses sub-agent message label when spawning input is incomplete', () => {
        const agentCall = {
            content: '{', id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'inProgress', timestamp: 'now', type: 'tool.Agent',
        }
        const reasoning = {
            content: 'thinking', id: 'event-2', kind: 'event' as const, label: 'Thinking', parentItemId: 'agent-1',
            providerItemId: 'agent-1:thinking', status: 'completed', timestamp: 'now', type: 'reasoning',
        }
        const subAgentText = {
            content: 'output', id: 'event-3', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:text', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([agentCall, reasoning, subAgentText])} status="running" />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('group', { name: 'Sub agent Explore' })).toBeInTheDocument()
    })

    it('nests a second-level sub agent under its own spawning Agent call', () => {
        const agentCall = {
            content: JSON.stringify({ subagent_type: 'Explore' }), id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const nestedAgentCall = {
            content: JSON.stringify({ subagent_type: 'Plan' }), id: 'event-2', kind: 'event' as const,
            parentItemId: 'agent-1', providerItemId: 'agent-2', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const nestedText = {
            content: 'nested output', id: 'event-3', kind: 'event' as const, label: 'Plan', parentItemId: 'agent-2',
            providerItemId: 'agent-2:message-nested:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([agentCall, nestedAgentCall, nestedText])} status="running" />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Explore entries' }))

        expect(screen.getByRole('group', { name: 'Sub agent Plan' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Plan entries' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders a sub-agent entry flat when its spawning Agent call never arrived', () => {
        const orphan = {
            content: 'sub output', id: 'event-1', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-missing',
            providerItemId: 'agent-missing:message-sub:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([orphan])} status="running" />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('group')).not.toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(1)
    })
})
