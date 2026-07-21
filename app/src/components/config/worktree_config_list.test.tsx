import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { worktreeService } from '../../services/project/worktree_service'
import { createDeferred } from '../../services/test_support/data_service_test_support'
import { AppThemeProvider } from '../../theme/theme_provider'
import { WorktreeConfigList } from './worktree_config_list'

const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\primary' }
const first: WorktreeRecord = { branch: 'one', error: null, path: 'C:\\one', valid: true }
const second: WorktreeRecord = { branch: 'two', error: null, path: 'C:\\two', valid: true }

function initWorktreeService(storage: StorageService) {
    worktreeService.init({
        assignCardWorktree: vi.fn(),
        cardSeparatorProvider: () => '-',
        projectProvider: () => project,
        snapshotProvider: () => null,
        storageProvider: () => storage,
    })
}

describe('WorktreeConfigList', () => {
    afterEach(() => {
        cleanup()
        worktreeService.clear()
    })

    it('adds and removes Git worktrees immediately', async () => {
        const storage = {
            addWorktree: vi.fn(async () => [first, second]),
            loadWorktrees: vi.fn(async () => [first]),
            removeWorktree: vi.fn(async () => [second]),
        } as unknown as StorageService
        initWorktreeService(storage)
        await worktreeService.load(project)

        render(<AppThemeProvider><WorktreeConfigList /></AppThemeProvider>)
        expect(screen.getByText('C:\\one')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Add linked worktree' }))
        expect(await screen.findByText('C:\\two')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Remove worktree 1' }))
        expect(screen.getByText(/Git will remove the checkout folder C:\\one/u)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

        await waitFor(() => expect(worktreeService.getRecords()).toEqual([second]))
        expect(storage.removeWorktree).toHaveBeenCalledWith(project, first.path)
    })

    it('shows progress while creating a Git worktree', async () => {
        const pendingAddition = createDeferred<WorktreeRecord[]>()
        const storage = {
            addWorktree: vi.fn(() => pendingAddition.promise),
            loadWorktrees: vi.fn(async () => [first]),
        } as unknown as StorageService
        initWorktreeService(storage)
        await worktreeService.load(project)

        render(<AppThemeProvider><WorktreeConfigList /></AppThemeProvider>)
        fireEvent.click(screen.getByRole('button', { name: 'Add linked worktree' }))

        expect(await screen.findByRole('progressbar', { name: 'Creating linked worktree' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add linked worktree' })).toBeDisabled()

        pendingAddition.resolve([first, second])
        await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Creating linked worktree' })).not.toBeInTheDocument())
    })
})
