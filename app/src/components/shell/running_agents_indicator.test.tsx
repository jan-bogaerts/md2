import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentConversation, AgentRunEvent } from '../../data/data_types'
import { agentConversationService } from '../../services/agents/agent_conversation_service'
import { RunningAgentsIndicator } from './running_agents_indicator'

const conversation = (runId: string): AgentConversation => ({
    cardPath: null,
    completedAt: null,
    entries: [{ content: '', id: runId, kind: 'message', role: 'user', timestamp: '2026-01-01T00:00:00.000Z' }],
    hasExplicitTitle: true,
    id: runId,
    path: runId,
    providerSessions: [],
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'running',
    title: 'Run',
    viewed: true,
})

const startedEvent = (runId: string): AgentRunEvent => ({
    conversation: conversation(runId),
    runId,
    type: 'started',
})

const closedEvent = (runId: string): AgentRunEvent => ({
    conversation: { ...conversation(runId), completedAt: '2026-01-01T00:01:00.000Z', status: 'completed' },
    runId,
    type: 'closed',
})

describe('RunningAgentsIndicator', () => {
    afterEach(() => {
        cleanup()
        agentConversationService.observeRunEvent(closedEvent('a'), '')
        agentConversationService.observeRunEvent(closedEvent('b'), '')
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

    it('opens shared details in a mobile dialog', () => {
        render(<RunningAgentsIndicator mobile />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 0' }))

        expect(screen.getByRole('dialog', { name: 'Running agents' })).toBeInTheDocument()
    })
})
