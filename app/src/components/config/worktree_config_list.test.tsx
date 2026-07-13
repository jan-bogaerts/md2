import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { worktreeService } from '../../services/worktree_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { WorktreeConfigList } from './worktree_config_list'

const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\primary' }
const first: WorktreeRecord = { branch: 'one', error: null, path: 'C:\\one', valid: true }
const second: WorktreeRecord = { branch: 'two', error: null, path: 'C:\\two', valid: true }

describe('WorktreeConfigList', () => {
    afterEach(() => {
        cleanup()
        worktreeService.clear()
    })

    it('displays ordered folders, adds selections and unregisters without deleting Git resources', async () => {
        const storage = {
            loadWorktrees: vi.fn(async () => [first]),
            selectWorktreeFolder: vi.fn(async () => second),
        } as unknown as StorageService
        worktreeService.init({ projectProvider: () => project, storageProvider: () => storage })
        await worktreeService.load(project)
        worktreeService.loadDraft()

        render(<AppThemeProvider><WorktreeConfigList /></AppThemeProvider>)
        expect(screen.getByText('C:\\one')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Register linked worktree' }))
        expect(await screen.findByText('C:\\two')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Unregister worktree 1' }))

        await waitFor(() => expect(worktreeService.getDraft()).toEqual([second]))
        expect(storage.selectWorktreeFolder).toHaveBeenCalledWith(['C:\\one'])
    })
})
