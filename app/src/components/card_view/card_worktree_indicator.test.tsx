import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, ProjectCard, WorktreeRecord } from '../../data/data_types'
import { worktreeService } from '../../services/project/worktree_service'
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

const validWorktree: WorktreeRecord = {
    branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

function renderIndicator(projectCard: ProjectCard, worktrees: WorktreeRecord[] = [validWorktree]) {
    render(
        <AppThemeProvider>
            <CardWorktreeIndicator card={projectCard} primaryPath="C:\\primary" worktrees={worktrees} />
        </AppThemeProvider>,
    )
}

describe('CardWorktreeIndicator', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('shows an accessible folder label and delegates worktree assignment', () => {
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        renderIndicator(card(null))

        fireEvent.click(screen.getByRole('button', { name: 'F-1: C:\\\\primary' }))
        fireEvent.click(screen.getByRole('menuitem', { name: '1 — C:\\feature' }))

        expect(setCardWorktree).toHaveBeenCalledWith('design/F-1.md', 1)
    })

    it('shows an out-of-bounds index in an error state', async () => {
        renderIndicator(card(3), [])
        const button = screen.getByRole('button', { name: /F-1: missing folder/u })
        fireEvent.mouseOver(button)

        expect(await screen.findByText(/Worktree assignment error: Configured worktree 3 does not exist/u)).toBeInTheDocument()
        expect(button).toHaveStyle({ color: 'rgb(211, 47, 47)' })
    })

    it('shows dirty, ahead and behind worktree state in orange', async () => {
        const changedWorktree = {
            ...validWorktree,
            status: { ahead: 2, baseAhead: 2, baseBehind: 3, behind: 3, dirty: true, hasUpstream: true },
        }
        renderIndicator(card(1), [changedWorktree])
        const button = screen.getByRole('button', { name: /F-1: C:\\feature/u })

        expect(button).toHaveStyle({ color: 'rgb(249, 168, 37)' })
        expect(button).toHaveAccessibleName(/dirty yes; ahead of .* 2; behind .* 3; ahead of upstream 2; behind upstream 3/u)
        fireEvent.mouseOver(button)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('dirty yes; ahead of the project branch 2; behind the project branch 3')
    })

    it('does not request worktree state while an assigned card agent is running', () => {
        const refresh = vi.spyOn(worktreeService, 'refresh').mockResolvedValue(undefined)
        render(
            <AppThemeProvider>
                <CardWorktreeIndicator
                    card={card(1, [conversation('running')])}
                    primaryPath="project"
                    worktrees={[validWorktree]}
                />
            </AppThemeProvider>,
        )

        expect(refresh).not.toHaveBeenCalled()
    })
})
