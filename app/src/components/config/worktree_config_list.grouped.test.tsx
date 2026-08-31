import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { createDeferred } from '../../services/test_support/data_service_test_support'
import { AppThemeProvider } from '../../theme/theme_provider'
import { WorktreeConfigList } from './worktree_config_list'

const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\primary' }
const first: WorktreeRecord = {
    branch: 'one', error: null, parkingBranch: 'md2/parking/one', path: 'C:\\one',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}
const second: WorktreeRecord = {
    branch: 'two', error: null, parkingBranch: 'md2/parking/two', path: 'C:\\two',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

function initWorktreeService(storage: StorageService) {
    worktreeService.init({
        assignCardWorktree: vi.fn(),
        cardSeparatorProvider: () => '-',
        clearCardBranch: vi.fn(),
        flushPendingChanges: vi.fn(async () => undefined),
        projectFolderProvider: () => 'design',
        projectProvider: () => project,
        snapshotProvider: () => null,
        storageProvider: () => storage,
        unassignCardWorktree: vi.fn(),
    })
}

describe('WorktreeConfigList', () => {
    afterEach(() => {
        cleanup()
        worktreeService.clear()
        vi.restoreAllMocks()
    })

    it('shows additions and removals as pending without mutating Git', async () => {
        const storage = {
            addWorktree: vi.fn(async () => undefined),
            onWorktreesChanged: vi.fn((listener) => {
                listener({ error: null, primaryStatus: null, project, records: [first] })
                return vi.fn()
            }),
            removeWorktree: vi.fn(async () => undefined),
            selectWorktreeFolder: vi.fn(async () => second.path),
        } as unknown as StorageService
        initWorktreeService(storage)
        worktreeService.startDraft()

        render(<AppThemeProvider><WorktreeConfigList /></AppThemeProvider>)
        expect(screen.getByText('C:\\one')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Add linked worktree' }))
        expect(await screen.findByText('C:\\two')).toBeInTheDocument()
        expect(screen.getByText('Pending addition')).toBeInTheDocument()
        expect(storage.addWorktree).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Remove worktree 1' }))
        const removeDialog = screen.getByRole('dialog', { name: 'Remove linked worktree?' })
        expect(within(removeDialog).getByText(/after Save/u)).toBeInTheDocument()
        fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove' }))

        expect(screen.getByText('Pending removal')).toBeInTheDocument()
        expect(storage.removeWorktree).not.toHaveBeenCalled()

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Remove linked worktree?' })).not.toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Remove worktree 2' }))
        expect(screen.queryByText('C:\\two')).not.toBeInTheDocument()
    })

    it('shows progress while selecting a worktree folder', async () => {
        const pendingSelection = createDeferred<string | null>()
        const storage = {
            onWorktreesChanged: vi.fn((listener) => {
                listener({ error: null, primaryStatus: null, project, records: [first] })
                return vi.fn()
            }),
            selectWorktreeFolder: vi.fn(() => pendingSelection.promise),
        } as unknown as StorageService
        initWorktreeService(storage)
        worktreeService.startDraft()

        render(<AppThemeProvider><WorktreeConfigList /></AppThemeProvider>)
        fireEvent.click(screen.getByRole('button', { name: 'Add linked worktree' }))

        expect(await screen.findByRole('progressbar', { name: 'Selecting linked worktree folder' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add linked worktree' })).toBeDisabled()

        pendingSelection.resolve(null)
        await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Selecting linked worktree folder' })).not.toBeInTheDocument())
    })

    it('shows primary-folder rejection without reporting an application error', async () => {
        const storage = {
            onWorktreesChanged: vi.fn((listener) => {
                listener({ error: null, primaryStatus: null, project, records: [first] })
                return vi.fn()
            }),
            selectWorktreeFolder: vi.fn(async () => 'c:/PRIMARY/'),
        } as unknown as StorageService
        const displayError = vi.spyOn(dialogService, 'displayError')
        const reportError = vi.spyOn(dialogService, 'error')
        initWorktreeService(storage)
        worktreeService.startDraft()

        render(<AppThemeProvider><WorktreeConfigList /></AppThemeProvider>)
        fireEvent.click(screen.getByRole('button', { name: 'Add linked worktree' }))

        await waitFor(() => expect(displayError).toHaveBeenCalledWith(
            'Primary project folder is already the primary worktree. Choose a different folder for the linked worktree.',
            { title: 'Linked worktree not added' },
        ))
        expect(reportError).not.toHaveBeenCalled()
        expect(screen.queryByText('c:/PRIMARY/')).not.toBeInTheDocument()
    })
})
