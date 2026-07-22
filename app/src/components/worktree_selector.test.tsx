import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeRecord } from '../data/data_types'
import { worktreeService } from '../services/project/worktree_service'
import { AppThemeProvider } from '../theme/theme_provider'
import { WorktreeSelector } from './worktree_selector'

const worktrees: WorktreeRecord[] = [
    {
        branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
        status: { ahead: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
    },
    {
        branch: null, error: 'Folder missing', parkingBranch: 'md2/parking/missing', path: 'C:\\missing',
        status: { ahead: 0, behind: 0, dirty: false, hasUpstream: false }, valid: false,
    },
]

describe('WorktreeSelector', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('lists Primary and valid linked worktrees while retaining the current invalid assignment', () => {
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 2, worktreeError: null, worktreeValue: '2' }}
                    assignmentTarget={{ kind: 'card', path: 'design/F-1.md' }}
                    primaryPath={'C:\\primary'}
                    worktrees={worktrees}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /C:\\missing: Folder missing/u }))

        expect(screen.getByRole('menuitem', { name: /Primary — C:\\primary/u })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: /1 — C:\\feature/u })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: /^2 — C:\\missing$/u })).not.toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: /2 — C:\\missing: Folder missing/u })).toBeInTheDocument()
    })

    it('cannot open while execution is running', () => {
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: null }}
                    assignmentTarget={{ kind: 'card', path: 'design/F-1.md' }}
                    disabled
                    primaryPath={null}
                    worktrees={worktrees}
                />
            </AppThemeProvider>,
        )

        const button = screen.getByRole('button', { name: 'Primary worktree' })
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('disables a worktree reserved by another active card', () => {
        vi.spyOn(worktreeService, 'isWorktreeAvailableForCard').mockReturnValue(false)
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree')
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: null }}
                    assignmentTarget={{ kind: 'card', path: 'design/F-1.md' }}
                    primaryPath={null}
                    worktrees={worktrees}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        const reservedWorktree = screen.getByRole('menuitem', { name: '1 — C:\\feature' })
        expect(reservedWorktree).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(reservedWorktree)
        expect(setCardWorktree).not.toHaveBeenCalled()
    })

    it('shows lifecycle actions instead of worktree choices for an assigned card', () => {
        const refresh = vi.spyOn(worktreeService, 'refresh').mockResolvedValue(undefined)
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                    worktrees={worktrees}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))

        expect(refresh).not.toHaveBeenCalled()

        expect(screen.getByRole('menuitem', { name: /Primary — C:.*primary/u })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Commit' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'Commit & push' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Pull' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.queryByRole('menuitem', { name: /1 — C:\\feature/u })).not.toBeInTheDocument()
    })

    it('asks how to resolve dirty changes before returning to Primary', async () => {
        const dirtyWorktrees = [{
            ...worktrees[0],
            status: { ahead: 0, behind: 0, dirty: true, hasUpstream: false },
        }]
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                    worktrees={dirtyWorktrees}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))

        expect(await screen.findByRole('dialog', { name: 'Worktree has uncommitted changes' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Drop changes' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Commit & push' })).toBeInTheDocument()
    })

    it('opens the dirty dialog when backend revalidation rejects parking', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        vi.spyOn(worktreeService, 'setCardWorktree').mockRejectedValue(new Error('Linked worktree has uncommitted changes'))
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue([dirtyWorktree])
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                    worktrees={[worktrees[0]]}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))

        expect(await screen.findByRole('dialog', { name: 'Worktree has uncommitted changes' })).toBeInTheDocument()
    })

    it('opens the commit dialog with the default card message', () => {
        const dirtyWorktrees = [{
            ...worktrees[0],
            status: { ahead: 0, behind: 0, dirty: true, hasUpstream: false },
        }]
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                    worktrees={dirtyWorktrees}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Commit' }))
        expect(screen.getByRole('dialog', { name: 'Commit worktree' })).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveValue('F-1: Card')

        fireEvent.click(screen.getByRole('button', { name: 'Commit' }))
        expect(commitCardWorktree).toHaveBeenCalledWith('design/F-1.md', 'F-1: Card', false)
    })
})
