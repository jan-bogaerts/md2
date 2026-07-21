import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeRecord } from '../data/data_types'
import { AppThemeProvider } from '../theme/theme_provider'
import { WorktreeSelector } from './worktree_selector'

const worktrees: WorktreeRecord[] = [
    { branch: 'feature', error: null, path: 'C:\\feature', valid: true },
    { branch: null, error: 'Folder missing', path: 'C:\\missing', valid: false },
]

describe('WorktreeSelector', () => {
    afterEach(cleanup)

    it('lists Primary and valid linked worktrees while retaining the current invalid assignment', () => {
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 2, worktreeError: null, worktreeValue: '2' }}
                    onAssign={vi.fn()}
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
                <WorktreeSelector assignment={{ worktree: null }} disabled onAssign={vi.fn()} primaryPath={null} worktrees={worktrees} />
            </AppThemeProvider>,
        )

        const button = screen.getByRole('button', { name: 'Primary worktree' })
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
})
