import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { agentConversationService } from '../../services/agents/agent_conversation_service'
import { RunningAgentsIndicator } from './running_agents_indicator'

describe('RunningAgentsIndicator', () => {
    afterEach(() => {
        cleanup()
        agentConversationService.observeRunEvent({ runId: 'a', type: 'closed' }, '')
        agentConversationService.observeRunEvent({ runId: 'b', type: 'closed' }, '')
    })

    it('reports the running-agent count', () => {
        agentConversationService.observeRunEvent({ runId: 'a', type: 'started' }, 'Build')
        agentConversationService.observeRunEvent({ runId: 'b', type: 'started' }, 'Lint')
        render(<RunningAgentsIndicator />)

        expect(screen.getByRole('button', { name: 'Running agents: 2' })).toBeInTheDocument()
    })

    it('lists the running agents in a popover', () => {
        agentConversationService.observeRunEvent({ runId: 'a', type: 'started' }, 'Build docs')
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

        act(() => agentConversationService.observeRunEvent({ runId: 'a', type: 'started' }, 'Build'))

        expect(screen.getByRole('button', { name: 'Running agents: 1' })).toBeInTheDocument()
    })
})
