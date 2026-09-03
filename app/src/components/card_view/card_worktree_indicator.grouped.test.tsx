import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationEvent, Card, WorktreeRecord } from '../../data/data_types'
import { worktreeService } from '../../services/project/worktree_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardWorktreeIndicator } from './card_worktree_indicator'
import type { DataService } from '../../services/data/data_service'

function conversation(status: AgentConversation['status'], events: AgentConversationEvent[] = []): AgentConversation {
    return {
        cardPath: 'design/F-1.md',
        completedAt: status === 'running' ? null : '2026-01-01T00:01:00.000Z',
        entries: events.map((event) => ({ ...event, kind: 'event' })),
        hasExplicitTitle: true,
        id: 'agent-1',
        path: '.md2-agent-logs/agent-1.json',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status,
        title: 'Agent',
        viewed: true,
    }
}

function card(worktree: number | null, conversations: AgentConversation[] = []): Card {
    return {
        agentConversationErrors: [],
        agentConversations: conversations,
        content: '# Card',
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: 'F-1', internalId: 'f-1', owner: null,
            policy: {}, references: [], status: 'design', title: 'Card', worktree, worktreeError: null,
            worktreeValue: worktree === null ? null : String(worktree),
        },
        hasFrontmatter:true,
        isActive: true,
        path: 'design/F-1.md',
    }
}

const validWorktree: WorktreeRecord = {
    branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

function renderIndicator(Card: Card, worktrees: WorktreeRecord[] = [validWorktree]) {
    vi.spyOn(worktreeService, 'getRecords').mockReturnValue(worktrees)
    const service = Object.assign(new EventTarget(), {getState: () => ({ project: null, runningAgents: [], snapshot: { activeCards: [Card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' } })}) as unknown as DataService
    render(
        <AppThemeProvider>
            <CardWorktreeIndicator cardId={Card.header.id} cardInternalId={Card.header.internalId!} cardPath={Card.path} primaryPath="C:\\primary" service={service} />
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
        expect(button).toHaveAccessibleName(/dirty yes; project changes pending no; ahead of .* 2; behind .* 3/u)
        fireEvent.mouseOver(button)
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'dirty yes; project changes pending no; ahead of the project branch 2; behind the project branch 3',
        )
    })

    it('does not request worktree state while an assigned card agent is running', () => {
        const refresh = vi.spyOn(worktreeService, 'refresh').mockResolvedValue(undefined)
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue([validWorktree])
        const Card = card(1, [conversation('running')])
        const service = Object.assign(new EventTarget(), {getState: () => ({ project: null, runningAgents: [], snapshot: { activeCards: [Card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' } })}) as unknown as DataService
        render(
            <AppThemeProvider>
                <CardWorktreeIndicator
                    cardId={Card.header.id}
                    cardInternalId={Card.header.internalId!}
                    cardPath={Card.path}
                    primaryPath="project"
                    service={service}
                />
            </AppThemeProvider>,
        )

        expect(refresh).not.toHaveBeenCalled()
    })
})
