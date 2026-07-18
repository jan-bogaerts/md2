import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, ProjectCard, WorktreeRecord } from '../../data/data_types'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardWorktreeIndicator } from './card_worktree_indicator'

function conversation(status: AgentConversation['status'], events: AgentConversation['events'] = []): AgentConversation {
    return {
        cardPath: 'design/F-1.md',
        completedAt: status === 'running' ? null : '2026-01-01T00:01:00.000Z',
        events,
        hasExplicitTitle: true,
        id: 'agent-1',
        messages: [],
        path: '.md2-agent-logs/agent-1.json',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status,
        title: 'Agent',
    }
}

function card(worktree: number | null, conversations: AgentConversation[] = []): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: conversations,
        content: '# Card',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: 'F-1', internalId: 'f-1', owner: null,
            policy: {}, status: 'design', title: 'Card', worktree, worktreeError: null,
            worktreeValue: worktree === null ? null : String(worktree),
        },
        headerFields: {},
        isActive: true,
        path: 'design/F-1.md',
    }
}

const validWorktree: WorktreeRecord = { branch: 'feature', error: null, path: 'C:\\feature', valid: true }

function renderIndicator(projectCard: ProjectCard, worktrees: WorktreeRecord[] = [validWorktree]) {
    const onAssign = vi.fn()
    render(
        <AppThemeProvider>
            <CardWorktreeIndicator card={projectCard} onAssign={onAssign} primaryPath="C:\\primary" projectKey="project:main" worktrees={worktrees} />
        </AppThemeProvider>,
    )

    return onAssign
}

describe('CardWorktreeIndicator', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
    })

    it('shows one-based assignment, accessible folder label and assignment menu', () => {
        const onAssign = renderIndicator(card(1))

        fireEvent.click(screen.getByRole('button', { name: /F-1: C:\\feature; agent idle/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))

        expect(onAssign).toHaveBeenCalledWith('design/F-1.md', 1)
    })

    it('shows an out-of-bounds index in an error state', async () => {
        renderIndicator(card(3), [])
        const button = screen.getByRole('button', { name: /F-1: missing folder; agent idle/u })
        fireEvent.mouseOver(button)

        expect(await screen.findByText(/Worktree assignment error: Configured worktree 3 does not exist/u)).toBeInTheDocument()
        expect(button).toHaveStyle({ color: 'rgb(211, 47, 47)' })
    })

    it('explains the unseen agent result indicator in a tooltip', async () => {
        renderIndicator(card(null, [conversation('completed')]), [])
        const button = screen.getByRole('button', { name: /agent unseen result/u })

        fireEvent.mouseOver(button)

        expect(await screen.findByRole('tooltip')).toHaveTextContent('New agent result available')
    })

    it('distinguishes waiting, running, unseen and acknowledged agent states', () => {
        const waiting = conversation('running', [{ content: '', id: 'wait', timestamp: '2026-01-01T00:00:30.000Z', type: 'waiting' }])
        const { rerender } = render(
            <AppThemeProvider>
                <CardWorktreeIndicator card={card(null, [waiting])} onAssign={vi.fn()} primaryPath="project" projectKey="project:main" worktrees={[]} />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: /agent waiting for input/u })).toBeInTheDocument()

        rerender(<AppThemeProvider><CardWorktreeIndicator card={card(null, [conversation('running')])} onAssign={vi.fn()} primaryPath="project" projectKey="project:main" worktrees={[]} /></AppThemeProvider>)
        expect(screen.getByRole('button', { name: /agent running/u })).toBeInTheDocument()

        const completed = conversation('completed')
        rerender(<AppThemeProvider><CardWorktreeIndicator card={card(null, [completed])} onAssign={vi.fn()} primaryPath="project" projectKey="project:main" worktrees={[]} /></AppThemeProvider>)
        expect(screen.getByRole('button', { name: /agent unseen result/u })).toBeInTheDocument()

        agentAcknowledgementService.acknowledge('project:main', 'design/F-1.md', [completed])
        rerender(<AppThemeProvider><CardWorktreeIndicator card={card(null, [completed])} onAssign={vi.fn()} primaryPath="project" projectKey="project:main" worktrees={[]} /></AppThemeProvider>)
        expect(screen.getByRole('button', { name: /agent idle/u })).toBeInTheDocument()
    })
})
