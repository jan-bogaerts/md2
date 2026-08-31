import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveActionRun } from '../../services/actions/action_run_registry'
import type { AgentConversation, AgentRunEvent } from '../../data/data_types'
import { agentConversationService } from '../../services/agents/agent_conversation_service'
import { cardPopupService } from '../../services/card_popup_service'
import { RunningAgentsIndicator } from './running_agents_indicator'

const actionState = vi.hoisted(() => ({
    actions: [{ id: 'review', label: 'Review action' }],
    activeRuns: [] as ActiveActionRun[],
}))

vi.mock('../hooks/use_action_runs', () => ({useActiveActionRuns: () => actionState.activeRuns}))

vi.mock('../hooks/use_actions', () => ({useActions: () => ({ actions: actionState.actions, error: null })}))

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
    beforeEach(() => {
        actionState.actions = [{ id: 'review', label: 'Review action' }]
        actionState.activeRuns = []
    })

    afterEach(() => {
        cleanup()
        agentConversationService.observeRunEvent(closedEvent('a'), '')
        agentConversationService.observeRunEvent(closedEvent('b'), '')
        vi.restoreAllMocks()
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

    it('shows loaded action label and captured card title on an interactive card row', () => {
        actionState.activeRuns = [{
            context: { cardInternalId: 'card-1', kind: 'card', title: 'Feature one' },
            rootActionId: 'review',
            runId: 'run-1',
            status: 'running',
        }]
        render(<RunningAgentsIndicator />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 1' }))

        expect(screen.getByRole('button', { name: 'Review action Feature one' })).toBeInTheDocument()
    })

    it('uses action ID when a running action definition disappears', () => {
        actionState.actions = []
        actionState.activeRuns = [{
            context: { cardInternalId: 'card-1', kind: 'card', title: 'Feature one' },
            rootActionId: 'missing-action',
            runId: 'run-1',
            status: 'running',
        }]
        render(<RunningAgentsIndicator />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 1' }))

        expect(screen.getByRole('button', { name: 'missing-action Feature one' })).toBeInTheDocument()
    })

    it('keeps direct agents and non-card action runs non-interactive', () => {
        agentConversationService.observeRunEvent(startedEvent('a'), 'Search RegExp')
        actionState.activeRuns = [{
            context: { kind: 'project' },
            rootActionId: 'review',
            runId: 'run-1',
            status: 'running',
        }]
        render(<RunningAgentsIndicator />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 2' }))

        expect(screen.getByText('Search RegExp')).toBeInTheDocument()
        expect(screen.getByText('Action review')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Search RegExp' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Action review' })).not.toBeInTheDocument()
    })

    it('closes desktop details before opening the exact selected run', () => {
        const openActionRun = vi.spyOn(cardPopupService, 'openActionRun').mockImplementation(() => undefined)
        const context = { cardInternalId: 'card-1', kind: 'card' as const, title: 'Feature one' }
        actionState.activeRuns = [
            { context, rootActionId: 'review', runId: 'run-1', status: 'running' },
            { context, rootActionId: 'review', runId: 'run-2', status: 'running' },
        ]
        render(<RunningAgentsIndicator />)
        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 2' }))

        fireEvent.click(screen.getAllByRole('button', { name: 'Review action Feature one' })[0])

        expect(screen.queryByRole('heading', { name: 'Running agents' })).not.toBeInTheDocument()
        expect(openActionRun).toHaveBeenCalledWith(context, 'review', 'run-1', expect.any(HTMLElement))
    })

    it('closes mobile details before opening the selected run', async () => {
        const openActionRun = vi.spyOn(cardPopupService, 'openActionRun').mockImplementation(() => undefined)
        const context = { cardInternalId: 'card-1', kind: 'card' as const, title: 'Feature one' }
        actionState.activeRuns = [{ context, rootActionId: 'review', runId: 'run-1', status: 'running' }]
        render(<RunningAgentsIndicator mobile />)
        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 1' }))

        fireEvent.click(screen.getByRole('button', { name: 'Review action Feature one' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Running agents' })).not.toBeInTheDocument())
        expect(openActionRun).toHaveBeenCalledWith(context, 'review', 'run-1', expect.any(HTMLElement))
    })
})
