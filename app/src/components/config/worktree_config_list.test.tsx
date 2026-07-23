import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
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
        flushPendingChanges: vi.fn(async () => undefined),
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
        let callback: ((state: {
            error: null
            primaryStatus: null
            project: ProjectReference
            records: WorktreeRecord[]
        }) => void) | null = null
        const storage = {
            addWorktree: vi.fn(async () => {
                callback?.({ error: null, primaryStatus: null, project, records: [first, second] })
                return true
            }),
            onWorktreesChanged: vi.fn((listener) => {
                callback = listener
                listener({ error: null, primaryStatus: null, project, records: [first] })
                return vi.fn()
            }),
            removeWorktree: vi.fn(async () => callback?.({ error: null, primaryStatus: null, project, records: [second] })),
        } as unknown as StorageService
        initWorktreeService(storage)

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
        const pendingAddition = createDeferred<boolean>()
        const storage = {
            addWorktree: vi.fn(() => pendingAddition.promise),
            onWorktreesChanged: vi.fn((listener) => {
                listener({ error: null, primaryStatus: null, project, records: [first] })
                return vi.fn()
            }),
        } as unknown as StorageService
        initWorktreeService(storage)

        render(<AppThemeProvider><WorktreeConfigList /></AppThemeProvider>)
        fireEvent.click(screen.getByRole('button', { name: 'Add linked worktree' }))

        expect(await screen.findByRole('progressbar', { name: 'Creating linked worktree' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add linked worktree' })).toBeDisabled()

        pendingAddition.resolve(true)
        await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Creating linked worktree' })).not.toBeInTheDocument())
    })
})
