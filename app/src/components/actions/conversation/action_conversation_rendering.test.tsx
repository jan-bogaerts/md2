import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationEntry } from '../../../data/data_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionConversationTranscript as ActionConversationChat } from './action_conversation_transcript'

const renderProbes = vi.hoisted(() => ({ event: vi.fn(), markdown: vi.fn() }))

// `ActionConversationChat` observes its viewport, and jsdom ships no ResizeObserver.
function InertResizeObserver() {
    return { disconnect: vi.fn(), observe: vi.fn(), unobserve: vi.fn() }
}

vi.stubGlobal('ResizeObserver', InertResizeObserver)

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
                <ActionConversationChat conversation={{ ...firstConversation, change: { kind: 'replace' } }} status="running" />
            </AppThemeProvider>,
        )
        renderProbes.markdown.mockClear()
        renderProbes.event.mockClear()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...firstConversation,
                        change: { entryIndex: 2, kind: 'entry' },
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
                <ActionConversationChat conversation={{ ...firstConversation, change: { kind: 'replace' } }} status="running" />
            </AppThemeProvider>,
        )
        renderProbes.markdown.mockClear()
        renderProbes.event.mockClear()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...firstConversation,
                        change: { entryIndex: 3, kind: 'entry' },
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

    it('groups non-consecutive sub-agent entries while keeping root transcript order', () => {
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

        expect(screen.getByRole('button', { name: 'Explore entries' })).toHaveTextContent('Explore (2)')
        expect(screen.getByText('parent output')).toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(1)
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

    it('collapses Codex child-thread entries under the collaboration call with a running count', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 2, status: 'inProgress', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        const childToolCall = {
            content: '', id: 'event-2', kind: 'event' as const, label: 'search', parentItemId: 'wait-1',
            providerItemId: 'child-tool', status: 'completed', timestamp: 'now', type: 'mcpToolCall',
        }
        const childMessage = {
            content: 'found it', id: 'event-3', kind: 'event' as const, label: 'wait', parentItemId: 'wait-1',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([collaborationCall, childToolCall, childMessage])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        const toggle = screen.getByRole('button', { name: 'Collaboration: wait entries' })

        expect(screen.getByRole('group', { name: 'Sub agent Collaboration: wait' })).toBeInTheDocument()
        expect(toggle).toHaveTextContent('Collaboration: wait (2) — 2 running')
        expect(screen.getAllByText('Tool event')).toHaveLength(1)

        fireEvent.click(toggle)

        expect(screen.getAllByText('Tool event')).toHaveLength(3)
    })

    it('keeps interleaved root entries outside the Codex child-thread group', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 1, status: 'inProgress', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        const rootMessage = {
            agent: 'codex', content: 'Root update', id: 'message-1', kind: 'message' as const,
            role: 'assistant' as const, timestamp: 'now',
        }
        const childMessage = {
            content: 'Child update', id: 'event-2', kind: 'event' as const, label: 'wait', parentItemId: 'wait-1',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([collaborationCall, rootMessage, childMessage])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(screen.getByText('Root update')).toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(1)

        fireEvent.click(screen.getByRole('button', { name: 'Collaboration: wait entries' }))

        expect(screen.getAllByText('Tool event')).toHaveLength(2)
    })

    it('shows a running Codex child-thread group before the child emits visible output', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 2, status: 'inProgress', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([collaborationCall])} status="running" />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Collaboration: wait entries' }))
            .toHaveTextContent('Collaboration: wait (0) — 2 running')
    })

    it('drops the running count once the collaboration call completes', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 0, status: 'completed', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        const childMessage = {
            content: 'found it', id: 'event-2', kind: 'event' as const, label: 'wait', parentItemId: 'wait-1',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([collaborationCall, childMessage])} status="running" />
            </AppThemeProvider>,
        )

        const toggle = screen.getByRole('button', { name: 'Collaboration: wait entries' })

        expect(toggle).toHaveTextContent('Collaboration: wait (1)')
        expect(toggle.textContent).not.toContain('running')
    })

    it('nests a collaboration call made inside a child thread under that child entry', () => {
        const collaborationCall = {
            content: '', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', status: 'inProgress', timestamp: 'now', type: 'collabAgentToolCall',
        }
        const nestedCollaborationCall = {
            content: '', id: 'event-2', kind: 'event' as const, label: 'Collaboration: ask', parentItemId: 'wait-1',
            providerItemId: 'wait-2', status: 'inProgress', timestamp: 'now', type: 'collabAgentToolCall',
        }
        const grandchildMessage = {
            content: 'deep', id: 'event-3', kind: 'event' as const, label: 'ask', parentItemId: 'wait-2',
            providerItemId: 'grandchild-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([collaborationCall, nestedCollaborationCall, grandchildMessage])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Collaboration: wait entries' }))

        expect(screen.getByRole('group', { name: 'Sub agent Collaboration: ask' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Collaboration: ask entries' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders a child-thread entry flat when its collaboration call never arrived', () => {
        const orphan = {
            content: 'found it', id: 'event-1', kind: 'event' as const, label: 'wait', parentItemId: 'wait-missing',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
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
