import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../theme/theme_provider'
import { WorktreeIntegrationDialog } from './worktree_integration_dialog'

describe('WorktreeIntegrationDialog', () => {
    afterEach(cleanup)

    it('disables every control while integration is running', () => {
        render(
            <AppThemeProvider>
                <WorktreeIntegrationDialog
                    busy
                    commitMessage="F-1: Card"
                    deleteBranch={false}
                    onClose={vi.fn()}
                    onCommitMessageChange={vi.fn()}
                    onDeleteBranchChange={vi.fn()}
                    onIntegrate={vi.fn().mockResolvedValue(undefined)}
                    open
                />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('textbox')).toBeDisabled()
        expect(screen.getByRole('checkbox', { name: 'Delete branch' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Integrate' })).toBeDisabled()
    })
})
