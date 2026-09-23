import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { configService } from '../../services/config/config_service'
import { dataService } from '../../services/data/data_service'
import type { DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { DiagramAgentFab } from './diagram_agent_fab'

function conversation(actionId: string, status: AgentConversation['status'], viewed = true): AgentConversation {
    return {
        actionId,
        cardInternalId: null,
        cardPath: null,
        completedAt: status === 'completed' ? '2026-01-01T00:01:00.000Z' : null,
        entries: [],
        hasExplicitTitle: true,
        id: `${actionId}-${status}`,
        path: `design/activity/project.json#conversation=${actionId}-${status}`,
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status,
        title: actionId,
        viewed,
    }
}

describe('DiagramAgentFab', () => {
    let actionRunListener: ((event: ActionRunEvent) => void) | null = null
    let projectConversations: AgentConversation[] = []
    const service = {
        closePopup: vi.fn(),
        openRootPopup: vi.fn(),
    } as unknown as DiagramViewService

    beforeEach(() => {
        configService.init()
        actionRunListener = null
        projectConversations = []
        window.md2Actions = {
            onActionRun: vi.fn((listener: (event: ActionRunEvent) => void) => {
                actionRunListener = listener

                return vi.fn()
            }),
            updateActionConversationViewed: vi.fn(async (_reference: string, viewed: boolean) => ({ viewed })),
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService.agents, 'getProjectAgentConversationsSnapshot')
            .mockImplementation(() => projectConversations)
    })

    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        agentAcknowledgementService.reset()
        delete window.md2Actions
        configService.clear()
        vi.restoreAllMocks()
    })

    it('shows exact root-context live states with shared priority', () => {
        render(<DiagramAgentFab rootActionIds={['overview']} service={service} />, { wrapper: AppThemeProvider })
        if (!actionRunListener) throw new Error('Missing action run listener')
        const emit = actionRunListener as (event: ActionRunEvent) => void
        const rootEvent = {
            actionId: 'overview',
            context: { kind: 'diagram' as const, type: 'root' },
            phase: 'main' as const,
            rootActionId: 'overview',
            type: 'run' as const,
        }

        expect(screen.getByRole('button', { name: 'Diagram action' })).toBeInTheDocument()
        act(() => emit({ ...rootEvent, runId: 'queued-root', status: 'queued' }))
        expect(screen.getByRole('button', { name: 'Diagram action — Action is queued' })).toBeInTheDocument()
        act(() => emit({ ...rootEvent, runId: 'running-root', status: 'running' }))
        expect(screen.getByRole('button', { name: 'Diagram action — Action is running' })).toBeInTheDocument()
        act(() => emit({ ...rootEvent, runId: 'waiting-root', status: 'waitingForInput' }))
        expect(screen.getByRole('button', { name: 'Diagram action — Agent is waiting for input' })).toBeInTheDocument()
    })

    it('ignores project, child diagram, and unconfigured root action runs', () => {
        render(<DiagramAgentFab rootActionIds={['overview']} service={service} />, { wrapper: AppThemeProvider })
        if (!actionRunListener) throw new Error('Missing action run listener')
        const emit = actionRunListener as (event: ActionRunEvent) => void
        const baseEvent = {
            actionId: 'other',
            phase: 'main' as const,
            rootActionId: 'other',
            status: 'waitingForInput' as const,
            type: 'run' as const,
        }

        act(() => emit({ ...baseEvent, context: { kind: 'project' }, runId: 'project-run' }))
        act(() => emit({
            ...baseEvent,
            context: { diagramId: 'diagram-1', diagramItemId: 'item-1', kind: 'diagram', parentNode: 'Item', type: 'child' },
            runId: 'child-run',
        }))
        act(() => emit({ ...baseEvent, context: { kind: 'diagram', type: 'root' }, runId: 'other-root-run' }))

        expect(screen.getByRole('button', { name: 'Diagram action' })).toBeInTheDocument()
    })

    it('filters persisted project-origin conversations to root action IDs', () => {
        projectConversations = [
            conversation('project-action', 'waitingForInput'),
            conversation('detail', 'running'),
            conversation('overview', 'completed', false),
        ]
        render(<DiagramAgentFab rootActionIds={['overview']} service={service} />, { wrapper: AppThemeProvider })

        expect(screen.getByRole('button', { name: 'Diagram action — New agent result available' })).toBeInTheDocument()
        projectConversations = [conversation('overview', 'running'), conversation('overview', 'completed', false)]
        act(() => agentAcknowledgementService.announceConversationsChanged(null, []))
        expect(screen.getByRole('button', { name: 'Diagram action — Action is running' })).toBeInTheDocument()
        projectConversations = [conversation('overview', 'waitingForInput'), conversation('overview', 'running')]
        act(() => agentAcknowledgementService.announceConversationsChanged(null, []))
        expect(screen.getByRole('button', { name: 'Diagram action — Agent is waiting for input' })).toBeInTheDocument()
    })

    it('clears unseen state only when diagram popup reports displayed conversation visible', async () => {
        const unseenConversation = conversation('overview', 'completed', false)
        projectConversations = [unseenConversation]
        render(<DiagramAgentFab rootActionIds={['overview']} service={service} />, { wrapper: AppThemeProvider })

        expect(screen.getByRole('button', { name: 'Diagram action — New agent result available' })).toBeInTheDocument()
        agentAcknowledgementService.setConversationVisible(
            'diagram-popup', null, 'overview', unseenConversation, false,
        )
        expect(window.md2Actions?.updateActionConversationViewed).not.toHaveBeenCalled()

        agentAcknowledgementService.setConversationVisible(
            'diagram-popup', null, 'overview', unseenConversation, true,
        )

        await waitFor(() => expect(window.md2Actions?.updateActionConversationViewed)
            .toHaveBeenCalledWith(unseenConversation.path, true))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Diagram action' })).toBeInTheDocument())
    })
})
