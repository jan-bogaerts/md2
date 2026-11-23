import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../theme/theme_provider'
import { WorktreeIntegrationDialog } from './worktree_integration_dialog'

describe('WorktreeIntegrationDialog', () => {
    afterEach(cleanup)

    it.each([
        ['committing', 'Committing worktree changes', 'Committing worktree changes...', 'Committing...'],
        ['savingProjectChanges', 'Saving pending project edits', 'Saving pending project edits...', 'Integrating...'],
        ['integrating', 'Integrating worktree into project', 'Integrating worktree into project...', 'Integrating...'],
        ['finalizing', 'Finalizing card state', 'Finalizing card state...', 'Finishing...'],
    ] as const)('shows accessible %s feedback and disables every control', (phase, progressLabel, text, actionLabel) => {
        const onClose = vi.fn()
        render(
            <AppThemeProvider>
                <WorktreeIntegrationDialog
                    commitMessage="F-1: Card"
                    deleteBranch={false}
                    onClose={onClose}
                    onCommitMessageChange={vi.fn()}
                    onDeleteBranchChange={vi.fn()}
                    onIntegrate={vi.fn().mockResolvedValue(undefined)}
                    open
                    phase={phase}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText(progressLabel)).toBeInTheDocument()
        expect(screen.getByText(text)).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toBeDisabled()
        expect(screen.getByRole('checkbox', { name: 'Delete branch' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
        expect(screen.getByRole('button', { name: actionLabel })).toBeDisabled()

        const dialog = screen.getByRole('dialog', { name: 'Integrate into project' })
        const backdrop = dialog.closest('.MuiDialog-root')?.querySelector('.MuiBackdrop-root')
        if (!backdrop) throw new Error('Missing integration dialog backdrop')
        fireEvent.keyDown(dialog, { key: 'Escape' })
        fireEvent.mouseDown(backdrop)
        fireEvent.click(backdrop)
        expect(onClose).not.toHaveBeenCalled()
    })

    it('shows idle controls without progress', () => {
        render(
            <AppThemeProvider>
                <WorktreeIntegrationDialog
                    commitMessage={null}
                    deleteBranch={false}
                    onClose={vi.fn()}
                    onCommitMessageChange={vi.fn()}
                    onDeleteBranchChange={vi.fn()}
                    onIntegrate={vi.fn().mockResolvedValue(undefined)}
                    open
                    phase={null}
                />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Integrate' })).toBeEnabled()
    })
})
