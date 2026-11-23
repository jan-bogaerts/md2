import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { projectFolderGitInclusionService } from '../services/project/project_folder_git_inclusion_service'
import { ProjectFolderGitRemovalDialog } from './project_folder_git_removal_dialog'

function requestRemoval() {
    let confirmation: Promise<boolean> = Promise.resolve(false)
    act(() => {
        confirmation = projectFolderGitInclusionService.requestRemovalConfirmation('design')
    })

    return confirmation
}

describe('ProjectFolderGitRemovalDialog', () => {
    afterEach(() => {
        projectFolderGitInclusionService.cancelRemoval()
        cleanup()
    })

    it('explains that tracked files leave the Git index but stay on disk', () => {
        render(<ProjectFolderGitRemovalDialog />)
        void requestRemoval()

        expect(screen.getByRole('dialog', { name: 'Keep project folder out of Git?' })).toHaveTextContent(
            'Git currently tracks files in design. MD² will remove the folder from the Git index, add it to .gitignore, and commit that change. The files stay on disk.',
        )
    })

    it('resolves the confirmation when the user accepts', async () => {
        render(<ProjectFolderGitRemovalDialog />)
        const confirmation = requestRemoval()

        await userEvent.click(screen.getByRole('button', { name: 'Remove from Git' }))

        await expect(confirmation).resolves.toBe(true)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('rejects the removal when the user cancels', async () => {
        render(<ProjectFolderGitRemovalDialog />)
        const confirmation = requestRemoval()

        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await expect(confirmation).resolves.toBe(false)
    })
})
