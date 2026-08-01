import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentRunEvent } from '../../data/data_types'
import { agentConversationService } from '../../services/agents/agent_conversation_service'
import { RunningAgentsIndicator } from './running_agents_indicator'

const startedEvent = (runId: string): AgentRunEvent => ({
    conversationId: runId,
    entries: [{ content: '', id: runId, kind: 'message', role: 'user', timestamp: '2026-01-01T00:00:00.000Z' }],
    reference: runId,
    runId,
    startedAt: '2026-01-01T00:00:00.000Z',
    title: 'Run',
    type: 'started',
})

describe('RunningAgentsIndicator', () => {
    afterEach(() => {
        cleanup()
        agentConversationService.observeRunEvent({ reference: 'a', runId: 'a', status: 'completed', type: 'closed' }, '')
        agentConversationService.observeRunEvent({ reference: 'b', runId: 'b', status: 'completed', type: 'closed' }, '')
    })

    it('reports the running-agent count', () => {
        agentConversationService.observeRunEvent(startedEvent('a'), 'Build')
        agentConversationService.observeRunEvent(startedEvent('b'), 'Lint')
        render(<RunningAgentsIndicator />)

        expect(screen.getByRole('button', { name: 'Running agents: 2' })).toBeInTheDocument()
    })

    it('lists the running agents in a popover', () => {
        agentConversationService.observeRunEvent(startedEvent('a'), 'Build docs')
        render(<RunningAgentsIndicator />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 1' }))

        expect(screen.getByText('Build docs')).toBeInTheDocument()
    })

    it('shows an empty message when no agents run', () => {
        render(<RunningAgentsIndicator />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 0' }))

        expect(screen.getByText('No agents running')).toBeInTheDocument()
    })

    it('updates when direct running agents change', () => {
        render(<RunningAgentsIndicator />)

        act(() => agentConversationService.observeRunEvent(startedEvent('a'), 'Build'))

        expect(screen.getByRole('button', { name: 'Running agents: 1' })).toBeInTheDocument()
    })
})
