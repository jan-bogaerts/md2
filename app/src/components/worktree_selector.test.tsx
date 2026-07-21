import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeRecord } from '../data/data_types'
import { worktreeService } from '../services/project/worktree_service'
import { AppThemeProvider } from '../theme/theme_provider'
import { WorktreeSelector } from './worktree_selector'

const worktrees: WorktreeRecord[] = [
    { branch: 'feature', error: null, path: 'C:\\feature', valid: true },
    { branch: null, error: 'Folder missing', path: 'C:\\missing', valid: false },
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
})
